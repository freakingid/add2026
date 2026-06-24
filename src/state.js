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
  state:"title",       // title | playing | levelclear | dead
  score:0,
  high:0,
  level:1,
  transition:0,        // countdown timer for the level-clear splash

  // entities (populated by newGame / buildLevel)
  dan:null,
  powerups:null,
  shots:[], enemies:[], terminals:[], pickups:[], marks:[], floats:[],
  ebolts:[],           // shared enemy-projectile pool (Security taser bolt is the first user)
  vending:[],          // vending machines — contact-triggered HP restore (GDD 2.5)
  workers:[],          // human workers to rescue (GDD 7)
  rescued:0,           // workers rescued THIS level (resets each level)
  camera:{ x:0, y:0 },
  exit:null,
  spawnTimer:0,
  pickupTimer:0,
};

// Which single enemy type populates the current level (one type per level).
// Levels beyond LEVEL_PLAN's length reuse the last entry.
export function levelType(){
  return LEVEL_PLAN[Math.min(G.level - 1, LEVEL_PLAN.length - 1)];
}
