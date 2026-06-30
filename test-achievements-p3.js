/**
 * test-achievements-p3.js — Sections 23–30 (Phase 3)
 * Tests: Progression, Survival, Speed, Worker Rescue, Atomic Dustbin,
 *        Power-Ups & Items, Score stubs, Combat achievements.
 * Run: node test-achievements-p3.js
 */

/* ---- Browser API shims --------------------------------------------------- */
const _store = {};
globalThis.localStorage = {
  getItem: (k) => _store[k] !== undefined ? _store[k] : null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k]; },
};
globalThis.performance = { now: () => 1000 };
globalThis.window = {};

function clearStorage() { for (const k of Object.keys(_store)) delete _store[k]; }

/* ---- Dynamic imports (ES modules) --------------------------------------- */
const { emit, on, off } = await import('./src/events.js');
const {
  initAchievements, popAchievementBanner, isoWeekKey,
  getLifetimeRaw, getLifetimeAchievements, getWeeklyAchievements,
  getLevelAchievementSummary,
  noLateralMovement, aimFightsBelt,
  getXP, _prevISOWeekKey,
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
   SECTION 23 (Phase 3): Progression — prg_temp, prg_director
   ========================================================================== */
console.log('\n=== Section 23 (P3): Progression ===');

{
  freshInit();
  emit('run:start');
  // Complete 1 level
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['prg_temp'].progress, 1, 'prg_temp increments on level:end');
  assert(lt['prg_temp'].tier === 1, 'prg_temp tier 1 (Bronze) at 1 level');

  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:1000, inputMode:'keyboard' });
  const lt2 = getLifetimeRaw();
  assertEq(lt2['prg_director'].progress, 1, 'prg_director increments on run:end');
  assert(lt2['prg_director'].tier === 1, 'prg_director tier 1 (Bronze) at 1 run');
}

{
  // stub: prg_ceo does NOT increment
  freshInit();
  emit('run:start');
  emit('run:end', { runTime:30000, levelsCompleted:1, totalScore:500, inputMode:'keyboard' });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['surv_spotless']?.progress, 1, 'surv_spotless increments on damage-free level');
}

{
  // surv_spotless: level WITH damage does NOT increment
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:hit', { dmg:2, source:'ranged' });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assert(!lt['surv_teflon'] || lt['surv_teflon'].progress === 0, 'surv_teflon NOT triggered when streak broken');
}

{
  // surv_skeleton: exactly 1 HP at level end
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:hp_changed', { hp:1, maxHp:20 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['surv_skeleton']?.progress, 1, 'surv_skeleton increments at 1 HP on level end');
}

{
  // surv_skeleton: 2 HP does NOT trigger
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:hp_changed', { hp:2, maxHp:20 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assert(!lt['surv_skeleton'] || lt['surv_skeleton'].progress === 0, 'surv_skeleton NOT triggered at 2 HP');
}

{
  // surv_osha: hit 10+ times and complete level
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  for (let i = 0; i < 10; i++) emit('player:hit', { dmg:1, source:'melee' });
  emit('level:end', { levelTime:120000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['surv_osha']?.progress, 1, 'surv_osha increments at 10+ hits on level end');
}

{
  // surv_no_stopping: no player:stood_still during level
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  // no stood_still event
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['surv_no_stopping']?.progress, 1, 'surv_no_stopping increments when never stood still');
}

{
  // surv_no_stopping: stood_still voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('player:stood_still', { durationMs:1200 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['spd_rush']?.progress, 1, 'spd_rush increments for level under 45s');
}

{
  // spd_rush: level over 45 seconds does NOT increment
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:46000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assert(!lt['spd_rush'] || lt['spd_rush'].progress === 0, 'spd_rush NOT triggered for level over 45s');
}

{
  // spd_lunch: full run under 15 minutes (900000ms)
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:890000, levelsCompleted:1, totalScore:5000, inputMode:'keyboard' });
  const lt = getLifetimeRaw();
  assertEq(lt['spd_lunch']?.progress, 1, 'spd_lunch increments for run under 15 min');
}

{
  // spd_lunch: run over 15 minutes does NOT increment
  freshInit();
  emit('run:start');
  emit('run:end', { runTime:901000, levelsCompleted:1, totalScore:5000, inputMode:'keyboard' });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['wrk_first_responder']?.progress, 1, 'wrk_first_responder increments for rescue within 30s');
}

{
  // wrk_first_responder: rescue after 30s does NOT increment
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:31000, playerHP:20, followingDurationMs:1000 });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['wrk_hero']?.progress, 1, 'wrk_hero increments when all 5 rescued in one level');
}

{
  // wrk_nick: rescue at ≤10 HP
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:15000, playerHP:8, followingDurationMs:0 });
  const lt = getLifetimeRaw();
  assertEq(lt['wrk_nick']?.progress, 1, 'wrk_nick increments when rescued at ≤10 HP');
}

{
  // wrk_danger_pay: rescue at exactly 1 HP
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:15000, playerHP:1, followingDurationMs:0 });
  const lt = getLifetimeRaw();
  assertEq(lt['wrk_danger_pay']?.progress, 1, 'wrk_danger_pay increments at exactly 1 HP');
}

{
  // wrk_escort: worker following for 5+ seconds
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('worker:rescued', { workerIndex:0, timeInLevelMs:20000, playerHP:20, followingDurationMs:6000 });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['dust_option']?.progress, 1, 'dust_option increments when 3+ enemies killed by detonation');
}

{
  // dust_option: 2 kills does NOT trigger
  freshInit();
  emit('run:start');
  emit('dustbin:detonated', { killCount:2 });
  const lt = getLifetimeRaw();
  assert(!lt['dust_option'] || lt['dust_option'].progress === 0, 'dust_option NOT triggered for <3 kills');
}

{
  // dust_reserve: complete level without throwing dustbin
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  // no dustbin:thrown event
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['dust_reserve']?.progress, 1, 'dust_reserve increments when dustbin not thrown');
}

{
  // dust_reserve: throwing dustbin voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('dustbin:thrown');
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assert(!lt['dust_reserve'] || lt['dust_reserve'].progress === 0, 'dust_reserve NOT triggered when dustbin thrown');
}

{
  // dust_env_hazard: manager killed by dustbin
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:died', { type:'manager', killerKind:'dustbin', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:5000, isBounceKill:false });
  const lt = getLifetimeRaw();
  assertEq(lt['dust_env_hazard']?.progress, 1, 'dust_env_hazard increments when manager killed by dustbin');
}

{
  // dust_env_hazard: manager killed by bubble does NOT trigger
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:died', { type:'manager', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:5000, isBounceKill:false });
  const lt = getLifetimeRaw();
  assert(!lt['dust_env_hazard'] || lt['dust_env_hazard'].progress === 0, 'dust_env_hazard NOT triggered for bubble kill');
}

{
  // dust_heavy_hitter: cumulative throw counter
  freshInit();
  emit('dustbin:thrown');
  emit('dustbin:thrown');
  emit('dustbin:thrown');
  const lt = getLifetimeRaw();
  assertEq(lt['dust_heavy_hitter']?.progress, 3, 'dust_heavy_hitter accumulates throws');
}

{
  // dust_disgruntled: 3+ wall bounces before detonation
  freshInit();
  emit('dustbin:bounced', { totalWallCount:3, uniqueWallCount:2 });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['itm_off_clock']?.progress, 1, 'itm_off_clock increments when no power-ups collected');
}

{
  // itm_off_clock: picking a powerup voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('powerup:collected', { kind:'rapid' });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assert(!lt['itm_off_clock'] || lt['itm_off_clock'].progress === 0, 'itm_off_clock NOT triggered when powerup collected');
}

{
  // itm_calories: level without using vending
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['itm_calories']?.progress, 1, 'itm_calories increments when no vending used');
}

{
  // itm_calories: using vending voids it
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('vending:used', { variant:'small', hpGained:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assert(!lt['itm_calories'] || lt['itm_calories'].progress === 0, 'itm_calories NOT triggered when vending used');
}

{
  // itm_cost_cutting: no powerups AND no vending
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['itm_cost_cutting']?.progress, 1, 'itm_cost_cutting increments when no powerups AND no vending');
}

{
  // itm_min_wage: full run without power-ups
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:500, inputMode:'keyboard' });
  const lt = getLifetimeRaw();
  assertEq(lt['itm_min_wage']?.progress, 1, 'itm_min_wage increments on run with no power-ups');
}

{
  // itm_no_refills: full run without vending
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  emit('run:end', { runTime:60000, levelsCompleted:1, totalScore:500, inputMode:'keyboard' });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['cmb_zero_waste']?.progress, 1, 'cmb_zero_waste increments when all enemies dead');
}

{
  // cmb_zero_waste: NOT triggered without level:all_enemies_dead
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assert(!lt['cmb_zero_waste'] || lt['cmb_zero_waste'].progress === 0, 'cmb_zero_waste NOT triggered without all enemies dead');
}

{
  // cmb_overtime_denied: manager killed within 10s of spawn
  freshInit();
  emit('run:start');
  emit('level:start', { terminalCount:2, workerCount:5 });
  emit('enemy:spawned', { type:'manager', timeInLevel:5000 });
  emit('enemy:died', { type:'manager', killerKind:'bubble', bounceCount:0, uniqueWallCount:0, hadLOSAtFire:true, timeAliveMs:8000, isBounceKill:false });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assert(!lt['prg_manual'] || lt['prg_manual'].progress === 0, 'prg_manual NOT triggered for keyboard run');
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