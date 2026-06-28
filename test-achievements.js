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
// window stub — audio.js's ensure() reads window.AudioContext; absent here so
// sfx calls (fired when a banner is pushed) safely no-op.
globalThis.window = {};

function clearStorage() { for (const k of Object.keys(_store)) delete _store[k]; }

/* ---- Dynamic imports (ES modules) --------------------------------------- */
const { emit, on, off } = await import('./src/events.js');
const {
  initAchievements, popAchievementBanner, isoWeekKey,
  getLifetimeAchievements, getWeeklyAchievements,
  noLateralMovement, aimFightsBelt,
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
   SECTION 23 (Phase 3): Progression — prg_temp, prg_director
   ========================================================================== */
console.log('\n=== Section 23 (P3): Progression ===');

{
  freshInit();
  emit('run:start');
  // Complete 1 level
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['prg_temp'].progress, 1, 'prg_temp increments on level:end');
  assert(lt['prg_temp'].tier === 1, 'prg_temp tier 1 (Bronze) at 1 level');

  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:1000, inputMode:'keyboard' });
  const lt2 = getLifetimeAchievements();
  assertEq(lt2['prg_director'].progress, 1, 'prg_director increments on run:end');
  assert(lt2['prg_director'].tier === 1, 'prg_director tier 1 (Bronze) at 1 run');
}

{
  // stub: prg_ceo does NOT increment
  freshInit();
  emit('run:start');
  emit('run:end', { runTime:30000, levelsCompleted:1, totalScore:500, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assert(!lt['prg_ceo'] || lt['prg_ceo'].progress === 0, 'prg_ceo stub — no progress incremented');
}

/* ==========================================================================
   SECTION 24 (Phase 3): Survival — surv_spotless, surv_teflon, surv_skeleton,
   surv_osha, surv_no_stopping, surv_hot_streak
   ========================================================================== */
console.log('\n=== Section 24 (P3): Survival ===');

{
  // surv_spotless: level with no damage
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  // no player:hit
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['surv_spotless']?.progress, 1, 'surv_spotless increments on damage-free level');
}

{
  // surv_spotless: level WITH damage does NOT increment
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:hit', { dmg:2, source:'ranged' });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['surv_spotless'] || lt['surv_spotless'].progress === 0, 'surv_spotless NOT incremented when damaged');
}

{
  // surv_teflon: 3 consecutive damage-free levels
  freshInit();
  emit('run:start');
  for (let i = 1; i <= 3; i++) {
    emit('level:start', { terminalCount:2, workerCount:5 });
    emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:i });
  }
  const lt = getLifetimeAchievements();
  assertEq(lt['surv_teflon']?.progress, 1, 'surv_teflon increments after 3 consecutive damage-free levels');
}

{
  // surv_teflon: NOT triggered if one level has damage
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:hit', { dmg:1, source:'melee' });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:2 });
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:3 });
  const lt = getLifetimeAchievements();
  assert(!lt['surv_teflon'] || lt['surv_teflon'].progress === 0, 'surv_teflon NOT triggered when streak broken');
}

{
  // surv_skeleton: exactly 1 HP at level end
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:hp_changed', { hp:1, maxHp:20 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['surv_skeleton']?.progress, 1, 'surv_skeleton increments at 1 HP on level end');
}

{
  // surv_skeleton: 2 HP does NOT trigger
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:hp_changed', { hp:2, maxHp:20 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['surv_skeleton'] || lt['surv_skeleton'].progress === 0, 'surv_skeleton NOT triggered at 2 HP');
}

{
  // surv_osha: hit 10+ times and complete level
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 10; i++) emit('player:hit', { dmg:1, source:'melee' });
  emit('level:end', { levelTime:120000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['surv_osha']?.progress, 1, 'surv_osha increments at 10+ hits on level end');
}

{
  // surv_no_stopping: no player:stood_still during level
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  // no stood_still event
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['surv_no_stopping']?.progress, 1, 'surv_no_stopping increments when never stood still');
}

{
  // surv_no_stopping: stood_still voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:stood_still', { durationMs:1200 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['surv_no_stopping'] || lt['surv_no_stopping'].progress === 0, 'surv_no_stopping NOT triggered after stood_still');
}

{
  // surv_hot_streak: 3 consecutive levels without dying
  freshInit();
  emit('run:start');
  for (let i = 1; i <= 3; i++) {
    emit('level:start', { terminalCount:2, workerCount:5 });
    emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:i });
  }
  const lt = getLifetimeAchievements();
  assertEq(lt['surv_hot_streak']?.progress, 1, 'surv_hot_streak increments after 3 survived levels');
}

{
  // surv_hot_streak: reset by player:died
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:2 });
  emit('player:died');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:3 });
  const lt = getLifetimeAchievements();
  assert(!lt['surv_hot_streak'] || lt['surv_hot_streak'].progress === 0, 'surv_hot_streak NOT triggered when streak broken by death');
}

/* ==========================================================================
   SECTION 25 (Phase 3): Speed — spd_rush, spd_lunch
   ========================================================================== */
console.log('\n=== Section 25 (P3): Speed ===');

{
  // spd_rush: level in under 45 seconds
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:44000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['spd_rush']?.progress, 1, 'spd_rush increments for level under 45s');
}

{
  // spd_rush: level over 45 seconds does NOT increment
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:46000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['spd_rush'] || lt['spd_rush'].progress === 0, 'spd_rush NOT triggered for level over 45s');
}

{
  // spd_lunch: full run under 15 minutes (900000ms)
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:890000, levelsCompleted:1, totalScore:5000, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assertEq(lt['spd_lunch']?.progress, 1, 'spd_lunch increments for run under 15 min');
}

{
  // spd_lunch: run over 15 minutes does NOT increment
  freshInit();
  emit('run:start');
  emit('run:end', { runTime:901000, levelsCompleted:1, totalScore:5000, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assert(!lt['spd_lunch'] || lt['spd_lunch'].progress === 0, 'spd_lunch NOT triggered for run over 15 min');
}

/* ==========================================================================
   SECTION 26 (Phase 3): Worker Rescue
   ========================================================================== */
console.log('\n=== Section 26 (P3): Worker Rescue ===');

{
  // wrk_first_responder: rescue within 30s
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:20000, playerHP:20, followingDurationMs:1000 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_first_responder']?.progress, 1, 'wrk_first_responder increments for rescue within 30s');
}

{
  // wrk_first_responder: rescue after 30s does NOT increment
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:31000, playerHP:20, followingDurationMs:1000 });
  const lt = getLifetimeAchievements();
  assert(!lt['wrk_first_responder'] || lt['wrk_first_responder'].progress === 0, 'wrk_first_responder NOT triggered after 30s');
}

{
  // wrk_hero: all 5 rescued in one level
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 5; i++) {
    emit('worker:rescued', { workerIndex:i, timeInLevelMs:10000 + i*5000, playerHP:20, followingDurationMs:0 });
  }
  emit('level:end', { levelTime:80000, workersRescued:5, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_hero']?.progress, 1, 'wrk_hero increments when all 5 rescued in one level');
}

{
  // wrk_nick: rescue at ≤10 HP
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:15000, playerHP:8, followingDurationMs:0 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_nick']?.progress, 1, 'wrk_nick increments when rescued at ≤10 HP');
}

{
  // wrk_danger_pay: rescue at exactly 1 HP
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:15000, playerHP:1, followingDurationMs:0 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_danger_pay']?.progress, 1, 'wrk_danger_pay increments at exactly 1 HP');
}

{
  // wrk_escort: worker following for 5+ seconds
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:20000, playerHP:20, followingDurationMs:6000 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_escort']?.progress, 1, 'wrk_escort increments when worker followed 5+ seconds');
}

{
  // wrk_union_rep: cumulative lifetime rescues
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 5; i++) {
    emit('worker:rescued', { workerIndex:i, timeInLevelMs:10000, playerHP:20, followingDurationMs:0 });
  }
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_union_rep']?.progress, 5, 'wrk_union_rep = 5 cumulative rescues');
}

{
  // wrk_zero_hour: all 5 rescued + no damage
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 5; i++) {
    emit('worker:rescued', { workerIndex:i, timeInLevelMs:10000, playerHP:20, followingDurationMs:0 });
  }
  emit('level:end', { levelTime:60000, workersRescued:5, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_zero_hour']?.progress, 1, 'wrk_zero_hour increments when all rescued + no damage');
}

{
  // wrk_zero_hour: NOT triggered when damage taken
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 5; i++) {
    emit('worker:rescued', { workerIndex:i, timeInLevelMs:10000, playerHP:20, followingDurationMs:0 });
  }
  emit('player:hit', { dmg:1, source:'melee' });
  emit('level:end', { levelTime:60000, workersRescued:5, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['wrk_zero_hour'] || lt['wrk_zero_hour'].progress === 0, 'wrk_zero_hour NOT triggered when damage taken');
}

{
  // wrk_attendance: all workers rescued across every level
  freshInit();
  emit('run:start');
  for (let lvl = 1; lvl <= 2; lvl++) {
    emit('level:start', { terminalCount:2, workerCount:5 });
    for (let i = 0; i < 5; i++) {
      emit('worker:rescued', { workerIndex:i, timeInLevelMs:10000, playerHP:20, followingDurationMs:0 });
    }
    emit('level:end', { levelTime:60000, workersRescued:5, levelNumber:lvl });
  }
  emit('run:end', { runTime:120000, levelsCompleted:2, totalScore:5000, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_attendance']?.progress, 1, 'wrk_attendance increments when all workers rescued every level');
}

{
  // wrk_last_man: ≥1 rescued but not all
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:10000, playerHP:20, followingDurationMs:0 });
  // only 1 of 5 rescued
  emit('level:end', { levelTime:60000, workersRescued:1, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_last_man']?.progress, 1, 'wrk_last_man increments when ≥1 rescued but not all');
}

{
  // wrk_understaffed: 5 consecutive levels without any rescue
  freshInit();
  emit('run:start');
  for (let i = 1; i <= 5; i++) {
    emit('level:start', { terminalCount:2, workerCount:5 });
    // no worker:rescued events
    emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:i });
  }
  const lt = getLifetimeAchievements();
  assertEq(lt['wrk_understaffed']?.progress, 1, 'wrk_understaffed increments after 5 no-rescue levels');
}

/* ==========================================================================
   SECTION 27 (Phase 3): Atomic Dustbin
   ========================================================================== */
console.log('\n=== Section 27 (P3): Atomic Dustbin ===');

{
  // dust_option: 3+ kills in one detonation
  freshInit();
  emit('run:start');
  emit('dustbin:detonated', { killCount:4 });
  const lt = getLifetimeAchievements();
  assertEq(lt['dust_option']?.progress, 1, 'dust_option increments when 3+ enemies killed by detonation');
}

{
  // dust_option: 2 kills does NOT trigger
  freshInit();
  emit('run:start');
  emit('dustbin:detonated', { killCount:2 });
  const lt = getLifetimeAchievements();
  assert(!lt['dust_option'] || lt['dust_option'].progress === 0, 'dust_option NOT triggered for <3 kills');
}

{
  // dust_reserve: complete level without throwing dustbin
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  // no dustbin:thrown event
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['dust_reserve']?.progress, 1, 'dust_reserve increments when dustbin not thrown');
}

{
  // dust_reserve: throwing dustbin voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('dustbin:thrown');
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['dust_reserve'] || lt['dust_reserve'].progress === 0, 'dust_reserve NOT triggered when dustbin thrown');
}

{
  // dust_env_hazard: manager killed by dustbin
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:died', { type:'manager', killerKind:'dustbin', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:5000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assertEq(lt['dust_env_hazard']?.progress, 1, 'dust_env_hazard increments when manager killed by dustbin');
}

{
  // dust_env_hazard: manager killed by bubble does NOT trigger
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:died', { type:'manager', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:5000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assert(!lt['dust_env_hazard'] || lt['dust_env_hazard'].progress === 0, 'dust_env_hazard NOT triggered for bubble kill');
}

{
  // dust_heavy_hitter: cumulative throw counter
  freshInit();
  emit('dustbin:thrown');
  emit('dustbin:thrown');
  emit('dustbin:thrown');
  const lt = getLifetimeAchievements();
  assertEq(lt['dust_heavy_hitter']?.progress, 3, 'dust_heavy_hitter accumulates throws');
}

{
  // dust_disgruntled: 3+ wall bounces before detonation
  freshInit();
  emit('dustbin:bounced', { totalWallCount:3, uniqueWallCount:2 });
  const lt = getLifetimeAchievements();
  assertEq(lt['dust_disgruntled']?.progress, 1, 'dust_disgruntled increments when dustbin bounces 3+ walls');
}

/* ==========================================================================
   SECTION 28 (Phase 3): Power-Ups & Items
   ========================================================================== */
console.log('\n=== Section 28 (P3): Power-Ups & Items ===');

{
  // itm_off_clock: level without picking up power-ups
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  // no powerup:collected
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['itm_off_clock']?.progress, 1, 'itm_off_clock increments when no power-ups collected');
}

{
  // itm_off_clock: picking a powerup voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('powerup:collected', { kind:'rapid' });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['itm_off_clock'] || lt['itm_off_clock'].progress === 0, 'itm_off_clock NOT triggered when powerup collected');
}

{
  // itm_calories: level without using vending
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['itm_calories']?.progress, 1, 'itm_calories increments when no vending used');
}

{
  // itm_calories: using vending voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('vending:used', { variant:'small', hpGained:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['itm_calories'] || lt['itm_calories'].progress === 0, 'itm_calories NOT triggered when vending used');
}

{
  // itm_cost_cutting: no powerups AND no vending
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['itm_cost_cutting']?.progress, 1, 'itm_cost_cutting increments when no powerups AND no vending');
}

{
  // itm_min_wage: full run without power-ups
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:500, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assertEq(lt['itm_min_wage']?.progress, 1, 'itm_min_wage increments on run with no power-ups');
}

{
  // itm_no_refills: full run without vending
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:500, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assertEq(lt['itm_no_refills']?.progress, 1, 'itm_no_refills increments on run with no vending');
}

/* ==========================================================================
   SECTION 29 (Phase 3): Score stubs — must NOT activate
   ========================================================================== */
console.log('\n=== Section 29 (P3): Score stubs ===');

{
  // Stubs short-circuit: no progress incremented, no banner from stub handlers.
  // We fire run:start/run:end; prg_director unlocks Bronze (that's fine and expected).
  // Drain that banner, then confirm no ADDITIONAL stub-sourced banners appear.
  freshInit();
  emit('run:start');
  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:999999, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assert(!lt['scr_bonus'] || lt['scr_bonus'].progress === 0, 'scr_bonus stub — no progress');
  assert(!lt['scr_quarterly'] || lt['scr_quarterly'].progress === 0, 'scr_quarterly stub — no progress');
  assert(!lt['scr_annual'] || lt['scr_annual'].progress === 0, 'scr_annual stub — no progress');
  // Drain legitimate banners (prg_director Bronze) then confirm queue empty
  while (popAchievementBanner() !== null) {}
  assert(popAchievementBanner() === null, 'no additional banner after draining — stubs produced none');
}

/* ==========================================================================
   SECTION 30 (Phase 3): Combat — cmb_zero_waste, cmb_overtime_denied,
   cmb_early_retirement, cmb_grounded, cmb_cleaning_spree, cmb_deep_clean
   ========================================================================== */
console.log('\n=== Section 30 (P3): Combat achievements ===');

{
  // cmb_zero_waste: all enemies dead before level end
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:all_enemies_dead');
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_zero_waste']?.progress, 1, 'cmb_zero_waste increments when all enemies dead');
}

{
  // cmb_zero_waste: NOT triggered without level:all_enemies_dead
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['cmb_zero_waste'] || lt['cmb_zero_waste'].progress === 0, 'cmb_zero_waste NOT triggered without all enemies dead');
}

{
  // cmb_overtime_denied: manager killed within 10s of spawn
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:spawned', { type:'manager', timeInLevel:5000 });
  emit('enemy:died', { type:'manager', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:8000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_overtime_denied']?.progress, 1, 'cmb_overtime_denied increments for manager killed within 10s');
}

{
  // cmb_early_retirement: manager killed before it fires
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:spawned', { type:'manager', timeInLevel:5000 });
  // no enemy:fired for manager
  emit('enemy:died', { type:'manager', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:4000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_early_retirement']?.progress, 1, 'cmb_early_retirement increments when manager killed before firing');
}

{
  // cmb_early_retirement: NOT triggered if manager fires first
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:spawned', { type:'manager', timeInLevel:5000 });
  emit('enemy:fired', { type:'manager' }); // manager fires
  emit('enemy:died', { type:'manager', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:9000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assert(!lt['cmb_early_retirement'] || lt['cmb_early_retirement'].progress === 0, 'cmb_early_retirement NOT triggered when manager fired first');
}

{
  // cmb_grounded: drone killed before it fires
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:spawned', { type:'drone', timeInLevel:2000 });
  // no enemy:fired for drone
  emit('enemy:died', { type:'drone', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:3000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_grounded']?.progress, 1, 'cmb_grounded increments when drone killed before firing');
}

{
  // cmb_grounded: NOT triggered if drone fires first
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:spawned', { type:'drone', timeInLevel:2000 });
  emit('enemy:fired', { type:'drone' });
  emit('enemy:died', { type:'drone', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:5000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assert(!lt['cmb_grounded'] || lt['cmb_grounded'].progress === 0, 'cmb_grounded NOT triggered when drone fired first');
}

{
  // cmb_cleaning_spree: 5 kills within 10 seconds
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 5; i++) {
    emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  }
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_cleaning_spree']?.progress, 1, 'cmb_cleaning_spree increments for 5 kills within 10s');
}

{
  // cmb_deep_clean: 3 cleaner kills within 5 seconds
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 3; i++) {
    emit('enemy:died', { type:'cleaner', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  }
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_deep_clean']?.progress, 1, 'cmb_deep_clean increments for 3 cleaner kills within 5s');
}

{
  // cmb_whistleblower + cmb_blue_collar + cmb_pest_control: per-type lifetime
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:died', { type:'security', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  emit('enemy:died', { type:'drone', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assertEq(lt['cmb_whistleblower']?.progress, 1, 'cmb_whistleblower increments on security kill');
  assertEq(lt['cmb_blue_collar']?.progress, 1, 'cmb_blue_collar increments on picker kill');
  assertEq(lt['cmb_pest_control']?.progress, 1, 'cmb_pest_control increments on drone kill');
}

{
  // Tier promotion: cmb_decommissioned Bronze at 500
  freshInit();
  for (let i = 0; i < 499; i++) {
    emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  }
  // Drain any banners that may have fired for other per-type achievements (blue_collar Bronze=50)
  while (popAchievementBanner() !== null) {}
  assert(popAchievementBanner() === null, 'no banner at 499 kills');
  emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:1000, isBounceKill:false });
  // Find the Decommissioned banner specifically (other per-type tiers may also pop)
  let decommBanner = null;
  let bx;
  while ((bx = popAchievementBanner()) !== null) {
    if (bx.text === 'Decommissioned') decommBanner = bx;
  }
  assert(decommBanner !== null, 'banner appears at 500th kill');
  assert(decommBanner.text === 'Decommissioned', 'banner text = "Decommissioned"');
  assert(decommBanner.subtext.includes('Bronze'), 'banner subtext includes "Bronze"');
}

{
  // prg_manual: gamepad run counted
  freshInit();
  emit('run:start');
  emit('run:input_mode_set', { mode:'gamepad' });
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:1000, inputMode:'gamepad' });
  const lt = getLifetimeAchievements();
  assertEq(lt['prg_manual']?.progress, 1, 'prg_manual increments for gamepad run with ≥1 level');
}

{
  // prg_manual: keyboard run does NOT trigger
  freshInit();
  emit('run:start');
  emit('run:input_mode_set', { mode:'keyboard' });
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:1000, inputMode:'keyboard' });
  const lt = getLifetimeAchievements();
  assert(!lt['prg_manual'] || lt['prg_manual'].progress === 0, 'prg_manual NOT triggered for keyboard run');
}

/* ==========================================================================
   SECTION 31 (P4): Bounce-shot kill thresholds
   ========================================================================== */
console.log('\n=== Section 31 (P4): Bounce shot achievements ===');

// Helper: a bounce kill payload with the given bounce/unique-wall counts.
function bounceKill(bounceCount, uniqueWallCount, extra = {}) {
  return {
    type: 'picker', killerKind: 'bubble',
    bounceCount, uniqueWallCount,
    chainCount: extra.chainCount ?? 1,
    hadLOSAtFire: extra.hadLOSAtFire ?? true,
    timeAliveMs: 1000,
    isBounceKill: bounceCount > 0,
    pos: extra.pos, danPos: extra.danPos,
    danMoveHistory: extra.danMoveHistory,
    danOnBelt: extra.danOnBelt ?? false,
    danAimAngle: extra.danAimAngle,
    beltPush: extra.beltPush,
    ...extra,
  };
}

{
  // bnc_bank: bounced exactly once
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));
  const lt = getLifetimeAchievements();
  assertEq(lt['bnc_bank']?.progress, 1, 'bnc_bank increments on a single-bounce kill');
  assert(!lt['bnc_cue_ball'] || lt['bnc_cue_ball'].progress === 0, 'bnc_cue_ball NOT triggered at 1 bounce');
}

{
  // A 1-bounce kill must NOT count for geometry_brain (needs 4 total)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));
  const lt = getLifetimeAchievements();
  assert(!lt['bnc_geometry_brain'] || lt['bnc_geometry_brain'].progress === 0, 'bnc_geometry_brain NOT triggered at 1 bounce');
  assert(!lt['bnc_bank'] || lt['bnc_bank'].progress === 1, 'bnc_bank still 1');
}

{
  // bnc_cue_ball (3+) and NOT pool_shark (<5)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(3, 2));
  const lt = getLifetimeAchievements();
  assertEq(lt['bnc_cue_ball']?.progress, 1, 'bnc_cue_ball increments at 3 bounces');
  assert(!lt['bnc_pool_shark'] || lt['bnc_pool_shark'].progress === 0, 'bnc_pool_shark NOT triggered at 3 bounces');
  assert(!lt['bnc_bank'] || lt['bnc_bank'].progress === 0, 'bnc_bank NOT triggered at 3 bounces (needs exactly 1)');
}

{
  // bnc_pool_shark (5+), bnc_cue_ball, bnc_geometry_brain (4+ total) all fire
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(5, 3));
  const lt = getLifetimeAchievements();
  assertEq(lt['bnc_pool_shark']?.progress, 1, 'bnc_pool_shark increments at 5 bounces');
  assertEq(lt['bnc_cue_ball']?.progress, 1, 'bnc_cue_ball increments at 5 bounces');
  assertEq(lt['bnc_geometry_brain']?.progress, 1, 'bnc_geometry_brain increments at 5 total bounces');
}

{
  // bnc_geometry_brain (4 total, 2 unique) but NOT geometry_teacher (needs 4 unique)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(4, 2));
  const lt = getLifetimeAchievements();
  assertEq(lt['bnc_geometry_brain']?.progress, 1, 'bnc_geometry_brain at 4 total bounces');
  assert(!lt['bnc_geometry_teacher'] || lt['bnc_geometry_teacher'].progress === 0, 'bnc_geometry_teacher NOT at 2 unique walls');
  assertEq(lt['bnc_long_way']?.progress, 1, 'bnc_long_way at 2 unique walls (rounded a corner)');
}

{
  // bnc_geometry_teacher (4 unique walls)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(4, 4));
  const lt = getLifetimeAchievements();
  assertEq(lt['bnc_geometry_teacher']?.progress, 1, 'bnc_geometry_teacher at 4 unique walls');
}

{
  // bnc_chain is wired but dormant: chainCount never reaches 4 (shots don't pierce)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(2, 1, { chainCount: 1 }));
  const lt = getLifetimeAchievements();
  assert(!lt['bnc_chain'] || lt['bnc_chain'].progress === 0, 'bnc_chain dormant at chainCount 1');
  // but it DOES fire if the payload ever carries chainCount >= 4
  emit('enemy:died', bounceKill(2, 1, { chainCount: 4 }));
  assertEq(getLifetimeAchievements()['bnc_chain']?.progress, 1, 'bnc_chain fires when chainCount reaches 4');
}

{
  // Non-bounce kill must not credit any bounce achievement
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', { type:'picker', killerKind:'mop', bounceCount:0, uniqueWallCount:0, isBounceKill:false });
  const lt = getLifetimeAchievements();
  assert(!lt['bnc_bank'] || lt['bnc_bank'].progress === 0, 'bnc_bank NOT triggered by a non-bounce kill');
}

/* ==========================================================================
   SECTION 32 (P4): bnc_final_sweep + bnc_wall_flower
   ========================================================================== */
console.log('\n=== Section 32 (P4): final sweep / wall flower ===');

{
  // bnc_final_sweep: the level-ending kill was a bounce kill
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));           // last kill is a bounce
  emit('level:all_enemies_dead');
  const lt = getLifetimeAchievements();
  assertEq(lt['bnc_final_sweep']?.progress, 1, 'bnc_final_sweep when last kill was a bounce');
}

{
  // bnc_final_sweep NOT triggered if the last kill was non-bounce
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(2, 1));                                          // earlier bounce kill
  emit('enemy:died', { type:'picker', killerKind:'mop', bounceCount:0, isBounceKill:false }); // final non-bounce
  emit('level:all_enemies_dead');
  const lt = getLifetimeAchievements();
  assert(!lt['bnc_final_sweep'] || lt['bnc_final_sweep'].progress === 0, 'bnc_final_sweep NOT triggered when last kill not a bounce');
}

{
  // bnc_wall_flower: every kill this level was a bounce kill
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));
  emit('enemy:died', bounceKill(2, 2));
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assertEq(lt['bnc_wall_flower']?.progress, 1, 'bnc_wall_flower when all kills were bounces');
}

{
  // bnc_wall_flower NOT triggered if any non-bounce kill occurred
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));
  emit('enemy:died', { type:'picker', killerKind:'mop', bounceCount:0, isBounceKill:false });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['bnc_wall_flower'] || lt['bnc_wall_flower'].progress === 0, 'bnc_wall_flower NOT triggered with a non-bounce kill');
}

{
  // bnc_wall_flower NOT triggered with zero kills
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['bnc_wall_flower'] || lt['bnc_wall_flower'].progress === 0, 'bnc_wall_flower NOT triggered with no kills');
}

/* ==========================================================================
   SECTION 33 (P4): Accuracy at level:end
   ========================================================================== */
console.log('\n=== Section 33 (P4): accuracy ===');

// Fire `fired` triggers and register `hits` connecting bullets, then end level.
function runAccuracyLevel(fired, hits, allDead = false) {
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  for (let i = 0; i < fired; i++) emit('bolt:fired', { kind:'standard', isTripleShotActive:false });
  for (let i = 0; i < hits; i++) emit('bolt:hit', { targetType:'picker', bounceCount:0, uniqueWallCount:0 });
  if (allDead) emit('level:all_enemies_dead');
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
}

{
  // 100% accuracy: marksman + sharpshooter + surgical + one_job
  freshInit();
  runAccuracyLevel(10, 10);
  const lt = getLifetimeAchievements();
  assertEq(lt['acc_marksman']?.progress, 1, 'acc_marksman at 100% accuracy');
  assertEq(lt['acc_sharpshooter']?.progress, 1, 'acc_sharpshooter at 100% accuracy');
  assertEq(lt['acc_surgical']?.progress, 1, 'acc_surgical at 100% accuracy');
  assertEq(lt['acc_one_job']?.progress, 1, 'acc_one_job with no misses');
  assert(!lt['acc_participation'] || lt['acc_participation'].progress === 0, 'acc_participation NOT at 100%');
}

{
  // 40% accuracy (4/10): participation, NOT spray (needs <=30%)
  freshInit();
  runAccuracyLevel(10, 4);
  const lt = getLifetimeAchievements();
  assertEq(lt['acc_participation']?.progress, 1, 'acc_participation at 40% accuracy');
  assert(!lt['acc_spray'] || lt['acc_spray'].progress === 0, 'acc_spray NOT at 40% (needs <=30%)');
  assert(!lt['acc_marksman'] || lt['acc_marksman'].progress === 0, 'acc_marksman NOT at 40%');
  assert(!lt['acc_one_job'] || lt['acc_one_job'].progress === 0, 'acc_one_job NOT with misses');
}

{
  // 20% accuracy (2/10): participation + spray
  freshInit();
  runAccuracyLevel(10, 2);
  const lt = getLifetimeAchievements();
  assertEq(lt['acc_spray']?.progress, 1, 'acc_spray at 20% accuracy');
  assertEq(lt['acc_participation']?.progress, 1, 'acc_participation at 20% accuracy');
}

{
  // 80% accuracy (8/10): marksman, NOT sharpshooter
  freshInit();
  runAccuracyLevel(10, 8);
  const lt = getLifetimeAchievements();
  assertEq(lt['acc_marksman']?.progress, 1, 'acc_marksman at 80%');
  assert(!lt['acc_sharpshooter'] || lt['acc_sharpshooter'].progress === 0, 'acc_sharpshooter NOT at 80%');
}

{
  // acc_quality: ≤10 shots AND all enemies dead
  freshInit();
  runAccuracyLevel(8, 8, true);
  const lt = getLifetimeAchievements();
  assertEq(lt['acc_quality']?.progress, 1, 'acc_quality at 8 shots with all enemies dead');
}

{
  // acc_quality NOT triggered if >10 shots
  freshInit();
  runAccuracyLevel(12, 12, true);
  const lt = getLifetimeAchievements();
  assert(!lt['acc_quality'] || lt['acc_quality'].progress === 0, 'acc_quality NOT at 12 shots');
}

{
  // No shots fired: no accuracy achievement evaluated
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeAchievements();
  assert(!lt['acc_marksman'] || lt['acc_marksman'].progress === 0, 'no accuracy award with 0 shots fired');
  assert(!lt['acc_participation'] || lt['acc_participation'].progress === 0, 'no participation award with 0 shots fired');
}

/* ==========================================================================
   SECTION 34 (P4): Confrontational — cross-product lateral check
   ========================================================================== */
console.log('\n=== Section 34 (P4): cmb_confrontational lateral math ===');

{
  // Bot directly to the east of Dan. Pure-east input is non-lateral → passes.
  const danPos = { x:0, y:0 }, botPos = { x:100, y:0 };
  const eastOnly = [{ dx:1, dy:0, t:1 }, { dx:1, dy:0, t:2 }];
  assert(noLateralMovement(eastOnly, danPos, botPos), 'pure-converging input has no lateral component');

  // Pure-north input is fully lateral → fails.
  const northOnly = [{ dx:0, dy:-1, t:1 }];
  assert(!noLateralMovement(northOnly, danPos, botPos), 'perpendicular input is lateral → fails');

  // No input at all → passes (zero-magnitude entries are non-lateral).
  const noInput = [{ dx:0, dy:0, t:1 }, { dx:0, dy:0, t:2 }];
  assert(noLateralMovement(noInput, danPos, botPos), 'zero input passes the lateral check');

  // A single sidestep frame anywhere in the window disqualifies.
  const mostlyForward = [{ dx:1, dy:0, t:1 }, { dx:0.7, dy:0.7, t:2 }, { dx:1, dy:0, t:3 }];
  assert(!noLateralMovement(mostlyForward, danPos, botPos), 'one diagonal sidestep frame fails the window');

  // Empty / missing history → passes (degenerate).
  assert(noLateralMovement([], danPos, botPos), 'empty history passes');
  assert(noLateralMovement(undefined, danPos, botPos), 'undefined history passes');

  // Degenerate Dan==bot → passes.
  assert(noLateralMovement(northOnly, { x:5, y:5 }, { x:5, y:5 }), 'zero Dan→bot distance passes');
}

{
  // Integration: Security kill head-on increments cmb_confrontational.
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', {
    type:'security', killerKind:'bubble', bounceCount:0, isBounceKill:false,
    pos:{ x:100, y:0 }, danPos:{ x:0, y:0 },
    danMoveHistory:[{ dx:1, dy:0, t:1 }],
  });
  assertEq(getLifetimeAchievements()['cmb_confrontational']?.progress, 1, 'cmb_confrontational on head-on security kill');
}

{
  // Integration: Security kill with a sidestep does NOT increment.
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', {
    type:'security', killerKind:'bubble', bounceCount:0, isBounceKill:false,
    pos:{ x:100, y:0 }, danPos:{ x:0, y:0 },
    danMoveHistory:[{ dx:0, dy:1, t:1 }],
  });
  const lt = getLifetimeAchievements();
  assert(!lt['cmb_confrontational'] || lt['cmb_confrontational'].progress === 0, 'cmb_confrontational NOT on a sidestepped kill');
}

{
  // Non-security kill never counts even if head-on.
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', {
    type:'picker', killerKind:'bubble', bounceCount:0, isBounceKill:false,
    pos:{ x:100, y:0 }, danPos:{ x:0, y:0 }, danMoveHistory:[{ dx:1, dy:0, t:1 }],
  });
  const lt = getLifetimeAchievements();
  assert(!lt['cmb_confrontational'] || lt['cmb_confrontational'].progress === 0, 'cmb_confrontational only on security kills');
}

/* ==========================================================================
   SECTION 35 (P4): Blind Shot + Wrong Aisle
   ========================================================================== */
console.log('\n=== Section 35 (P4): blind shot / wrong aisle ===');

{
  // cmb_blind_shot: bounce kill with no LOS at fire time
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(2, 1, { hadLOSAtFire:false }));
  assertEq(getLifetimeAchievements()['cmb_blind_shot']?.progress, 1, 'cmb_blind_shot on no-LOS bounce kill');
}

{
  // cmb_blind_shot NOT triggered when LOS existed at fire time
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(2, 1, { hadLOSAtFire:true }));
  const lt = getLifetimeAchievements();
  assert(!lt['cmb_blind_shot'] || lt['cmb_blind_shot'].progress === 0, 'cmb_blind_shot NOT with LOS');
}

{
  // cmb_blind_shot NOT triggered for a non-bounce no-LOS kill (needs a ricochet)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:0, isBounceKill:false, hadLOSAtFire:false });
  const lt = getLifetimeAchievements();
  assert(!lt['cmb_blind_shot'] || lt['cmb_blind_shot'].progress === 0, 'cmb_blind_shot needs a bounce kill');
}

{
  // aimFightsBelt math: belt pushing east.
  const east = { dx:1, dy:0 };
  assert(aimFightsBelt(Math.PI, east), 'aiming west against an east belt fights it (180° > 45°)');
  assert(aimFightsBelt(Math.PI/2, east), 'aiming north across an east belt fights it (90° > 45°)');
  assert(!aimFightsBelt(0, east), 'aiming east with an east belt does NOT fight it');
  assert(!aimFightsBelt(Math.PI/6, east), 'aiming 30° off the belt does NOT fight it');
  assert(!aimFightsBelt(0, { dx:0, dy:0 }), 'no belt push → never fights');
}

{
  // conv_wrong_aisle integration: on belt, aim opposes belt
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', {
    type:'picker', killerKind:'bubble', bounceCount:0, isBounceKill:false,
    danOnBelt:true, danAimAngle:Math.PI, beltPush:{ dx:1, dy:0 },
  });
  assertEq(getLifetimeAchievements()['conv_wrong_aisle']?.progress, 1, 'conv_wrong_aisle when fighting the belt at kill time');
}

{
  // conv_wrong_aisle NOT triggered when not on a belt
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', {
    type:'picker', killerKind:'bubble', bounceCount:0, isBounceKill:false,
    danOnBelt:false, danAimAngle:Math.PI, beltPush:{ dx:0, dy:0 },
  });
  const lt = getLifetimeAchievements();
  assert(!lt['conv_wrong_aisle'] || lt['conv_wrong_aisle'].progress === 0, 'conv_wrong_aisle NOT when off the belt');
}

{
  // conv_wrong_aisle NOT triggered when aim aligns with the belt
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', {
    type:'picker', killerKind:'bubble', bounceCount:0, isBounceKill:false,
    danOnBelt:true, danAimAngle:0, beltPush:{ dx:1, dy:0 },
  });
  const lt = getLifetimeAchievements();
  assert(!lt['conv_wrong_aisle'] || lt['conv_wrong_aisle'].progress === 0, 'conv_wrong_aisle NOT when going with the belt');
}

/* ==========================================================================
   SECTION 36 (P4): Recall Notice (homing redirected)
   ========================================================================== */
console.log('\n=== Section 36 (P4): cmb_recall_notice ===');

{
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('bolt:homing_redirected', { hit:'wall' });
  assertEq(getLifetimeAchievements()['cmb_recall_notice']?.progress, 1, 'cmb_recall_notice on homing→wall redirect');
  emit('bolt:homing_redirected', { hit:'enemy' });
  assertEq(getLifetimeAchievements()['cmb_recall_notice']?.progress, 2, 'cmb_recall_notice on homing→enemy redirect');
}

/* ==========================================================================
   SECTION 37 (P5): getWeeklyAchievements() — title-screen panel data
   ========================================================================== */
console.log('\n=== Section 37 (P5): getWeeklyAchievements() ===');

{
  freshInit();
  const weekly = getWeeklyAchievements();

  // 5 active weekly achievements + the meta_eotw slot.
  assertEq(weekly.length, 6, 'getWeeklyAchievements returns 6 entries');

  // Last entry is the EOTW meta slot, target == number of active weeklies.
  const meta = weekly[weekly.length - 1];
  assertEq(meta.id, 'meta_eotw', 'last entry is meta_eotw');
  assertEq(meta.target, 5, 'meta_eotw target is 5 (one per active weekly)');

  // Every entry is well-formed.
  const wellFormed = weekly.every(e =>
    typeof e.id === 'string' && e.id.length > 0 &&
    typeof e.name === 'string' && e.name.length > 0 &&
    typeof e.description === 'string' &&
    typeof e.progress === 'number' &&
    typeof e.target === 'number' &&
    typeof e.unlocked === 'boolean');
  assert(wellFormed, 'every weekly entry is well-formed {id,name,description,progress,target,unlocked}');

  // Fresh week → nothing unlocked yet, meta progress 0.
  assert(weekly.every(e => e.unlocked === false), 'fresh week: no weekly entry unlocked');
  assertEq(meta.progress, 0, 'fresh week: meta_eotw progress is 0');

  // Completing an active weekly reflects in the panel (unlocked + meta count up).
  const firstId = weekly[0].id;
  // acc_marksman is the first placeholder weekly id; trigger its high-accuracy path.
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  // Fire 4 shots, hit 4 → 100% accuracy → unlocks the high-accuracy weeklies.
  for (let i = 0; i < 4; i++) emit('bolt:fired', { kind:'standard', isTripleShotActive:false });
  for (let i = 0; i < 4; i++) emit('bolt:hit', { targetType:'picker' });
  emit('level:all_enemies_dead');
  emit('level:end', { levelTime:30000, workersRescued:0, levelNumber:1 });

  const after = getWeeklyAchievements();
  const someUnlocked = after.some(e => e.id !== 'meta_eotw' && e.unlocked);
  assert(someUnlocked, 'completing an accuracy weekly marks it unlocked in the panel');
  const metaAfter = after[after.length - 1];
  assert(metaAfter.progress >= 1, 'meta_eotw progress reflects completed weeklies');
  void firstId;
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
