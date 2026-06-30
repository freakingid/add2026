/**
 * test-achievements-p4.js — Sections 31–36 (Phase 4)
 * Tests: Bounce-shot thresholds, final sweep / wall flower, accuracy at level:end,
 *        Confrontational lateral math, Blind Shot / Wrong Aisle, Recall Notice.
 * Run: node test-achievements-p4.js
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
  const lt = getLifetimeRaw();
  assertEq(lt['bnc_bank']?.progress, 1, 'bnc_bank increments on a single-bounce kill');
  assert(!lt['bnc_cue_ball'] || lt['bnc_cue_ball'].progress === 0, 'bnc_cue_ball NOT triggered at 1 bounce');
}

{
  // A 1-bounce kill must NOT count for geometry_brain (needs 4 total)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));
  const lt = getLifetimeRaw();
  assert(!lt['bnc_geometry_brain'] || lt['bnc_geometry_brain'].progress === 0, 'bnc_geometry_brain NOT triggered at 1 bounce');
  assert(!lt['bnc_bank'] || lt['bnc_bank'].progress === 1, 'bnc_bank still 1');
}

{
  // bnc_cue_ball (3+) and NOT pool_shark (<5)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(3, 2));
  const lt = getLifetimeRaw();
  assertEq(lt['bnc_cue_ball']?.progress, 1, 'bnc_cue_ball increments at 3 bounces');
  assert(!lt['bnc_pool_shark'] || lt['bnc_pool_shark'].progress === 0, 'bnc_pool_shark NOT triggered at 3 bounces');
  assert(!lt['bnc_bank'] || lt['bnc_bank'].progress === 0, 'bnc_bank NOT triggered at 3 bounces (needs exactly 1)');
}

{
  // bnc_pool_shark (5+), bnc_cue_ball, bnc_geometry_brain (4+ total) all fire
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(5, 3));
  const lt = getLifetimeRaw();
  assertEq(lt['bnc_pool_shark']?.progress, 1, 'bnc_pool_shark increments at 5 bounces');
  assertEq(lt['bnc_cue_ball']?.progress, 1, 'bnc_cue_ball increments at 5 bounces');
  assertEq(lt['bnc_geometry_brain']?.progress, 1, 'bnc_geometry_brain increments at 5 total bounces');
}

{
  // bnc_geometry_brain (4 total, 2 unique) but NOT geometry_teacher (needs 4 unique)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(4, 2));
  const lt = getLifetimeRaw();
  assertEq(lt['bnc_geometry_brain']?.progress, 1, 'bnc_geometry_brain at 4 total bounces');
  assert(!lt['bnc_geometry_teacher'] || lt['bnc_geometry_teacher'].progress === 0, 'bnc_geometry_teacher NOT at 2 unique walls');
  assertEq(lt['bnc_long_way']?.progress, 1, 'bnc_long_way at 2 unique walls (rounded a corner)');
}

{
  // bnc_geometry_teacher (4 unique walls)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(4, 4));
  const lt = getLifetimeRaw();
  assertEq(lt['bnc_geometry_teacher']?.progress, 1, 'bnc_geometry_teacher at 4 unique walls');
}

{
  // bnc_chain is wired but dormant: chainCount never reaches 4 (shots don't pierce)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(2, 1, { chainCount: 1 }));
  const lt = getLifetimeRaw();
  assert(!lt['bnc_chain'] || lt['bnc_chain'].progress === 0, 'bnc_chain dormant at chainCount 1');
  // but it DOES fire if the payload ever carries chainCount >= 4
  emit('enemy:died', bounceKill(2, 1, { chainCount: 4 }));
  assertEq(getLifetimeRaw()['bnc_chain']?.progress, 1, 'bnc_chain fires when chainCount reaches 4');
}

{
  // Non-bounce kill must not credit any bounce achievement
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', { type:'picker', killerKind:'mop', bounceCount:0, uniqueWallCount:0, isBounceKill:false });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['bnc_final_sweep']?.progress, 1, 'bnc_final_sweep when last kill was a bounce');
}

{
  // bnc_final_sweep NOT triggered if the last kill was non-bounce
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(2, 1));                                          // earlier bounce kill
  emit('enemy:died', { type:'picker', killerKind:'mop', bounceCount:0, isBounceKill:false }); // final non-bounce
  emit('level:all_enemies_dead');
  const lt = getLifetimeRaw();
  assert(!lt['bnc_final_sweep'] || lt['bnc_final_sweep'].progress === 0, 'bnc_final_sweep NOT triggered when last kill not a bounce');
}

{
  // bnc_wall_flower: every kill this level was a bounce kill
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));
  emit('enemy:died', bounceKill(2, 2));
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assertEq(lt['bnc_wall_flower']?.progress, 1, 'bnc_wall_flower when all kills were bounces');
}

{
  // bnc_wall_flower NOT triggered if any non-bounce kill occurred
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(1, 1));
  emit('enemy:died', { type:'picker', killerKind:'mop', bounceCount:0, isBounceKill:false });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
  assert(!lt['bnc_wall_flower'] || lt['bnc_wall_flower'].progress === 0, 'bnc_wall_flower NOT triggered with a non-bounce kill');
}

{
  // bnc_wall_flower NOT triggered with zero kills
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
  assertEq(lt['acc_participation']?.progress, 1, 'acc_participation at 40% accuracy');
  assert(!lt['acc_spray'] || lt['acc_spray'].progress === 0, 'acc_spray NOT at 40% (needs <=30%)');
  assert(!lt['acc_marksman'] || lt['acc_marksman'].progress === 0, 'acc_marksman NOT at 40%');
  assert(!lt['acc_one_job'] || lt['acc_one_job'].progress === 0, 'acc_one_job NOT with misses');
}

{
  // 20% accuracy (2/10): participation + spray
  freshInit();
  runAccuracyLevel(10, 2);
  const lt = getLifetimeRaw();
  assertEq(lt['acc_spray']?.progress, 1, 'acc_spray at 20% accuracy');
  assertEq(lt['acc_participation']?.progress, 1, 'acc_participation at 20% accuracy');
}

{
  // 80% accuracy (8/10): marksman, NOT sharpshooter
  freshInit();
  runAccuracyLevel(10, 8);
  const lt = getLifetimeRaw();
  assertEq(lt['acc_marksman']?.progress, 1, 'acc_marksman at 80%');
  assert(!lt['acc_sharpshooter'] || lt['acc_sharpshooter'].progress === 0, 'acc_sharpshooter NOT at 80%');
}

{
  // acc_quality: ≤10 shots AND all enemies dead
  freshInit();
  runAccuracyLevel(8, 8, true);
  const lt = getLifetimeRaw();
  assertEq(lt['acc_quality']?.progress, 1, 'acc_quality at 8 shots with all enemies dead');
}

{
  // acc_quality NOT triggered if >10 shots
  freshInit();
  runAccuracyLevel(12, 12, true);
  const lt = getLifetimeRaw();
  assert(!lt['acc_quality'] || lt['acc_quality'].progress === 0, 'acc_quality NOT at 12 shots');
}

{
  // No shots fired: no accuracy achievement evaluated
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('level:end', { levelTime:60000, workersRescued:0, levelNumber:1 });
  const lt = getLifetimeRaw();
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
  assertEq(getLifetimeRaw()['cmb_confrontational']?.progress, 1, 'cmb_confrontational on head-on security kill');
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
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  assertEq(getLifetimeRaw()['cmb_blind_shot']?.progress, 1, 'cmb_blind_shot on no-LOS bounce kill');
}

{
  // cmb_blind_shot NOT triggered when LOS existed at fire time
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', bounceKill(2, 1, { hadLOSAtFire:true }));
  const lt = getLifetimeRaw();
  assert(!lt['cmb_blind_shot'] || lt['cmb_blind_shot'].progress === 0, 'cmb_blind_shot NOT with LOS');
}

{
  // cmb_blind_shot NOT triggered for a non-bounce no-LOS kill (needs a ricochet)
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', { type:'picker', killerKind:'bubble', bounceCount:0, isBounceKill:false, hadLOSAtFire:false });
  const lt = getLifetimeRaw();
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
  assertEq(getLifetimeRaw()['conv_wrong_aisle']?.progress, 1, 'conv_wrong_aisle when fighting the belt at kill time');
}

{
  // conv_wrong_aisle NOT triggered when not on a belt
  freshInit();
  emit('run:start'); emit('level:start', { terminalCount:1, workerCount:5 });
  emit('enemy:died', {
    type:'picker', killerKind:'bubble', bounceCount:0, isBounceKill:false,
    danOnBelt:false, danAimAngle:Math.PI, beltPush:{ dx:0, dy:0 },
  });
  const lt = getLifetimeRaw();
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
  const lt = getLifetimeRaw();
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
  assertEq(getLifetimeRaw()['cmb_recall_notice']?.progress, 1, 'cmb_recall_notice on homing→wall redirect');
  emit('bolt:homing_redirected', { hit:'enemy' });
  assertEq(getLifetimeRaw()['cmb_recall_notice']?.progress, 2, 'cmb_recall_notice on homing→enemy redirect');
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