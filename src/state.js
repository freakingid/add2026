/* =========================================================================
   state.js — the single mutable game-state container.

   All live state that gets reassigned each run/level lives on one object `G`
   so it can be shared across modules (ES modules can't reassign an imported
   binding, but every module can read & mutate G's properties). Reads are
   `G.dan`, `G.shots`, …; whole-value resets happen via `G.shots = []` etc. in
   the level/lifecycle code.
   ========================================================================= */
import { LEVEL_PLAN } from "./config.js";

export const G = {
  // run / meta
  state:"title",       // title | playing | paused | levelclear | dead
  score:0,
  high:0,
  level:1,
  musicTrackIndex:0,   // cycles through TRACKS on each new level (not persisted in saves)
  transition:0,        // countdown timer for the level-clear splash
  inputMode:null,      // null (choose on title) | "keyboard" | "gamepad" (GDD §4.5)

  // game mode + playlist (set at title before the run starts)
  gameMode:"levelPlan",       // "levelPlan" | "handAuthored"
  playlist:null,              // loaded playlist object or null
  playlistIndex:0,            // current position in playlist.levels[]
  availablePlaylists:[],      // [{name, filename, levels}] loaded at boot
  _titlePhase:"input",        // "input" | "mode" | "playlist" (title sub-state)
  _loadSaveCursor:0,          // highlighted slot on the title load screen (Phase 3)
  _titleMenuCursor:0,         // selected row on the mode / playlist title screens

  // entities (populated by newGame / buildLevel)
  dan:null,
  powerups:null,
  shots:[], enemies:[], terminals:[], pickups:[], marks:[], floats:[],
  ebolts:[],           // shared enemy-projectile pool (Security taser bolt is the first user)
  vending:[],          // vending machines — contact-triggered HP restore (GDD 2.5)
  dustbin:null,        // the one active deployed Atomic Dustbin (GDD 5), or null
  dustbinPickups:[],   // glowing-green floor pickups Dan collects (carries one)
  workers:[],          // human workers to rescue (GDD 7)
  rescued:0,           // workers rescued THIS level (resets each level)
  camera:{ x:0, y:0 },
  exit:null,
  spawnTimer:0,
  pickupTimer:0,

  // Achievement tracking (not game-sim state — set by level.js/update.js, read by achievements.js)
  _levelStartTime:0,     // performance.now() at the start of the current level
  _runStartTime:0,       // performance.now() at the start of the current run
  _allEnemiesDeadEmitted:false,  // one-shot guard for level:all_enemies_dead
  _levelWorkerKilled:false,   // true if any worker was killed by a robot this level (for worker-exit sound selection)

  // Achievement UI modal state (Phase 6 — render/input flags, not sim state).
  _wipeOpenPending:false,         // set by loadLevel; consumed by update.js after updateCamera()
  _levelEndEmitted:false,        // one-shot guard: emit level:end once on entering levelclear
  _showAchievementModal:false,   // post-level achievement modal active (intercepts advance)
  _showLifetimeModal:false,      // lifetime achievements modal active (over title or post-level)
  _lifetimeModalFrom:null,       // 'title' | 'postlevel' — surface to return to on dismiss
  _lifetimeScrollY:0,            // scroll offset for the lifetime modal
  _lifetimeMaxScroll:0,          // max scroll offset (set by screens.js each draw)
};

// Which single enemy type populates the current level (one type per level).
// Levels beyond LEVEL_PLAN's length reuse the last entry.
export function levelType(){
  return LEVEL_PLAN[Math.min(G.level - 1, LEVEL_PLAN.length - 1)];
}
