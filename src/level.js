/* =========================================================================
   level.js — run/level lifecycle and the testing pickups.

   newGame (full reset) -> buildLevel (per-level world + terminals + exit,
   keeping HP/power-ups/score) -> nextLevel. Also the spawner-terminal emission
   (spawnFromTerminal / spawnWave) and the power-up pickup seeding/collection.
   ========================================================================= */
import { CFG, ENEMY, POWERUPS, POWERUP_KEYS } from "./config.js";
import { G, levelType } from "./state.js";
import { generateWarehouse, randomFloorTile } from "./world.js";
import { spawnEnemy } from "./enemies.js";
import { addFloat } from "./effects.js";

// Full reset — new run from level 1. HP, power-ups, score all cleared.
export function newGame(){
  G.dan = {
    x:0, y:0, r:CFG.DAN_RADIUS,
    hp:CFG.DAN_HP, maxHp:CFG.DAN_HP,
    angle:0, cooldown:0, iframe:0, kvx:0, kvy:0,
    slow:0, sprayTick:0,        // Cleaner debuff: slow timer + DoT tick gate
  };
  G.powerups = { rapid:0, triple:0, bounce:0 };
  G.score = 0;
  G.level = 1;
  buildLevel();
  G.state = "playing";
}

// Advance to a fresh level — HP, power-ups, and score persist.
export function nextLevel(){
  G.level++;
  buildLevel();
  G.state = "playing";
}

// (Re)generate the level around the existing Dan. Transient state is cleared;
// Dan's hp/powerups/score are left untouched so they carry across levels.
function buildLevel(){
  generateWarehouse();

  // Reposition Dan into the cleared central pocket, reset combat transients.
  G.dan.x = (CFG.COLS/2 + 0.5) * CFG.TILE;
  G.dan.y = (CFG.ROWS/2 + 0.5) * CFG.TILE;
  G.dan.cooldown = 0; G.dan.iframe = 0; G.dan.kvx = 0; G.dan.kvy = 0;
  G.dan.slow = 0; G.dan.sprayTick = 0;

  G.shots = [];
  G.enemies = [];
  G.terminals = [];
  G.pickups = [];
  G.marks = [];
  G.floats = [];
  G.ebolts = [];
  G.spawnTimer = 0.6;
  G.pickupTimer = 0;

  // Every level gets destroyable spawner-terminals of its enemy type (the
  // Dispatch Terminal generalized to all enemies). Count scales with level.
  const type = levelType();
  const d = ENEMY[type];
  const termCount = Math.min((d.spawners || 3) + ((G.level - 1) / 2 | 0), 6);
  for (let i = 0; i < termCount; i++){
    const p = randomFloorTile(6);
    G.terminals.push({
      x:p.x, y:p.y, r:14, pulse:Math.random()*Math.PI*2,
      hp:CFG.TERMINAL.hp, hitFlash:0, type,    // terminal knows what it emits
    });
  }
  // Initial population emerges from the terminals (not floor-placed).
  for (let i = 0; i < (d.preplace || 0); i++) spawnFromTerminal(type);

  // Manager level: also seed a couple of Picker terminals so the berserk pulse
  // has targets to buff. This is the first mixed-type level (GDD intent).
  if (type === "manager"){
    for (let i = 0; i < 2; i++){
      const pp = randomFloorTile(6);
      G.terminals.push({ x:pp.x, y:pp.y, r:14, pulse:Math.random()*Math.PI*2,
        hp:CFG.TERMINAL.hp, hitFlash:0, type:"picker" });
    }
    for (let i = 0; i < 3; i++) spawnFromTerminal("picker");
  }

  // One exit door, placed away from Dan's spawn (GDD 8.1).
  const ep = randomFloorTile(8);
  G.exit = { x:ep.x, y:ep.y, r:18, pulse:0 };

  // Seed power-up pickups for testing convenience.
  while (G.pickups.length < CFG.MAX_PICKUPS) spawnPickup();

  G.camera = { x:0, y:0 };
}

export function spawnPickup(type){
  if (!type) type = POWERUP_KEYS[(Math.random()*POWERUP_KEYS.length)|0];
  const p = randomFloorTile(3);
  G.pickups.push({ type, x:p.x, y:p.y, r:13, bob:Math.random()*Math.PI*2 });
}


// Emit one enemy of `type` from a random matching spawner-terminal.
// Returns false if that type has no terminals left (all destroyed).
function spawnFromTerminal(type){
  const tlist = G.terminals.filter(t => t.type === type);
  if (tlist.length === 0) return false;
  const t = tlist[(Math.random()*tlist.length)|0];
  spawnEnemy(type, { x:t.x, y:t.y });
  t.spawnFlash = 0.18;        // brief emit pulse on the terminal
  return true;
}

// Spawn a wave member for the level's type, respecting that type's cap.
// All enemies now emerge from terminals; no terminals -> no spawns.
export function spawnWave(type){
  const d = ENEMY[type];
  const count = G.enemies.reduce((n, e) => n + (e.type === type ? 1 : 0), 0);
  if (count >= d.max) return;
  spawnFromTerminal(type);
}
export function updatePickups(dt){
  for (let i = G.pickups.length - 1; i >= 0; i--){
    const p = G.pickups[i];
    p.bob += dt * 3;
    if (Math.hypot(p.x - G.dan.x, p.y - G.dan.y) <= p.r + G.dan.r){
      // Stack: add a fresh batch of enhanced shots to this counter.
      G.powerups[p.type] += CFG.POWERUP_SHOTS;
      const def = POWERUPS[p.type];
      addFloat(p.x, p.y - 14, "+" + def.label, def.color);
      G.pickups.splice(i, 1);
    }
  }
}
