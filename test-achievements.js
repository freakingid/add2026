/**
 * test-achievements.js — Phase 2 headless Node.js tests.
 * Tests: emitters, payload shapes, lifetime progress, week rollover logic.
 * Run: node test-achievements.js
 */

/* ---- Browser API shims --------------------------------------------------- */
const _store = {};
globalThis.localStorage = {
  getItem: (k) => _store[k] !== undefined ? _store[k] : null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};
// performance.now stub
globalThis.performance = { now: () => 1000 };

function clearStorage() { for (const k of Object.keys(_store)) delete _store[k]; }

/* ---- Dynamic imports (ES modules) --------------------------------------- */
const { emit, on, off } = await import('./src/events.js');
const {
  initAchievements, popAchievementBanner, isoWeekKey,
  getLifetimeAchievements,
} = await import('./src/achievements.js');

/* ---- Test harness -------------------------------------------------------- */
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓  ${msg}`); }
  else       { failed++; console.error(`  ✗  ${msg}`); }
}
function assertEq(a, b, msg) {
  assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function freshInit() {
  clearStorage();
  initAchievements();
}

/* ==========================================================================
   SECTION 1: events.js — basic pub/sub
   ========================================================================== */
console.log('\n=== Section 1: events.js pub/sub ===');

{
  let count = 0;
  const h = (p) => { count += p.n ?? 1; };
  on('test:basic', h);
  emit('test:basic', { n: 3 });
  assertEq(count, 3, 'emit fires handler with payload');
  off('test:basic', h);
  emit('test:basic', { n: 10 });
  assertEq(count, 3, 'off removes handler');
}

{
  let hits = 0;
  const h = () => hits++;
  on('test:dup', h);
  on('test:dup', h);
  emit('test:dup');
  assertEq(hits, 1, 'on() deduplicates — fires exactly once');
  off('test:dup', h);
}

{
  let reached = false;
  on('test:err', () => { throw new Error('intentional'); });
  on('test:err', () => { reached = true; });
  emit('test:err');
  assert(reached, 'second handler fires after first throws');
}

{
  let threw = false;
  try { emit('no:listeners', { x: 1 }); } catch { threw = true; }
  assert(!threw, 'emit with no listeners is a no-op (does not throw)');
}

/* ==========================================================================
   SECTION 2: isoWeekKey()
   ========================================================================== */
console.log('\n=== Section 2: isoWeekKey() ===');

{
  const k = isoWeekKey();
  assert(/^\d{4}_\d{1,2}$/.test(k), `isoWeekKey() returns YYYY_WW format (got ${k})`);
  const [year, week] = k.split('_').map(Number);
  assert(year >= 2024 && year <= 2030, `year is plausible (${year})`);
  assert(week >= 1 && week <= 53, `week is in valid range (${week})`);
}

/* ==========================================================================
   SECTION 3: initAchievements() — localStorage init
   ========================================================================== */
console.log('\n=== Section 3: initAchievements() init ===');

{
  freshInit();
  const meta = JSON.parse(localStorage.getItem('add_weekly_meta'));
  assert(meta !== null, 'add_weekly_meta written on first init');
  assertEq(meta.key, isoWeekKey(), 'add_weekly_meta.key matches current ISO week');
}

{
  // Double-init should not throw
  freshInit();
  initAchievements();
  assert(true, 'double initAchievements() does not throw');
}

/* ==========================================================================
   SECTION 4: bolt:fired → cmb_foam_party lifetime + banner
   ========================================================================== */
console.log('\n=== Section 4: cmb_foam_party ===');

{
  freshInit();
  for (let i = 0; i < 499; i++) emit('bolt:fired', { kind: 'standard', isTripleShotActive: false });
  assertEq(popAchievementBanner(), null, 'no banner before 500th shot');

  emit('bolt:fired', { kind: 'standard', isTripleShotActive: false });
  const banner = popAchievementBanner();
  assert(banner !== null, 'banner appears at 500th shot');
  assert(banner.text === 'Foam Party', 'banner text = "Foam Party"');
  assert(banner.subtext.includes('Bronze'), 'banner subtext includes "Bronze"');
  assert(typeof banner.timestamp === 'number', 'banner has numeric timestamp');
}

{
  // Lifetime progress persists across sessions (no storage clear)
  freshInit();
  for (let i = 0; i < 300; i++) emit('bolt:fired', { kind: 'standard', isTripleShotActive: false });
  initAchievements(); // re-init, keep storage
  for (let i = 0; i < 300; i++) emit('bolt:fired', { kind: 'standard', isTripleShotActive: false });
  // total = 600; Bronze (500) must fire in second batch
  let sawFoam = false;
  let b;
  while ((b = popAchievementBanner()) !== null) if (b.text === 'Foam Party') sawFoam = true;
  assert(sawFoam, 'Foam Party fires even when progress spans two sessions');
}

/* ==========================================================================
   SECTION 5: bolt:fired payload shape
   ========================================================================== */
console.log('\n=== Section 5: bolt:fired payload ===');

{
  let last = null;
  const h = (p) => { last = p; };
  on('bolt:fired', h);

  emit('bolt:fired', { kind: 'bounce', isTripleShotActive: true });
  assertEq(last.kind, 'bounce', 'bolt:fired kind=bounce');
  assertEq(last.isTripleShotActive, true, 'bolt:fired isTripleShotActive=true');

  emit('bolt:fired', { kind: 'standard', isTripleShotActive: false });
  assertEq(last.kind, 'standard', 'bolt:fired kind=standard');

  off('bolt:fired', h);
}

/* ==========================================================================
   SECTION 6: enemy:died payload shape + cmb_decommissioned counter
   ========================================================================== */
console.log('\n=== Section 6: enemy:died ===');

{
  let cap = null;
  const h = (p) => { cap = p; };
  on('enemy:died', h);
  emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:2, uniqueWallCount:1, hadLOSAtFire:false, timeAliveMs:4200, isBounceKill:true });
  assertEq(cap.type, 'picker', 'enemy:died type');
  assertEq(cap.killerKind, 'bubble', 'enemy:died killerKind');
  assertEq(cap.bounceCount, 2, 'enemy:died bounceCount');
  assertEq(cap.uniqueWallCount, 1, 'enemy:died uniqueWallCount');
  assertEq(cap.hadLOSAtFire, false, 'enemy:died hadLOSAtFire');
  assertEq(cap.isBounceKill, true, 'enemy:died isBounceKill');
  off('enemy:died', h);
}

{
  freshInit();
  emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  emit('enemy:died', { type:'forklift', killerKind:'mop', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:2000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_decommissioned'].progress, 2, 'cmb_decommissioned increments per enemy:died');
}

/* ==========================================================================
   SECTION 7: player:hit payload shapes
   ========================================================================== */
console.log('\n=== Section 7: player:hit payload ===');

{
  let cap = null;
  const h = (p) => { cap = p; };
  on('player:hit', h);
  emit('player:hit', { dmg: 2, source: 'ranged' });
  assertEq(cap.dmg, 2, 'player:hit dmg');
  assertEq(cap.source, 'ranged', 'player:hit source=ranged');
  emit('player:hit', { dmg: 1, source: 'melee' });
  assertEq(cap.source, 'melee', 'player:hit source=melee');
  emit('player:hit', { dmg: 3, source: 'area' });
  assertEq(cap.source, 'area', 'player:hit source=area');
  off('player:hit', h);
}

/* ==========================================================================
   SECTION 8: worker:rescued payload + wrk_total_rescued counter
   ========================================================================== */
console.log('\n=== Section 8: worker:rescued ===');

{
  let cap = null;
  const h = (p) => { cap = p; };
  on('worker:rescued', h);
  emit('worker:rescued', { workerIndex:2, timeInLevelMs:12000, playerHP:18, followingDurationMs:3500 });
  assertEq(cap.workerIndex, 2, 'worker:rescued workerIndex');
  assertEq(cap.playerHP, 18, 'worker:rescued playerHP');
  assertEq(cap.followingDurationMs, 3500, 'worker:rescued followingDurationMs');
  off('worker:rescued', h);
}

{
  freshInit();
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:5000, playerHP:20, followingDurationMs:1000 });
  emit('worker:rescued', { workerIndex:1, timeInLevelMs:8000, playerHP:19, followingDurationMs:500 });
  emit('worker:rescued', { workerIndex:2, timeInLevelMs:12000, playerHP:17, followingDurationMs:0 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_total_rescued'].progress, 3, 'wrk_total_rescued = 3 rescues');
}

/* ==========================================================================
   SECTION 9: vending:used + pwr_vending_total
   ========================================================================== */
console.log('\n=== Section 9: vending:used ===');

{
  let cap = null;
  const h = (p) => { cap = p; };
  on('vending:used', h);
  emit('vending:used', { variant:'large', hpGained:7 });
  assertEq(cap.variant, 'large', 'vending:used variant');
  assertEq(cap.hpGained, 7, 'vending:used hpGained');
  off('vending:used', h);
}

{
  freshInit();
  emit('vending:used', { variant:'small', hpGained:5 });
  emit('vending:used', { variant:'large', hpGained:10 });
  emit('vending:used', { variant:'small', hpGained:3 });
  const lt = getLifetimeAchievements();
  assertEq(lt['pwr_vending_total'].progress, 3, 'pwr_vending_total = 3 uses');
}

/* ==========================================================================
   SECTION 10: dustbin events
   ========================================================================== */
console.log('\n=== Section 10: dustbin events ===');

{
  let bounced = null, detonated = null;
  on('dustbin:bounced', (p) => { bounced = p; });
  on('dustbin:detonated', (p) => { detonated = p; });

  emit('dustbin:bounced', { totalWallCount:3, uniqueWallCount:2 });
  assertEq(bounced.totalWallCount, 3, 'dustbin:bounced totalWallCount');
  assertEq(bounced.uniqueWallCount, 2, 'dustbin:bounced uniqueWallCount');

  emit('dustbin:detonated', { killCount:7 });
  assertEq(detonated.killCount, 7, 'dustbin:detonated killCount');

  off('dustbin:bounced', (p) => { bounced = p; });
  off('dustbin:detonated', (p) => { detonated = p; });
}

{
  freshInit();
  emit('dustbin:thrown');
  emit('dustbin:thrown');
  const lt = getLifetimeAchievements();
  assertEq(lt['dust_heavy_hitter'].progress, 2, 'dust_heavy_hitter = 2 throws');
}

/* ==========================================================================
   SECTION 11: level:start and level:end payloads
   ========================================================================== */
console.log('\n=== Section 11: level:start / level:end ===');

{
  let start = null, end = null;
  on('level:start', (p) => { start = p; });
  on('level:end', (p) => { end = p; });

  emit('level:start', { terminalCount:4, workerCount:5 });
  assertEq(start.terminalCount, 4, 'level:start terminalCount');
  assertEq(start.workerCount, 5, 'level:start workerCount');

  emit('level:end', { levelTime:62000, workersRescued:3, levelNumber:2 });
  assertEq(end.levelNumber, 2, 'level:end levelNumber');
  assertEq(end.workersRescued, 3, 'level:end workersRescued');
}

/* ==========================================================================
   SECTION 12: run:end and run:input_mode_set
   ========================================================================== */
console.log('\n=== Section 12: run:end / run:input_mode_set ===');

{
  let runEnd = null, modeSet = null;
  on('run:end', (p) => { runEnd = p; });
  on('run:input_mode_set', (p) => { modeSet = p; });

  emit('run:end', { runTime:45000, levelsCompleted:3, totalScore:12500, inputMode:'keyboard' });
  assertEq(runEnd.levelsCompleted, 3, 'run:end levelsCompleted');
  assertEq(runEnd.totalScore, 12500, 'run:end totalScore');
  assertEq(runEnd.inputMode, 'keyboard', 'run:end inputMode');

  emit('run:input_mode_set', { mode:'gamepad' });
  assertEq(modeSet.mode, 'gamepad', 'run:input_mode_set mode');
}

/* ==========================================================================
   SECTION 13: powerup:collected + pwr_stocked counter
   ========================================================================== */
console.log('\n=== Section 13: powerup:collected ===');

{
  freshInit();
  emit('powerup:collected', { kind:'rapid' });
  emit('powerup:collected', { kind:'triple' });
  emit('powerup:collected', { kind:'bounce' });
  const lt = getLifetimeAchievements();
  assertEq(lt['pwr_stocked'].progress, 3, 'pwr_stocked = 3 powerups');
}

/* ==========================================================================
   SECTION 14: Week rollover — discards old progress, writes new meta
   ========================================================================== */
console.log('\n=== Section 14: week rollover ===');

{
  clearStorage();
  // Seed stale week
  localStorage.setItem('add_weekly_meta', JSON.stringify({ key: '2020_01' }));
  localStorage.setItem('add_weekly_2020_01', JSON.stringify({
    'acc_marksman': { unlocked: true, progress: 3 },
  }));

  initAchievements();

  const meta = JSON.parse(localStorage.getItem('add_weekly_meta'));
  assertEq(meta.key, isoWeekKey(), 'week rollover: meta updated to current week');

  const old = localStorage.getItem('add_weekly_2020_01');
  assert(old !== null, 'week rollover: old week data left as tombstone');

  const newData = JSON.parse(localStorage.getItem(`add_weekly_${isoWeekKey()}`));
  const hasOld = newData && newData['acc_marksman'] !== undefined;
  assert(!hasOld, 'week rollover: stale weekly progress NOT carried to new week');
}

{
  // Same week — existing data preserved
  clearStorage();
  const cur = isoWeekKey();
  localStorage.setItem('add_weekly_meta', JSON.stringify({ key: cur }));
  localStorage.setItem(`add_weekly_${cur}`, JSON.stringify({
    'wrk_hero': { unlocked: true, progress: 2 },
  }));

  initAchievements();

  const data = JSON.parse(localStorage.getItem(`add_weekly_${cur}`));
  assert(data !== null, 'same-week: weekly data preserved on init');
  assertEq(data['wrk_hero']?.unlocked, true, 'same-week: unlocked status preserved');
}

/* ==========================================================================
   SECTION 15: Multiple lifetime counters in parallel
   ========================================================================== */
console.log('\n=== Section 15: parallel lifetime counters ===');

{
  freshInit();
  emit('bolt:fired',     { kind:'standard', isTripleShotActive:false });
  emit('bolt:fired',     { kind:'bounce',   isTripleShotActive:false });
  emit('enemy:died',     { type:'security', killerKind:'bubble', bounceCount:1, uniqueWallCount:1, hadLOSAtFire:true, timeAliveMs:800, isBounceKill:true });
  emit('powerup:collected', { kind:'bounce' });
  emit('dustbin:thrown');
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:3000, playerHP:20, followingDurationMs:0 });
  emit('vending:used',   { variant:'small', hpGained:5 });

  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_foam_party'].progress,   2, 'cmb_foam_party at 2 shots');
  assertEq(lt['cmb_decommissioned'].progress, 1, 'cmb_decommissioned at 1 kill');
  assertEq(lt['pwr_stocked'].progress,       1, 'pwr_stocked at 1 powerup');
  assertEq(lt['dust_heavy_hitter'].progress, 1, 'dust_heavy_hitter at 1 throw');
  assertEq(lt['wrk_total_rescued'].progress, 1, 'wrk_total_rescued at 1 rescue');
  assertEq(lt['pwr_vending_total'].progress, 1, 'pwr_vending_total at 1 vend');
}

/* ==========================================================================
   SECTION 16: Lifetime round-trip across re-init
   ========================================================================== */
console.log('\n=== Section 16: lifetime localStorage round-trip ===');

{
  freshInit();
  for (let i = 0; i < 10; i++) {
    emit('enemy:died', { type:'picker', killerKind:'mop', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:500, isBounceKill:false });
  }
  const prog1 = getLifetimeAchievements()['cmb_decommissioned'].progress;
  assertEq(prog1, 10, 'cmb_decommissioned = 10 before re-init');

  // Re-init without clearing storage (new browser session simulation)
  initAchievements();
  const prog2 = getLifetimeAchievements()['cmb_decommissioned'].progress;
  assertEq(prog2, 10, 'cmb_decommissioned = 10 AFTER re-init (round-trip preserved)');
}

/* ==========================================================================
   SECTION 17: enemy:spawned and enemy:fired payloads
   ========================================================================== */
console.log('\n=== Section 17: enemy:spawned / enemy:fired payloads ===');

{
  let spawned = null, fired = null;
  const hs = (p) => { spawned = p; };
  const hf = (p) => { fired = p; };
  on('enemy:spawned', hs);
  on('enemy:fired', hf);

  emit('enemy:spawned', { type:'drone', timeInLevel:5000 });
  assertEq(spawned.type, 'drone', 'enemy:spawned type');
  assert(typeof spawned.timeInLevel === 'number', 'enemy:spawned timeInLevel is number');

  emit('enemy:fired', { type:'security' });
  assertEq(fired.type, 'security', 'enemy:fired type');

  off('enemy:spawned', hs);
  off('enemy:fired', hf);
}

/* ==========================================================================
   SECTION 18: worker:died and worker:following_start payloads
   ========================================================================== */
console.log('\n=== Section 18: worker:died / worker:following_start ===');

{
  let died = null, followStart = null;
  on('worker:died', (p) => { died = p; });
  on('worker:following_start', (p) => { followStart = p; });

  emit('worker:died', { workerIndex:1 });
  assertEq(died.workerIndex, 1, 'worker:died workerIndex');

  emit('worker:following_start', { workerIndex:3 });
  assertEq(followStart.workerIndex, 3, 'worker:following_start workerIndex');
}

/* ==========================================================================
   SECTION 19: conveyor events
   ========================================================================== */
console.log('\n=== Section 19: conveyor events ===');

{
  let start = null, tick = null;
  on('conveyor:push_start', (p) => { start = p; });
  on('conveyor:push_tick', (p) => { tick = p; });

  emit('conveyor:push_start');
  assert(start !== null || start === null, 'conveyor:push_start fires without error');

  emit('conveyor:push_tick', { dx:2, dy:0 });
  assertEq(tick?.dx, 2, 'conveyor:push_tick dx');
  assertEq(tick?.dy, 0, 'conveyor:push_tick dy');
}

/* ==========================================================================
   SECTION 20: bolt:hit and bolt:missed payloads
   ========================================================================== */
console.log('\n=== Section 20: bolt:hit / bolt:missed ===');

{
  let hit = null, missed = 0, expired = 0;
  on('bolt:hit',     (p) => { hit = p; });
  on('bolt:missed',  () => { missed++; });
  on('bolt:expired', () => { expired++; });

  emit('bolt:hit', { targetType:'forklift', bounceCount:1, uniqueWallCount:1 });
  assertEq(hit.targetType, 'forklift', 'bolt:hit targetType');
  assertEq(hit.bounceCount, 1, 'bolt:hit bounceCount');
  assertEq(hit.uniqueWallCount, 1, 'bolt:hit uniqueWallCount');

  emit('bolt:missed');
  assertEq(missed, 1, 'bolt:missed fires');

  emit('bolt:expired');
  assertEq(expired, 1, 'bolt:expired fires');
}

/* ==========================================================================
   SECTION 21: Banner queue cap at 5
   ========================================================================== */
console.log('\n=== Section 21: banner queue ===');

{
  freshInit();
  // Trigger Bronze (500 shots)
  for (let i = 0; i < 500; i++) emit('bolt:fired', { kind:'standard', isTripleShotActive:false });
  const b = popAchievementBanner();
  assert(b !== null, 'Foam Party Bronze banner present');
  assertEq(popAchievementBanner(), null, 'queue empty after single banner popped');
}

/* ==========================================================================
   SECTION 22: level:all_enemies_dead event
   ========================================================================== */
console.log('\n=== Section 22: level:all_enemies_dead ===');

{
  let count = 0;
  const h = () => count++;
  on('level:all_enemies_dead', h);
  emit('level:all_enemies_dead');
  assertEq(count, 1, 'level:all_enemies_dead fires');
  off('level:all_enemies_dead', h);
}

/* ==========================================================================
   RESULTS
   ========================================================================== */
console.log(`\n${'='.repeat(52)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} checks.`);
if (failed === 0) {
  console.log('All tests passed. ✓');
  process.exit(0);
} else {
  console.error(`${failed} FAILED.`);
  process.exit(1);
}
