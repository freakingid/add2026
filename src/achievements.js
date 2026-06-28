/* =========================================================================
   achievements.js — Phase 3 implementation.

   Subscribes to all game events via events.js and maintains:
     - Module-local session state (no G mutations)
     - Lifetime progress in localStorage (add_lifetime)
     - Weekly progress in localStorage (add_weekly_{year}_{week})
     - ISO week rollover detection (add_weekly_meta)
     - In-play banner queue (pulled by render.js)

   Phase 3 adds: Progression, Survival, Speed, Worker Rescue, Atomic Dustbin,
   Power-Ups & Items, Score stubs. All use only events wired in Phase 2.

   Imports only from events.js (dependency flows one way to game modules).
   ========================================================================= */
import { on, off } from './events.js';
import { sfx } from './audio.js';

/* ---- localStorage helpers (no-op when localStorage is unavailable) ------- */
function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

/* ---- ISO week key -------------------------------------------------------- */
export function isoWeekKey() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}_${weekNo}`;
}

/* ---- Phase 4 geometry helpers (pure, unit-testable) ---------------------- */

/* Confrontational: true iff NO movement-history entry has a lateral component
   (relative to the Dan→bot axis) above the noise threshold. Zero-magnitude
   (no input) entries pass. Mirrors blueprint Task 2: lateral = |dx·uy − dy·ux|. */
export function noLateralMovement(history, danPos, botPos, threshold = 0.1) {
  const vx = botPos.x - danPos.x, vy = botPos.y - danPos.y;
  const mag = Math.hypot(vx, vy);
  if (mag === 0) return true;                 // degenerate: treat as head-on
  const ux = vx / mag, uy = vy / mag;
  for (const m of (history ?? [])) {
    if (m.dx === 0 && m.dy === 0) continue;   // no input — non-lateral
    const lateral = Math.abs(m.dx * uy - m.dy * ux);
    if (lateral > threshold) return false;
  }
  return true;
}

/* Wrong Aisle: true iff the belt is actively pushing and Dan's aim heading
   differs from the belt push direction by more than 45°. */
export function aimFightsBelt(aimAngle, beltPush, threshold = Math.PI / 4) {
  if (!beltPush || (beltPush.dx === 0 && beltPush.dy === 0)) return false;
  const beltAngle = Math.atan2(beltPush.dy, beltPush.dx);
  let diff = aimAngle - beltAngle;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) > threshold;
}

/* ---- localStorage schema keys ------------------------------------------- */
const KEY_LIFETIME    = 'add_lifetime';
const KEY_WEEKLY_META = 'add_weekly_meta';
const KEY_XP          = 'add_xp';
const KEY_EOTW_STREAK = 'add_eotw_streak';
function weeklyKey(key) { return `add_weekly_${key}`; }

/* ---- Per-level progress log (Phase 6: post-level modal) ------------------
   Records every achievement that advanced during the current level, keyed by id.
   Cleared on level:start; read by getLevelAchievementSummary() during the
   levelclear state. `isNew` flags an achievement whose tier was promoted (or a
   weekly newly unlocked) this level — earned for the first time this session at
   that milestone. -------------------------------------------------------------- */
let _levelProgressLog = {};

function _logLevelProgress(id, { newTier = false } = {}) {
  const reg = REGISTRY[id];
  if (!reg || reg.stub) return;
  const entry = _lifetime[id] ?? { tier: 0, progress: 0 };
  const tiers = reg.tiers ?? [];
  // Next-tier threshold (target). Once Diamond, the final threshold is the target.
  const target = entry.tier < tiers.length ? tiers[entry.tier]
               : (tiers[tiers.length - 1] ?? entry.progress);
  if (!_levelProgressLog[id]) _levelProgressLog[id] = { isNew: false };
  const log = _levelProgressLog[id];
  log.id = id;
  log.name = reg.name;
  log.description = reg.desc ?? '';
  log.progress = entry.progress;
  log.target = target;
  log.tier = entry.tier;
  if (newTier) log.isNew = true;
}

/* ---- In-play banner queue ----------------------------------------------- */
let _bannerQueue = [];

export function popAchievementBanner() {
  return _bannerQueue.shift() ?? null;
}

function _pushBanner(text, subtext) {
  if (_bannerQueue.length >= 5) _bannerQueue.shift(); // cap queue at 5
  _bannerQueue.push({ text, subtext, timestamp: Date.now() });
  // Direct sfx call — same one-way pattern as every other module (achievements
  // → audio). The pub/sub bus is for tracking events, not for audio.
  sfx.achievement();
}

/* ---- Module-local session state ----------------------------------------- */
let _session = {
  /* timing */
  levelStartTime: 0,
  runStartTime: 0,

  /* per-level shot/kill/damage counters */
  levelShotsFired: 0,
  levelBoltHits: 0,
  levelEnemiesKilled: 0,
  levelDamageTaken: 0,

  /* per-level worker state */
  levelWorkersRescued: 0,
  levelWorkersAvailable: 0,          // set on level:start
  levelWorkersRescuedSet: null,      // Set of workerIndex rescued this level
  levelAnyWorkerRescued: false,

  /* per-level power-ups / vending */
  levelPowerupsCollected: 0,
  levelVendingUsed: 0,

  /* per-level dustbin */
  levelDustbinThrown: false,

  /* per-level no-standing-still flag (cleared when player:stood_still fires) */
  levelStoodStill: false,

  /* per-level enemy tracking */
  levelAllEnemiesDeadReached: false,
  levelEnemyTypesKilled: null,       // Set of types killed this level
  levelManagerHit: false,            // hit by manager this level

  /* per-level bounce/accuracy tracking (Phase 4) */
  levelNonBounceKill: false,         // any non-bounce kill this level (fails bnc_wall_flower)
  levelAnyKill: false,               // at least one enemy killed this level
  lastKillWasBounce: false,          // most recent kill came from a bounce shot (bnc_final_sweep)

  /* recent-kill timestamps for speed-kill achievements */
  recentKillTimes: [],

  /* recent rescue timestamp for wrk_tag_team */
  lastRescueTime: 0,

  /* per-level manager tracking for cmb_early_retirement / cmb_overtime_denied */
  levelManagerSpawnTime: 0,
  levelManagerKilledBeforeFired: false,

  /* worker escort tracking (durationMs by workerIndex) */
  workerFollowingMs: {},

  /* per-run counters */
  runWorkersRescued: 0,
  runWorkersAvailableTotal: 0,       // total workers across levels
  runWorkersRescuedTotal: 0,         // same as runWorkersRescued but clearer
  runLevelsCompleted: 0,
  runPowerupsCollected: 0,
  runVendingUsed: 0,
  runInputMode: null,

  /* per-run authored-level tracking for prg_spring */
  runAuthoredLevelsCompleted: new Set(),

  /* per-run worker rescue per level (for wrk_nobody / wrk_unionized) */
  runLevelWorkerData: [],           // [{available, rescued}] one per level

  /* consecutive counters (persist across levels within a run but reset on death) */
  consecutiveDamageFreeCount: 0,
  consecutiveSurviveCount: 0,       // levels survived without dying (surv_hot_streak)

  /* no-workers-rescued consecutive levels (wrk_understaffed) */
  consecutiveNoRescueLevels: 0,
};

/* ---- Lifetime state (backed by localStorage) ---------------------------- */
let _lifetime = {};     // { [achievementId]: { tier, progress } }
let _weeklyMeta = null; // { key: string }
let _weekly = {};       // { [achievementId]: { unlocked, progress } }
let _weekKey = '';

function _loadLifetime() {
  const stored = lsGet(KEY_LIFETIME);
  _lifetime = (stored && typeof stored === 'object') ? stored : {};
}

function _saveLifetime() {
  lsSet(KEY_LIFETIME, _lifetime);
}

function _ensureLifetimeEntry(id) {
  if (!_lifetime[id]) _lifetime[id] = { tier: 0, progress: 0 };
}

function _incLifetime(id, amount = 1) {
  _ensureLifetimeEntry(id);
  _lifetime[id].progress += amount;
  _saveLifetime();
  return _lifetime[id].progress;
}

function _loadWeekly() {
  _weeklyMeta = lsGet(KEY_WEEKLY_META);
  const currentKey = isoWeekKey();
  _weekKey = currentKey;

  if (!_weeklyMeta || _weeklyMeta.key !== currentKey) {
    lsSet(KEY_WEEKLY_META, { key: currentKey });
    _weeklyMeta = { key: currentKey };
    _weekly = {};
    lsSet(weeklyKey(currentKey), _weekly);
  } else {
    const stored = lsGet(weeklyKey(currentKey));
    _weekly = (stored && typeof stored === 'object') ? stored : {};
  }
}

function _saveWeekly() {
  lsSet(weeklyKey(_weekKey), _weekly);
}

function _incWeekly(id, amount = 1) {
  if (!_weekly[id]) _weekly[id] = { unlocked: false, progress: 0 };
  _weekly[id].progress += amount;
  _saveWeekly();
  return _weekly[id].progress;
}

function _unlockWeekly(id) {
  if (!_weekly[id]) _weekly[id] = { unlocked: false, progress: 0 };
  if (!_weekly[id].unlocked) {
    _weekly[id].unlocked = true;
    _saveWeekly();
    return true;
  }
  return false;
}

/* ---- Achievement registry -----------------------------------------------
   Format: [id, name, tiers[], weekly, stub]
   tiers = [B, S, G, P, D] thresholds (5 elements).
   stub: true → handler registered but short-circuits immediately.
   -------------------------------------------------------------------- */
const REGISTRY = {
  /* Accuracy (Phase 4: evaluated at level:end from levelShotsFired / levelShotsHits) */
  acc_participation: { name:'Participation Trophy', desc:'Clear a level at 50% accuracy or less', tiers:[5,15,35,75,150],  weekly:true  },
  acc_spray:         { name:'Spray and Pray',       desc:'Clear a level at 30% accuracy or less', tiers:[3,10,25,50,100],  weekly:false, hidden:true },
  acc_marksman:      { name:'Marksman',             desc:'Clear a level at 75%+ accuracy',        tiers:[5,15,35,75,150],  weekly:true  },
  acc_sharpshooter:  { name:'Sharpshooter',         desc:'Clear a level at 85%+ accuracy',        tiers:[3,10,25,50,100],  weekly:true  },
  acc_surgical:      { name:'Surgical',             desc:'Clear a level at 95%+ accuracy',        tiers:[1,5,15,35,75],    weekly:true  },
  acc_one_job:       { name:'One Job',              desc:'Clear a level with no missed shots',    tiers:[1,3,10,25,50],    weekly:false, hidden:true },
  acc_quality:       { name:'Quality over Quantity',desc:'Clear a level using 10 shots or fewer', tiers:[3,10,25,50,100],  weekly:true  },

  /* Bounce Shot (Phase 4: per-shot tracking on enemy:died payload) */
  bnc_bank:            { name:'Bank Shot',          tiers:[10,30,75,150,300], weekly:true  },
  bnc_cue_ball:        { name:'Cue Ball',           tiers:[5,20,50,100,200],  weekly:true  },
  bnc_pool_shark:      { name:'Pool Shark',         tiers:[3,10,25,50,100],   weekly:true  },
  bnc_geometry_brain:  { name:'Geometry Brain',     tiers:[3,10,25,50,100],   weekly:true  },
  bnc_geometry_teacher:{ name:'Geometry Teacher',   tiers:[3,10,25,50,100],   weekly:true  },
  bnc_chain:           { name:'Chain Reaction',     tiers:[3,10,25,50,100],   weekly:true  },
  bnc_long_way:        { name:'The Long Way Round', tiers:[5,15,35,75,150],   weekly:true  },
  bnc_final_sweep:     { name:'Final Sweep',        tiers:[5,15,35,75,150],   weekly:true  },
  bnc_wall_flower:     { name:'Wall Flower',        tiers:[1,5,15,30,60],     weekly:true  },

  /* Phase 4 combat / conveyor — complex positional conditions */
  cmb_confrontational: { name:'Confrontational',    tiers:[5,20,50,100,200],  weekly:true  },
  cmb_blind_shot:      { name:'Blind Shot',         tiers:[3,10,25,50,100],   weekly:true  },
  cmb_recall_notice:   { name:'Recall Notice',      tiers:[5,20,50,100,200],  weekly:true  },
  conv_wrong_aisle:    { name:'Wrong Aisle',        tiers:[3,10,25,50,100],   weekly:true  },

  /* Progression */
  prg_temp:       { name:'The Temp',          tiers:[1,10,25,50,100],   weekly:false },
  prg_director:   { name:'Regional Director', tiers:[1,5,15,30,60],     weekly:false },
  prg_ceo:        { name:'CEO',               tiers:[1,3,10,25,50],     weekly:false, stub:true, stubReason:'requires difficulty system' },
  prg_spring:     { name:'Spring Cleaning',   tiers:[1,5,15,30,60],     weekly:true  },
  prg_manual:     { name:'Read the Manual',   tiers:[1,3,10,25,50],     weekly:false },

  /* Survival */
  surv_spotless:    { name:'Spotless Record',  tiers:[5,15,35,75,150],  weekly:true  },
  surv_teflon:      { name:'Teflon Dan',       tiers:[3,10,25,50,100],  weekly:true  },
  surv_skeleton:    { name:'Skeleton Crew',    tiers:[3,10,25,50,100],  weekly:true  },
  surv_osha:        { name:'OSHA Violation',   tiers:[3,10,25,50,100],  weekly:false },
  surv_no_stopping: { name:'No Stopping',      tiers:[3,10,25,50,100],  weekly:true  },
  surv_hot_streak:  { name:'Hot Streak',       tiers:[1,5,15,30,60],    weekly:true  },

  /* Speed */
  spd_rush:   { name:'Rush Job',     tiers:[5,15,35,75,150],  weekly:true  },
  spd_lunch:  { name:'Lunch Break',  tiers:[3,10,25,50,100],  weekly:true  },

  /* Atomic Dustbin */
  dust_option:     { name:'Atomic Option',        tiers:[3,10,25,50,100],  weekly:true  },
  dust_reserve:    { name:'Strategic Reserve',     tiers:[5,15,35,75,150],  weekly:true  },
  dust_disgruntled:{ name:'Disgruntled Employee',  tiers:[3,10,25,50,100],  weekly:false, hidden:true },
  dust_env_hazard: { name:'Environmental Hazard',  tiers:[3,10,25,50,100],  weekly:true  },
  dust_heavy_hitter:{ name:'Heavy Hitter',         tiers:[50,150,350,750,1500], weekly:false },

  /* Worker Rescue */
  wrk_first_responder:{ name:'First Responder',    tiers:[5,15,35,75,150],  weekly:true  },
  wrk_hero:           { name:'Hero of the Warehouse',tiers:[5,15,35,75,150], weekly:true  },
  wrk_nick:           { name:'In the Nick of Time', tiers:[5,15,35,75,150],  weekly:true  },
  wrk_danger_pay:     { name:'Danger Pay',          tiers:[3,10,25,50,100],  weekly:true  },
  wrk_union_rep:      { name:'Union Rep',           tiers:[25,100,250,500,1000], weekly:false },
  wrk_last_man:       { name:'Last Man Standing',   tiers:[3,10,25,50,100],  weekly:true  },
  wrk_attendance:     { name:'Perfect Attendance',  tiers:[1,5,15,30,60],    weekly:true  },
  wrk_zero_hour:      { name:'Zero Hour',           tiers:[1,5,15,30,60],    weekly:true  },
  wrk_escort:         { name:'Escort Duty',         tiers:[5,15,35,75,150],  weekly:true  },
  wrk_tag_team:       { name:'Tag Team',            tiers:[5,15,35,75,150],  weekly:true  },
  wrk_nobody:         { name:'Nobody Left Behind',  tiers:[1,3,10,25,50],    weekly:true  },
  wrk_unionized:      { name:'Unionized',           tiers:[3,10,25,50,100],  weekly:true  },
  wrk_understaffed:   { name:'Understaffed',        tiers:[1,3,10,25,50],    weekly:false, hidden:true },

  /* Combat — lifetime type-specific counters */
  cmb_decommissioned:{ name:'Decommissioned',  tiers:[500,2000,5000,10000,25000], weekly:false },
  cmb_foam_party:    { name:'Foam Party',       tiers:[500,2000,7500,20000,50000], weekly:false },
  cmb_whistleblower: { name:'Whistleblower',    tiers:[10,50,150,300,600],   weekly:false },
  cmb_middle_mgmt:   { name:'Middle Management',tiers:[1,5,15,30,60],        weekly:false },
  cmb_pest_control:  { name:'Pest Control',     tiers:[10,50,150,300,600],   weekly:false },
  cmb_blue_collar:   { name:'Blue Collar',      tiers:[50,200,500,1000,2500],weekly:false },

  /* Combat — per-level / per-run */
  cmb_zero_waste:      { name:'Zero Waste',           tiers:[5,15,35,75,150],  weekly:true  },
  cmb_product_recall:  { name:'Product Recall',       tiers:[3,10,25,50,100],  weekly:true  },
  cmb_grounded:        { name:'Grounded',             tiers:[5,20,50,100,200], weekly:true  },
  cmb_above_pay_grade: { name:'Above My Pay Grade',   tiers:[5,15,35,75,150],  weekly:true  },
  cmb_early_retirement:{ name:'Early Retirement',     tiers:[5,15,35,75,150],  weekly:true  },
  cmb_overtime_denied: { name:'Overtime Denied',      tiers:[5,15,35,75,150],  weekly:true  },
  cmb_cleaning_spree:  { name:'Cleaning Spree',       tiers:[10,30,75,150,300],weekly:true  },
  cmb_downsizing:      { name:'Downsizing',           tiers:[3,10,25,50,100],  weekly:true  },
  cmb_deep_clean:      { name:'Deep Clean',           tiers:[3,10,25,50,100],  weekly:true  },

  /* Power-Ups & Items */
  itm_off_clock:   { name:'Off the Clock',          tiers:[5,15,35,75,150],  weekly:true  },
  itm_min_wage:    { name:'Minimum Wage Warrior',    tiers:[3,10,25,50,100],  weekly:true  },
  itm_calories:    { name:'Watching My Calories',    tiers:[5,15,35,75,150],  weekly:true  },
  itm_no_refills:  { name:'No Refills',             tiers:[3,10,25,50,100],  weekly:true  },
  itm_cost_cutting:{ name:'Cost Cutting',            tiers:[3,10,25,50,100],  weekly:true  },

  /* Score — stubs (thresholds not set) */
  scr_bonus:     { name:'Performance Bonus',  tiers:null, weekly:true,  stub:true, stubReason:'thresholds not set' },
  scr_quarterly: { name:'Quarterly Targets',  tiers:null, weekly:true,  stub:true, stubReason:'thresholds not set' },
  scr_annual:    { name:'Annual Review',       tiers:null, weekly:true,  stub:true, stubReason:'thresholds not set' },

  /* Phase 2 tracking (legacy names kept for localStorage compatibility) */
  wrk_total_rescued: { name:'_compat_wrk_total',  tiers:[25,100,250,500,1000], weekly:false },
  pwr_stocked:       { name:'_compat_pwr_stocked', tiers:[1,5,15,30,60],       weekly:false },
  pwr_vending_total: { name:'_compat_pwr_vending', tiers:[1,5,15,30,60],       weekly:false },
};

const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

/* ---- Generic tier-check + banner push ------------------------------------ */
function _checkTiers(id) {
  const reg = REGISTRY[id];
  if (!reg || reg.stub || !reg.tiers) return;
  _ensureLifetimeEntry(id);
  const entry = _lifetime[id];
  const prev = entry.tier;
  let next = prev;
  for (let t = prev; t < reg.tiers.length; t++) {
    if (entry.progress >= reg.tiers[t]) next = t + 1;
    else break;
  }
  if (next > prev) {
    entry.tier = next;
    _saveLifetime();
    _logLevelProgress(id, { newTier: true });
    _pushBanner(reg.name, `${TIER_NAMES[next - 1]} unlocked`);
  }
}

/* Increment lifetime progress and check tiers in one call. */
function _inc(id, amount = 1) {
  const reg = REGISTRY[id];
  if (!reg || reg.stub) return 0;
  const total = _incLifetime(id, amount);
  _logLevelProgress(id);          // record advance for the post-level modal
  _checkTiers(id);                // may upgrade isNew if a tier was crossed
  return total;
}

/* Unlock a weekly achievement once (idempotent). */
function _weeklyUnlock(id) {
  const reg = REGISTRY[id];
  if (!reg || reg.stub || !reg.weekly) return;
  if (_unlockWeekly(id)) {
    _incWeekly(id);
    _logLevelProgress(id, { newTier: true });
    _pushBanner(reg.name, 'Weekly progress');
  }
}

/* Increment a weekly count (for weekly achievements that accumulate per week). */
function _weeklyInc(id) {
  const reg = REGISTRY[id];
  if (!reg || reg.stub || !reg.weekly) return;
  _incWeekly(id);
}

/* ---- Event handlers ----------------------------------------------------- */

function _onRunStart() {
  _session.runStartTime = Date.now();
  _session.runWorkersRescued = 0;
  _session.runWorkersAvailableTotal = 0;
  _session.runWorkersRescuedTotal = 0;
  _session.runLevelsCompleted = 0;
  _session.runPowerupsCollected = 0;
  _session.runVendingUsed = 0;
  _session.runInputMode = null;
  _session.runAuthoredLevelsCompleted = new Set();
  _session.runLevelWorkerData = [];
  _session.consecutiveDamageFreeCount = 0;
  _session.consecutiveSurviveCount = 0;
  _session.consecutiveNoRescueLevels = 0;
}

function _onLevelStart({ terminalCount, workerCount, levelNumber, isAuthored }) {
  _levelProgressLog = {};          // reset per-level progress for the post-level modal
  _session.levelStartTime = Date.now();
  _session.levelShotsFired = 0;
  _session.levelBoltHits = 0;
  _session.levelEnemiesKilled = 0;
  _session.levelDamageTaken = 0;
  _session.levelWorkersRescued = 0;
  _session.levelWorkersAvailable = workerCount ?? 5;
  _session.levelWorkersRescuedSet = new Set();
  _session.levelAnyWorkerRescued = false;
  _session.levelPowerupsCollected = 0;
  _session.levelVendingUsed = 0;
  _session.levelDustbinThrown = false;
  _session.levelStoodStill = false;
  _session.levelAllEnemiesDeadReached = false;
  _session.levelEnemyTypesKilled = new Set();
  _session.levelManagerHit = false;
  _session.levelNonBounceKill = false;
  _session.levelAnyKill = false;
  _session.lastKillWasBounce = false;
  _session.recentKillTimes = [];
  _session.lastRescueTime = 0;
  _session.levelManagerSpawnTime = 0;
  _session.levelManagerKilledBeforeFired = false;
  _session.workerFollowingMs = {};
  _session.runWorkersAvailableTotal += (workerCount ?? 5);
}

function _onLevelEnd({ levelTime, workersRescued, levelNumber, isAuthored, shotsHits, shotsFired }) {
  _session.runLevelsCompleted++;

  /* -- prg_temp: cumulative levels completed -- */
  _inc('prg_temp');

  /* ===== Phase 4: accuracy (hits / fired), evaluated at level end ===== */
  {
    const fired = _session.levelShotsFired;
    const hits  = _session.levelBoltHits;
    if (fired > 0) {
      const acc = hits / fired;            // can exceed 1.0 (Triple = 3 hits / 1 fired)
      /* -- low-accuracy "participation" awards -- */
      if (acc <= 0.50) { _inc('acc_participation'); _weeklyInc('acc_participation'); }
      if (acc <= 0.30) { _inc('acc_spray'); }
      /* -- high-accuracy awards -- */
      if (acc >= 0.75) { _inc('acc_marksman'); _weeklyInc('acc_marksman'); }
      if (acc >= 0.85) { _inc('acc_sharpshooter'); _weeklyInc('acc_sharpshooter'); }
      if (acc >= 0.95) { _inc('acc_surgical'); _weeklyInc('acc_surgical'); }
    }
    /* -- acc_one_job: no missed shots (every fired trigger connected) --
         A "miss" = a fired trigger with no hit. With Triple, hits can exceed
         fired, so "no misses" is hits >= fired (and at least one shot fired). -- */
    if (fired > 0 && hits >= fired) { _inc('acc_one_job'); }
    /* -- acc_quality: cleared the level's enemies using ≤10 shots -- */
    if (fired > 0 && fired <= 10 && _session.levelAllEnemiesDeadReached) {
      _inc('acc_quality'); _weeklyInc('acc_quality');
    }
  }

  /* -- bnc_wall_flower: every enemy this level killed by a bounce shot -- */
  if (_session.levelAnyKill && !_session.levelNonBounceKill) {
    _inc('bnc_wall_flower'); _weeklyInc('bnc_wall_flower');
  }

  /* -- spd_rush: level under 45 seconds -- */
  if (typeof levelTime === 'number' && levelTime <= 45000) {
    _inc('spd_rush');
    _weeklyInc('spd_rush');
  }

  /* -- surv_spotless: no damage taken -- */
  if (_session.levelDamageTaken === 0) {
    _inc('surv_spotless');
    _weeklyInc('surv_spotless');
    _session.consecutiveDamageFreeCount++;
  } else {
    _session.consecutiveDamageFreeCount = 0;
  }

  /* -- surv_teflon: 3 consecutive damage-free levels -- */
  if (_session.consecutiveDamageFreeCount >= 3) {
    _inc('surv_teflon');
    _weeklyInc('surv_teflon');
  }

  /* -- surv_skeleton: exactly 1 HP at level end --
       The payload doesn't carry HP directly; we use a flag set by player:hp_changed.
       hp_at_level_end is tracked as _session.levelEndHp (set on level:end payload
       if caller provides it, or via a dedicated _session field updated on hp_changed). */
  if (typeof _session.levelEndHp === 'number' && _session.levelEndHp === 1) {
    _inc('surv_skeleton');
    _weeklyInc('surv_skeleton');
  }

  /* -- surv_osha: hit 10+ times and still complete -- */
  if (_session.levelDamageTaken >= 10) {
    _inc('surv_osha');
  }

  /* -- surv_no_stopping: never stood still for 1+ second -- */
  if (!_session.levelStoodStill) {
    _inc('surv_no_stopping');
    _weeklyInc('surv_no_stopping');
  }

  /* -- surv_hot_streak: 3 consecutive levels survived (incremented by not dying) -- */
  _session.consecutiveSurviveCount++;
  if (_session.consecutiveSurviveCount >= 3) {
    _inc('surv_hot_streak');
    _weeklyInc('surv_hot_streak');
  }

  /* -- cmb_zero_waste: all enemies dead before level end -- */
  if (_session.levelAllEnemiesDeadReached) {
    _inc('cmb_zero_waste');
    _weeklyInc('cmb_zero_waste');
  }

  /* -- cmb_above_pay_grade: manager level cleared without being hit -- */
  if (levelNumber && _session.runInputMode !== null) { /* presence check only */ }
  if (!_session.levelManagerHit && _session.levelManagerSpawnTime > 0) {
    _inc('cmb_above_pay_grade');
    _weeklyInc('cmb_above_pay_grade');
  }

  /* -- dust_reserve: completed without throwing dustbin -- */
  if (!_session.levelDustbinThrown) {
    _inc('dust_reserve');
    _weeklyInc('dust_reserve');
  }

  /* -- itm_off_clock: completed without picking up power-ups -- */
  if (_session.levelPowerupsCollected === 0) {
    _inc('itm_off_clock');
    _weeklyInc('itm_off_clock');
  }

  /* -- itm_calories: completed without using vending -- */
  if (_session.levelVendingUsed === 0) {
    _inc('itm_calories');
    _weeklyInc('itm_calories');
  }

  /* -- itm_cost_cutting: no powerups AND no vending -- */
  if (_session.levelPowerupsCollected === 0 && _session.levelVendingUsed === 0) {
    _inc('itm_cost_cutting');
    _weeklyInc('itm_cost_cutting');
  }

  /* -- wrk_hero: all 5 workers rescued this level -- */
  if (_session.levelWorkersRescued >= _session.levelWorkersAvailable &&
      _session.levelWorkersAvailable > 0) {
    _inc('wrk_hero');
    _weeklyInc('wrk_hero');
  }

  /* -- wrk_zero_hour: all 5 rescued AND no damage -- */
  if (_session.levelWorkersRescued >= _session.levelWorkersAvailable &&
      _session.levelWorkersAvailable > 0 &&
      _session.levelDamageTaken === 0) {
    _inc('wrk_zero_hour');
    _weeklyInc('wrk_zero_hour');
  }

  /* -- wrk_last_man: ≥1 rescued and others not rescued -- */
  if (_session.levelWorkersRescued >= 1 &&
      _session.levelWorkersRescued < _session.levelWorkersAvailable) {
    _inc('wrk_last_man');
    _weeklyInc('wrk_last_man');
  }

  /* Track run-level worker data for per-run worker achievements. */
  _session.runLevelWorkerData.push({
    available: _session.levelWorkersAvailable,
    rescued: _session.levelWorkersRescued,
  });

  /* -- wrk_understaffed: consecutive levels with no rescues -- */
  if (_session.levelWorkersRescued === 0) {
    _session.consecutiveNoRescueLevels++;
  } else {
    _session.consecutiveNoRescueLevels = 0;
  }
  if (_session.consecutiveNoRescueLevels >= 5) {
    _inc('wrk_understaffed');
  }

  /* -- prg_spring: authored-level tracking (caller must pass isAuthored flag) -- */
  if (isAuthored && typeof levelNumber === 'number') {
    _session.runAuthoredLevelsCompleted.add(levelNumber);
    /* Blueprint: 5 authored levels total. When all 5 are completed in one run. */
    if (_session.runAuthoredLevelsCompleted.size >= 5) {
      _inc('prg_spring');
      _weeklyInc('prg_spring');
    }
  }
}

function _onRunEnd({ runTime, levelsCompleted, totalScore, inputMode }) {
  /* -- prg_director: cumulative runs completed -- */
  _inc('prg_director');

  /* -- spd_lunch: full run in under 15 minutes -- */
  if (typeof runTime === 'number' && runTime <= 900000) {
    _inc('spd_lunch');
    _weeklyInc('spd_lunch');
  }

  /* -- itm_min_wage: full run without any power-ups -- */
  if (_session.runPowerupsCollected === 0) {
    _inc('itm_min_wage');
    _weeklyInc('itm_min_wage');
  }

  /* -- itm_no_refills: full run without any vending -- */
  if (_session.runVendingUsed === 0) {
    _inc('itm_no_refills');
    _weeklyInc('itm_no_refills');
  }

  /* -- wrk_attendance: all workers rescued across every level of the run -- */
  const allRescued = _session.runLevelWorkerData.length > 0 &&
    _session.runLevelWorkerData.every(d => d.available > 0 && d.rescued >= d.available);
  if (allRescued) {
    _inc('wrk_attendance');
    _weeklyInc('wrk_attendance');
  }

  /* -- wrk_nobody: every available worker rescued across the entire run -- */
  if (allRescued) {
    _inc('wrk_nobody');
    _weeklyInc('wrk_nobody');
  }

  /* -- wrk_unionized: at least 1 worker rescued on every level -- */
  const allLevelsHadRescue = _session.runLevelWorkerData.length > 0 &&
    _session.runLevelWorkerData.every(d => d.rescued >= 1);
  if (allLevelsHadRescue) {
    _inc('wrk_unionized');
    _weeklyInc('wrk_unionized');
  }

  /* -- cmb_product_recall: one of every enemy type killed this run -- */
  /* Tracked across levels via _session.runEnemyTypesKilled (set below). */
  const allTypes = ['picker','forklift','security','sorter','cleaner','drone','manager','scanner','inventory'];
  if (_session.runEnemyTypesKilled &&
      allTypes.every(t => _session.runEnemyTypesKilled.has(t))) {
    _inc('cmb_product_recall');
    _weeklyInc('cmb_product_recall');
  }

  /* -- prg_manual: full level on gamepad (inputMode set from run:input_mode_set) -- */
  if (inputMode === 'gamepad' && levelsCompleted >= 1) {
    _inc('prg_manual');
  }

  /* Score stubs: do nothing (stub entries short-circuit at _inc). */
}

function _onBoltFired({ kind, isTripleShotActive }) {
  _session.levelShotsFired++;
  const total = _incLifetime('cmb_foam_party');
  _lifetime['cmb_foam_party'].progress = total;
  _checkTiers('cmb_foam_party');
}

function _onBoltHit({ targetType, bounceCount, uniqueWallCount }) {
  // Each connecting bullet counts as a hit (Triple = up to 3 hits / 1 fired).
  // Accuracy is evaluated at level:end; bounce-kill credit is on enemy:died.
  _session.levelBoltHits++;
}

function _onBoltMissed() {
  // Accuracy is computed at level:end from levelShotsFired vs levelBoltHits.
}

function _onBoltExpired() {
  // Accuracy is computed at level:end from levelShotsFired vs levelBoltHits.
}

/* cmb_recall_notice: a homing missile that had acquired Dan hit a wall or another
   entity instead of him. */
function _onHomingRedirected() {
  _inc('cmb_recall_notice'); _weeklyInc('cmb_recall_notice');
}

function _onEnemyDied({ type, killerKind, bounceCount, uniqueWallCount, chainCount, hadLOSAtFire,
                       timeAliveMs, isBounceKill, pos, danPos, danMoveHistory, danOnBelt,
                       danAimAngle, beltPush }) {
  _session.levelEnemiesKilled++;
  _session.levelEnemyTypesKilled.add(type);
  if (!_session.runEnemyTypesKilled) _session.runEnemyTypesKilled = new Set();
  _session.runEnemyTypesKilled.add(type);

  /* ===== Phase 4: bounce-shot, accuracy-context, and positional kills ===== */
  const bc  = bounceCount ?? 0;
  const uwc = uniqueWallCount ?? 0;

  _session.levelAnyKill = true;
  _session.lastKillWasBounce = !!isBounceKill;
  if (!isBounceKill) _session.levelNonBounceKill = true;   // fails bnc_wall_flower

  if (isBounceKill) {
    /* -- bnc_bank: bounced exactly once -- */
    if (bc === 1) { _inc('bnc_bank'); _weeklyInc('bnc_bank'); }
    /* -- bnc_cue_ball: bounced 3+ times -- */
    if (bc >= 3) { _inc('bnc_cue_ball'); _weeklyInc('bnc_cue_ball'); }
    /* -- bnc_pool_shark: bounced 5+ times -- */
    if (bc >= 5) { _inc('bnc_pool_shark'); _weeklyInc('bnc_pool_shark'); }
    /* -- bnc_geometry_brain: 4+ total bounces (wall may repeat) -- */
    if (bc >= 4) { _inc('bnc_geometry_brain'); _weeklyInc('bnc_geometry_brain'); }
    /* -- bnc_geometry_teacher: 4+ UNIQUE walls -- */
    if (uwc >= 4) { _inc('bnc_geometry_teacher'); _weeklyInc('bnc_geometry_teacher'); }
    /* -- bnc_long_way: bounce kill that rounded a corner (≥2 unique walls) -- */
    if (uwc >= 2) { _inc('bnc_long_way'); _weeklyInc('bnc_long_way'); }
    /* -- bnc_chain: one bounce shot hit 4+ enemies in sequence --
         Wired per Phase 4 spec; dormant while shots are consumed on first hit
         (chainCount never exceeds 1 without a pierce mechanic). -- */
    if ((chainCount ?? 0) >= 4) { _inc('bnc_chain'); _weeklyInc('bnc_chain'); }
    /* -- cmb_blind_shot: ricochet kill with no LOS to the target at fire time -- */
    if (hadLOSAtFire === false) { _inc('cmb_blind_shot'); _weeklyInc('cmb_blind_shot'); }
  }

  /* -- cmb_confrontational: Security Bot killed head-on (no lateral input in
        the 500 ms window before the kill) -- */
  if (type === 'security' && danPos && pos &&
      noLateralMovement(danMoveHistory, danPos, pos)) {
    _inc('cmb_confrontational'); _weeklyInc('cmb_confrontational');
  }

  /* -- conv_wrong_aisle: killed a target while a belt pushed Dan off his aim -- */
  if (danOnBelt && aimFightsBelt(danAimAngle ?? 0, beltPush)) {
    _inc('conv_wrong_aisle'); _weeklyInc('conv_wrong_aisle');
  }

  /* -- cmb_decommissioned: total kills -- */
  _inc('cmb_decommissioned');

  /* -- cmb_whistleblower: security kills -- */
  if (type === 'security') _inc('cmb_whistleblower');

  /* -- cmb_middle_mgmt: manager kills -- */
  if (type === 'manager') {
    _inc('cmb_middle_mgmt');

    /* -- cmb_overtime_denied: manager killed within 10s of spawning -- */
    if (_session.levelManagerSpawnTime > 0 && killerKind !== 'friendly') {
      const elapsed = Date.now() - _session.levelManagerSpawnTime;
      if (elapsed <= 10000) {
        _inc('cmb_overtime_denied');
        _weeklyInc('cmb_overtime_denied');
      }
    }

    /* -- cmb_early_retirement: manager killed before summoning reinforcements --
         "reinforcements" = firing a missile. Track via levelManagerKilledBeforeFired flag. */
    if (_session.levelManagerKilledBeforeFired) {
      _inc('cmb_early_retirement');
      _weeklyInc('cmb_early_retirement');
    }
  }

  /* -- cmb_pest_control: drone kills -- */
  if (type === 'drone') {
    const total = _inc('cmb_pest_control');

    /* -- cmb_grounded: drone killed before it fires --
         Tracked by _session.levelDroneFiredTypes: Set of drone-instance IDs that fired.
         Since we don't have instance IDs, we track via a flag per spawned-drone.
         Phase 2 decision: grounded = drone killed with timeAliveMs short AND killerKind not from enemy fire.
         Simpler approximation: drone killed and no 'enemy:fired' for 'drone' type was emitted
         since the last drone spawn. Track via _session.lastDroneFireTime. */
    if (!_session.droneHasFired) {
      _inc('cmb_grounded');
      _weeklyInc('cmb_grounded');
    }
    _session.droneHasFired = false; // reset for next drone
  }

  /* -- cmb_blue_collar: picker kills -- */
  if (type === 'picker') _inc('cmb_blue_collar');

  /* -- cmb_deep_clean: 3 cleaner kills within 5 seconds -- */
  if (type === 'cleaner') {
    const now = Date.now();
    _session.recentCleanerKills = (_session.recentCleanerKills ?? []).filter(t => now - t <= 5000);
    _session.recentCleanerKills.push(now);
    if (_session.recentCleanerKills.length >= 3) {
      _inc('cmb_deep_clean');
      _weeklyInc('cmb_deep_clean');
    }
  }

  /* -- dust_env_hazard: manager killed by dustbin -- */
  if (type === 'manager' && killerKind === 'dustbin') {
    _inc('dust_env_hazard');
    _weeklyInc('dust_env_hazard');
  }

  /* -- cmb_cleaning_spree / cmb_downsizing: 5 / 10 kills within 10 seconds -- */
  {
    const now = Date.now();
    _session.recentKillTimes = _session.recentKillTimes.filter(t => now - t <= 10000);
    _session.recentKillTimes.push(now);
    if (_session.recentKillTimes.length >= 10) {
      _inc('cmb_downsizing');
      _weeklyInc('cmb_downsizing');
    } else if (_session.recentKillTimes.length >= 5) {
      _inc('cmb_cleaning_spree');
      _weeklyInc('cmb_cleaning_spree');
    }
  }

  /* -- wrk_tag_team: kill within 2 seconds of a rescue -- */
  if (_session.lastRescueTime > 0 && Date.now() - _session.lastRescueTime <= 2000) {
    _inc('wrk_tag_team');
    _weeklyInc('wrk_tag_team');
  }
}

function _onEnemySpawned({ type, timeInLevel }) {
  if (type === 'manager') {
    _session.levelManagerSpawnTime = Date.now();
    _session.levelManagerKilledBeforeFired = true; // optimistic; cleared if it fires
  }
  if (type === 'drone') {
    _session.droneHasFired = false;
  }
}

function _onEnemyFired({ type }) {
  if (type === 'manager') {
    _session.levelManagerKilledBeforeFired = false;
  }
  if (type === 'drone') {
    _session.droneHasFired = true;
  }
}

function _onPlayerHit({ dmg, source }) {
  _session.levelDamageTaken += dmg ?? 1;
  if (source === 'manager' || source === 'homing') {
    _session.levelManagerHit = true;
  }
}

function _onPlayerHpChanged({ hp, maxHp }) {
  _session.levelEndHp = hp; // updated every HP change; last value at level:end is current HP
}

function _onPlayerDied() {
  /* Reset consecutive survive streak on death. */
  _session.consecutiveSurviveCount = 0;
}

function _onPlayerStoodStill({ durationMs }) {
  _session.levelStoodStill = true;
}

function _onConveyorPushStart() {
  // Phase 4+: conv_wrong_aisle
}

function _onConveyorPushTick({ dx, dy }) {
  // Phase 4+: conv_wrong_aisle
}

function _onWorkerRescued({ workerIndex, timeInLevelMs, playerHP, followingDurationMs }) {
  _session.levelWorkersRescued++;
  _session.runWorkersRescued++;
  _session.runWorkersRescuedTotal++;
  if (_session.levelWorkersRescuedSet) _session.levelWorkersRescuedSet.add(workerIndex);
  _session.levelAnyWorkerRescued = true;
  _session.lastRescueTime = Date.now();

  /* -- wrk_union_rep: cumulative lifetime rescues -- */
  _inc('wrk_union_rep');

  /* -- wrk_total_rescued: legacy compat counter -- */
  _incLifetime('wrk_total_rescued');
  _saveLifetime();

  /* -- wrk_first_responder: rescued within 30 seconds of level start -- */
  if (typeof timeInLevelMs === 'number' && timeInLevelMs <= 30000) {
    _inc('wrk_first_responder');
    _weeklyInc('wrk_first_responder');
  }

  /* -- wrk_nick: rescued at half health or less (≤ maxHp/2) --
       We don't have maxHp in this payload; use a threshold of ≤ 10 (half of 20). */
  if (typeof playerHP === 'number' && playerHP <= 10) {
    _inc('wrk_nick');
    _weeklyInc('wrk_nick');
  }

  /* -- wrk_danger_pay: rescued at exactly 1 HP -- */
  if (typeof playerHP === 'number' && playerHP === 1) {
    _inc('wrk_danger_pay');
    _weeklyInc('wrk_danger_pay');
  }

  /* -- wrk_escort: worker was following for 5+ consecutive seconds -- */
  if (typeof followingDurationMs === 'number' && followingDurationMs >= 5000) {
    _inc('wrk_escort');
    _weeklyInc('wrk_escort');
  }
}

function _onWorkerDied({ workerIndex }) {
  // Worker deaths don't directly trigger any Phase 3 achievements;
  // they affect per-level rescue counts (already tracked via levelWorkersAvailable).
}

function _onWorkerFollowingStart({ workerIndex }) {
  _session.workerFollowingMs[workerIndex] = 0;
}

function _onWorkerFollowingTick({ workerIndex, durationMs }) {
  _session.workerFollowingMs[workerIndex] = durationMs;
}

function _onPowerupCollected({ kind }) {
  _session.levelPowerupsCollected++;
  _session.runPowerupsCollected++;
  _incLifetime('pwr_stocked');
  _saveLifetime();
}

function _onVendingUsed({ variant, hpGained }) {
  _session.levelVendingUsed++;
  _session.runVendingUsed++;
  _incLifetime('pwr_vending_total');
  _saveLifetime();
}

function _onDustbinThrown() {
  _session.levelDustbinThrown = true;
  _inc('dust_heavy_hitter'); // cumulative throw counter
}

function _onDustbinBounced({ totalWallCount, uniqueWallCount }) {
  /* -- dust_disgruntled: bounce dustbin off 3+ walls before detonation -- */
  if (totalWallCount >= 3) {
    _inc('dust_disgruntled');
  }
}

function _onDustbinDetonated({ killCount }) {
  /* -- dust_option: kill 3+ enemies with one detonation -- */
  if (typeof killCount === 'number' && killCount >= 3) {
    _inc('dust_option');
    _weeklyInc('dust_option');
  }
}

function _onLevelAllEnemiesDead() {
  _session.levelAllEnemiesDeadReached = true;

  /* -- bnc_final_sweep: the kill that emptied the level was a bounce kill -- */
  if (_session.lastKillWasBounce) {
    _inc('bnc_final_sweep'); _weeklyInc('bnc_final_sweep');
  }
}

function _onRunInputModeSet({ mode }) {
  _session.runInputMode = mode;
}

/* ---- Named handler references for off() deduplication ------------------- */
const _handlers = {
  'run:start':              _onRunStart,
  'level:start':            _onLevelStart,
  'level:end':              _onLevelEnd,
  'run:end':                _onRunEnd,
  'bolt:fired':             _onBoltFired,
  'bolt:hit':               _onBoltHit,
  'bolt:missed':            _onBoltMissed,
  'bolt:expired':           _onBoltExpired,
  'bolt:homing_redirected': _onHomingRedirected,
  'enemy:died':             _onEnemyDied,
  'enemy:spawned':          _onEnemySpawned,
  'enemy:fired':            _onEnemyFired,
  'player:hit':             _onPlayerHit,
  'player:hp_changed':      _onPlayerHpChanged,
  'player:died':            _onPlayerDied,
  'player:stood_still':     _onPlayerStoodStill,
  'conveyor:push_start':    _onConveyorPushStart,
  'conveyor:push_tick':     _onConveyorPushTick,
  'worker:rescued':         _onWorkerRescued,
  'worker:died':            _onWorkerDied,
  'worker:following_start': _onWorkerFollowingStart,
  'worker:following_tick':  _onWorkerFollowingTick,
  'powerup:collected':      _onPowerupCollected,
  'vending:used':           _onVendingUsed,
  'dustbin:thrown':         _onDustbinThrown,
  'dustbin:bounced':        _onDustbinBounced,
  'dustbin:detonated':      _onDustbinDetonated,
  'level:all_enemies_dead': _onLevelAllEnemiesDead,
  'run:input_mode_set':     _onRunInputModeSet,
};

/* ---- Public API ---------------------------------------------------------- */

export function initAchievements() {
  /* Reset per-run and per-level session state. */
  _session.runStartTime = Date.now();
  _session.levelStartTime = Date.now();
  _session.levelShotsFired = 0;
  _session.levelBoltHits = 0;
  _session.levelEnemiesKilled = 0;
  _session.levelDamageTaken = 0;
  _session.levelWorkersRescued = 0;
  _session.levelWorkersAvailable = 5;
  _session.levelWorkersRescuedSet = new Set();
  _session.levelAnyWorkerRescued = false;
  _session.levelPowerupsCollected = 0;
  _session.levelVendingUsed = 0;
  _session.levelDustbinThrown = false;
  _session.levelStoodStill = false;
  _session.levelAllEnemiesDeadReached = false;
  _session.levelEnemyTypesKilled = new Set();
  _session.levelManagerHit = false;
  _session.levelNonBounceKill = false;
  _session.levelAnyKill = false;
  _session.lastKillWasBounce = false;
  _session.recentKillTimes = [];
  _session.recentCleanerKills = [];
  _session.lastRescueTime = 0;
  _session.levelManagerSpawnTime = 0;
  _session.levelManagerKilledBeforeFired = false;
  _session.workerFollowingMs = {};
  _session.droneHasFired = false;
  _session.levelEndHp = null;
  _session.runWorkersRescued = 0;
  _session.runWorkersAvailableTotal = 0;
  _session.runWorkersRescuedTotal = 0;
  _session.runLevelsCompleted = 0;
  _session.runPowerupsCollected = 0;
  _session.runVendingUsed = 0;
  _session.runInputMode = null;
  _session.runAuthoredLevelsCompleted = new Set();
  _session.runLevelWorkerData = [];
  _session.runEnemyTypesKilled = new Set();
  _session.consecutiveDamageFreeCount = 0;
  _session.consecutiveSurviveCount = 0;
  _session.consecutiveNoRescueLevels = 0;

  _bannerQueue = [];
  _levelProgressLog = {};

  /* Load and validate persistent state; detect week rollover. */
  _loadLifetime();
  _loadWeekly();

  /* Re-register handlers (off+on pattern prevents duplicates across newGame() calls). */
  for (const [event, handler] of Object.entries(_handlers)) {
    off(event, handler);
    on(event, handler);
  }
}

/* ---- Weekly rotation (Phase 5) ------------------------------------------
   The active weekly set is selected by `setIndex = isoWeekNumber % totalSets`.
   The full set-by-set rotation has NOT been authored yet, so as a PLACEHOLDER
   we return the first 5 weekly-eligible achievements from the registry as the
   active set for every week. Replace this with the authored rotation table
   (sets of 5 achievement ids, indexed by setIndex) once it exists — only this
   `_activeWeeklyIds()` body needs to change; the assembly below stays.
   -------------------------------------------------------------------------- */
function _isoWeekNumber() {
  // Mirrors isoWeekKey(); returns just the integer ISO week number.
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function _activeWeeklyIds() {
  // PLACEHOLDER: first 5 weekly-eligible, non-stub, non-compat achievements.
  // setIndex is computed for forward-compat but unused until a rotation table exists.
  const setIndex = _isoWeekNumber() % 1; // totalSets === 1 placeholder → always 0
  void setIndex;
  const ids = [];
  for (const [id, reg] of Object.entries(REGISTRY)) {
    if (reg.weekly && !reg.stub && !reg.name.startsWith('_compat')) ids.push(id);
    if (ids.length === 5) break;
  }
  return ids;
}

/* Returns 6 entries for the title-screen weekly panel: the 5 active weekly
   achievements plus the meta_eotw slot (count of the 5 completed this week).
   Each entry: { id, name, description, progress, target, unlocked }. */
export function getWeeklyAchievements() {
  const activeIds = _activeWeeklyIds();
  const entries = activeIds.map(id => {
    const reg = REGISTRY[id];
    const w = _weekly[id] ?? { unlocked: false, progress: 0 };
    const progress = w.progress ?? 0;
    // "Completed this week" = completed at least once. Accumulating weeklies bump
    // `progress` via _weeklyInc without flipping `unlocked`, so derive completion
    // from either signal.
    const unlocked = !!w.unlocked || progress >= 1;
    return {
      id,
      name: reg.name,
      description: reg.desc ?? '',
      progress,
      target: 1,                 // weekly = complete-at-least-once this week
      unlocked,
    };
  });

  const completedCount = entries.filter(e => e.unlocked).length;
  entries.push({
    id: 'meta_eotw',
    name: 'Employee of the Week',
    description: 'Complete all 5 weekly achievements',
    progress: completedCount,
    target: activeIds.length,
    unlocked: completedCount >= activeIds.length && activeIds.length > 0,
  });

  return entries;
}

/* ---- Phase 6: post-level modal summary ----------------------------------
   Returns every achievement that advanced during the level just completed, as an
   array of { id, name, description, progress, target, tier, isNew }. Empty when
   nothing progressed (the modal is then skipped). Populated by _logLevelProgress
   from _inc / _checkTiers / weekly-unlock; cleared on level:start. NEW! entries
   (newly-promoted tiers / newly-unlocked weeklies) sort to the top. ----------- */
export function getLevelAchievementSummary() {
  const entries = Object.values(_levelProgressLog).map(e => ({
    id: e.id,
    name: e.name,
    description: e.description,
    progress: e.progress,
    target: e.target,
    tier: e.tier,
    isNew: !!e.isNew,
  }));
  entries.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  return entries;
}

/* ---- Phase 6: lifetime achievements modal -------------------------------
   Category metadata in ACHIEVEMENTS.md order (emoji + display name). Each entry's
   category is derived from its id prefix. -------------------------------------- */
const CATEGORIES = [
  { key: 'acc',  emoji: '🎯', name: 'Accuracy' },
  { key: 'bnc',  emoji: '💥', name: 'Bounce Shot' },
  { key: 'surv', emoji: '🧹', name: 'Survival & Damage' },
  { key: 'spd',  emoji: '⚡', name: 'Speed' },
  { key: 'dust', emoji: '💣', name: 'Atomic Dustbin' },
  { key: 'wrk',  emoji: '👷', name: 'Worker Rescue' },
  { key: 'cmb',  emoji: '🤖', name: 'Combat & Enemy-Specific' },
  { key: 'conv', emoji: '🏭', name: 'Conveyor Belt' },
  { key: 'itm',  emoji: '🛠️', name: 'Power-Ups & Items' },
  { key: 'scr',  emoji: '📈', name: 'Score' },
  { key: 'prg',  emoji: '📅', name: 'Progression' },
];

function _categoryFor(id) {
  const prefix = id.split('_')[0];
  return CATEGORIES.find(c => c.key === prefix) ?? null;
}

/* Returns the full registry grouped by category (ACHIEVEMENTS.md order), each
   achievement merged with current tier/progress from localStorage. Hidden
   achievements at tier 0 are masked as '???'. Compat (_compat_*) and stub
   entries are omitted. Shape:
     [{ emoji, name, achievements: [
        { id, name, description, tier, progress, tiers, nextTarget, hidden } ] }] */
export function getLifetimeAchievements() {
  const groups = CATEGORIES.map(c => ({ emoji: c.emoji, name: c.name, achievements: [] }));
  const groupByKey = Object.fromEntries(CATEGORIES.map((c, i) => [c.key, groups[i]]));

  for (const [id, reg] of Object.entries(REGISTRY)) {
    if (reg.stub) continue;
    if (reg.name.startsWith('_compat')) continue;
    const cat = _categoryFor(id);
    if (!cat) continue;
    const stored = _lifetime[id] ?? { tier: 0, progress: 0 };
    const tier = stored.tier ?? 0;
    const tiers = reg.tiers ?? [];
    const masked = reg.hidden && tier === 0;
    const nextTarget = tier < tiers.length ? tiers[tier]
                     : (tiers[tiers.length - 1] ?? 0);
    groupByKey[cat.key].achievements.push(masked
      ? { id: '???', name: '???', description: '???', tier: 0,
          progress: 0, tiers, nextTarget, hidden: true }
      : { id, name: reg.name, description: reg.desc ?? '', tier,
          progress: stored.progress ?? 0, tiers, nextTarget, hidden: !!reg.hidden });
  }

  return groups.filter(g => g.achievements.length > 0);
}

/* Raw lifetime map { [id]: {tier, progress} } — used by headless tests to inspect
   stored progress directly. The UI uses the grouped getLifetimeAchievements(). */
export function getLifetimeRaw() { return _lifetime; }

export function getXP() { return lsGet(KEY_XP) ?? 0; }
