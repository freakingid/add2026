// test-achievements.js — headless Node.js tests for events.js + achievements.js
// Run: node test-achievements.js

// Stub globalThis.localStorage (not available in Node).
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};

// Stub Date.now so banner timestamps are stable.
const _realDateNow = Date.now.bind(Date);

import('./src/events.js').then(events => {
  return import('./src/achievements.js').then(ach => {
    const { emit, on, off } = events;
    const { initAchievements, popAchievementBanner } = ach;

    let passed = 0;
    let failed = 0;

    function assert(condition, label) {
      if (condition) {
        console.log(`  ✓ ${label}`);
        passed++;
      } else {
        console.error(`  ✗ ${label}`);
        failed++;
      }
    }

    console.log('\n--- events.js basic tests ---');

    // 1. emit to an unregistered event is a no-op
    let threw = false;
    try { emit('no:listeners', { x: 1 }); } catch { threw = true; }
    assert(!threw, 'emit with no listeners does not throw');

    // 2. on/emit basic delivery
    let received = null;
    const handler = (p) => { received = p; };
    on('test:event', handler);
    emit('test:event', { val: 42 });
    assert(received?.val === 42, 'on/emit delivers payload');

    // 3. off removes handler
    off('test:event', handler);
    received = null;
    emit('test:event', { val: 99 });
    assert(received === null, 'off removes handler');

    // 4. duplicate on() does not double-fire
    let count = 0;
    const counter = () => count++;
    on('dup:test', counter);
    on('dup:test', counter);  // same reference — should deduplicate
    emit('dup:test', {});
    assert(count === 1, 'duplicate on() does not double-register');

    // 5. broken subscriber does not silence subsequent subscribers
    let secondFired = false;
    on('err:test', () => { throw new Error('deliberate'); });
    on('err:test', () => { secondFired = true; });
    emit('err:test', {});
    assert(secondFired, 'broken subscriber does not silence subsequent subscribers');

    console.log('\n--- achievements.js cmb_foam_party tests ---');

    initAchievements();

    // 6. Before threshold: banner queue is empty
    for (let i = 0; i < 499; i++) {
      emit('bolt:fired', { kind: 'standard', isTripleShotActive: false });
    }
    const bannerAt499 = popAchievementBanner();
    assert(bannerAt499 === null, 'popAchievementBanner() returns null before 500th shot');

    // 7. At exactly 500: banner is enqueued
    emit('bolt:fired', { kind: 'standard', isTripleShotActive: false });
    const banner500 = popAchievementBanner();
    assert(banner500 !== null, 'popAchievementBanner() returns non-null at 500th shot');

    // 8. Banner text contains the achievement name
    assert(typeof banner500?.text === 'string' && banner500.text.includes('Foam Party'),
      'banner text contains "Foam Party"');

    // 9. Banner has subtext
    assert(typeof banner500?.subtext === 'string' && banner500.subtext.length > 0,
      'banner has non-empty subtext');

    // 10. Banner has a timestamp
    assert(typeof banner500?.timestamp === 'number',
      'banner has a numeric timestamp');

    // 11. Queue drained — no second banner yet
    const bannerAfter = popAchievementBanner();
    assert(bannerAfter === null, 'queue is empty after banner is popped');

    // 12. Re-initialising resets counter (Bronze threshold won't fire again immediately)
    initAchievements();
    emit('bolt:fired', { kind: 'bounce', isTripleShotActive: true });
    const bannerReset = popAchievementBanner();
    assert(bannerReset === null, 'initAchievements() resets counter; single shot after reset yields no banner');

    console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
  });
}).catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
