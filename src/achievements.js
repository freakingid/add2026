/* =========================================================================
   achievements.js — Phase 2 implementation.

   Subscribes to all game events via events.js and maintains:
     - Module-local session state (no G mutations)
     - Lifetime progress in localStorage (add_lifetime)
     - Weekly progress in localStorage (add_weekly_{year}_{week})
     - ISO week rollover detection (add_weekly_meta)
     - In-play banner queue (pulled by render.js)

   Imports only from events.js (dependency flows one way to game modules).
   ========================================================================= */
import { on, off } from './events.js';

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

/* ---- localStorage schema keys ------------------------------------------- */
const KEY_LIFETIME    = 'add_lifetime';
const KEY_WEEKLY_META = 'add_weekly_meta';
const KEY_XP          = 'add_xp';
const KEY_EOTW_STREAK = 'add_eotw_streak';
function weeklyKey(key) { return `add_weekly_${key}`; }

/* ---- In-play banner queue ----------------------------------------------- */
let _bannerQueue = [];

export function popAchievementBanner() {
  return _bannerQueue.shift() ?? null;
}

function _pushBanner(text, subtext) {
  if (_bannerQueue.length >= 5) _bannerQueue.shift(); // cap queue at 5
  _bannerQueue.push({ text, subtext, timestamp: Date.now() });
}

/* ---- Module-local session state ----------------------------------------- */
let _session = {
  levelStartTime: 0,
  runStartTime: 0,
  levelShotsFired: 0,
  levelEnemiesKilled: 0,
  levelDamageTaken: 0,
  levelWorkersRescued: 0,
  levelPowerupsCollected: 0,
  levelVendingUsed: 0,
  levelDustbinThrown: false,
  runWorkersRescued: 0,
  runPowerupsCollected: 0,
  runVendingUsed: 0,
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
    // New week — discard any in-memory progress for the new week (old key remains
    // as a tombstone in localStorage; we don't need to clean it up).
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
    return true; // newly unlocked this call
  }
  return false;
}

/* ---- Achievement thresholds (Phase 2: lifetime foam party tiers) --------- */
const CMB_FOAM_PARTY_TIERS = [500, 2000, 5000, 10000, 25000];

function _checkFoamParty(totalFired) {
  _ensureLifetimeEntry('cmb_foam_party');
  const tierNames = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
  const prev = _lifetime['cmb_foam_party'].tier;
  let unlocked = prev;
  for (let t = prev; t < CMB_FOAM_PARTY_TIERS.length; t++) {
    if (totalFired >= CMB_FOAM_PARTY_TIERS[t]) unlocked = t + 1;
    else break;
  }
  if (unlocked > prev) {
    _lifetime['cmb_foam_party'].tier = unlocked;
    _saveLifetime();
    _pushBanner('Foam Party', `${tierNames[unlocked - 1]} unlocked — ${CMB_FOAM_PARTY_TIERS[unlocked - 1].toLocaleString()} bubbles fired`);
  }
}

/* ---- Event handlers ----------------------------------------------------- */

function _onRunStart() {
  _session.runStartTime = Date.now();
  _session.runWorkersRescued = 0;
  _session.runPowerupsCollected = 0;
  _session.runVendingUsed = 0;
}

function _onLevelStart({ terminalCount, workerCount }) {
  _session.levelStartTime = Date.now();
  _session.levelShotsFired = 0;
  _session.levelEnemiesKilled = 0;
  _session.levelDamageTaken = 0;
  _session.levelWorkersRescued = 0;
  _session.levelPowerupsCollected = 0;
  _session.levelVendingUsed = 0;
  _session.levelDustbinThrown = false;
}

function _onLevelEnd({ levelTime, workersRescued, levelNumber }) {
  // Reserved for per-level checks. Populated in Phase 3+.
}

function _onRunEnd({ runTime, levelsCompleted, totalScore, inputMode }) {
  // Reserved for run-end checks (score achievements, etc.). Populated in Phase 3+.
}

function _onBoltFired({ kind, isTripleShotActive }) {
  _session.levelShotsFired++;
  const total = _incLifetime('cmb_foam_party');
  _lifetime['cmb_foam_party'].progress = total;
  _checkFoamParty(total);
}

function _onBoltHit({ targetType, bounceCount, uniqueWallCount }) {
  // Phase 3/4 will implement bounce / blind shot achievements. Data captured here.
}

function _onBoltMissed() {
  // Phase 3+: accuracy achievements.
}

function _onBoltExpired() {
  // Phase 3+: accuracy achievements.
}

function _onEnemyDied({ type, killerKind, bounceCount, uniqueWallCount, hadLOSAtFire, timeAliveMs, isBounceKill }) {
  _session.levelEnemiesKilled++;
  _incLifetime('cmb_decommissioned'); // total enemy kill counter
}

function _onEnemySpawned({ type, timeInLevel }) {
  // Phase 3+.
}

function _onEnemyFired({ type }) {
  // Phase 3+.
}

function _onPlayerHit({ dmg, source }) {
  _session.levelDamageTaken += dmg;
}

function _onPlayerHpChanged({ hp, maxHp }) {
  // Phase 3+: survival achievements.
}

function _onPlayerDied() {
  // Phase 3+.
}

function _onPlayerStoodStill({ durationMs }) {
  // Phase 3+: surv_no_stopping.
}

function _onConveyorPushStart() {
  // Phase 4+.
}

function _onConveyorPushTick({ dx, dy }) {
  // Phase 4+: conv_wrong_aisle.
}

function _onWorkerRescued({ workerIndex, timeInLevelMs, playerHP, followingDurationMs }) {
  _session.levelWorkersRescued++;
  _session.runWorkersRescued++;
  _incLifetime('wrk_total_rescued');
}

function _onWorkerDied({ workerIndex }) {
  // Phase 3+.
}

function _onWorkerFollowingStart({ workerIndex }) {
  // Phase 3+.
}

function _onWorkerFollowingTick({ workerIndex, durationMs }) {
  // Phase 3+.
}

function _onPowerupCollected({ kind }) {
  _session.levelPowerupsCollected++;
  _session.runPowerupsCollected++;
  _incLifetime('pwr_stocked');
}

function _onVendingUsed({ variant, hpGained }) {
  _session.levelVendingUsed++;
  _session.runVendingUsed++;
  _incLifetime('pwr_vending_total');
}

function _onDustbinThrown() {
  _session.levelDustbinThrown = true;
  _incLifetime('dust_heavy_hitter'); // cumulative throw counter
}

function _onDustbinBounced({ totalWallCount, uniqueWallCount }) {
  // Phase 4+: bounce achievements.
}

function _onDustbinDetonated({ killCount }) {
  // Phase 3+: mass-kill achievements.
}

function _onLevelAllEnemiesDead() {
  // Phase 3+: cmb_zero_waste.
}

function _onRunInputModeSet({ mode }) {
  // Phase 3+: prg_manual (gamepad achievement).
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
  // Reset session state.
  _session.runStartTime = Date.now();
  _session.levelStartTime = Date.now();
  _session.levelShotsFired = 0;
  _session.levelEnemiesKilled = 0;
  _session.levelDamageTaken = 0;
  _session.levelWorkersRescued = 0;
  _session.levelPowerupsCollected = 0;
  _session.levelVendingUsed = 0;
  _session.levelDustbinThrown = false;
  _session.runWorkersRescued = 0;
  _session.runPowerupsCollected = 0;
  _session.runVendingUsed = 0;

  _bannerQueue = [];

  // Load and validate persistent state; detect week rollover.
  _loadLifetime();
  _loadWeekly();

  // Re-register handlers (off+on pattern prevents duplicates across newGame() calls).
  for (const [event, handler] of Object.entries(_handlers)) {
    off(event, handler);
    on(event, handler);
  }
}

// Getters for render / UI modules (Phase 5+, stubs here).
export function getWeeklyAchievements() { return []; }
export function getLevelAchievementSummary() { return []; }
export function getLifetimeAchievements() { return _lifetime; }
export function getXP() { return lsGet(KEY_XP) ?? 0; }
