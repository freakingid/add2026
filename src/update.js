/* =========================================================================
   update.js — the per-frame simulation orchestrator.

   update(dt) branches by G.state, drives every subsystem in order (Dan, shots,
   spawn cadence, enemies, ebolts, pickups, effects, camera), runs the
   terminal/exit/death bookkeeping, and hands off to nextLevel on the level-clear
   splash. updateCamera follows Dan, clamped to the world bounds.
   ========================================================================= */
import { CFG, ENEMY } from "./config.js";
import { G, levelType } from "./state.js";
import { VIEW_W, VIEW_H } from "./canvas.js";
import { clamp } from "./world.js";
import { updateDan, updateShots } from "./player.js";
import { updateEnemies } from "./enemies.js";
import { updateEbolts } from "./projectiles.js";
import { updateWorkers } from "./workers.js";
import { updateEffects } from "./effects.js";
import { nextLevel, spawnWave, spawnPickup, updatePickups } from "./level.js";

export function update(dt){
  // Level-clear splash: freeze the world, then build the next level.
  if (G.state === "levelclear"){
    G.transition -= dt;
    if (G.transition <= 0) nextLevel();
    return;
  }

  if (G.state !== "playing") return;

  updateDan(dt);
  updateShots(dt);

  // Spawn from every terminal type present in the level, each capped by its own max.
  // Pure levels have one type; mixed levels (e.g. Manager + Pickers) cycle both.
  const type = levelType();
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0){
    const seen = new Set();
    for (const t of G.terminals){ if (!seen.has(t.type)){ spawnWave(t.type); seen.add(t.type); } }
    G.spawnTimer = (type === "mixed") ? CFG.MIXED_INTERVAL : ENEMY[type].interval;
  }

  updateEnemies(dt);
  updateEbolts(dt);
  updatePickups(dt);
  updateWorkers(dt);
  updateEffects(dt);
  updateCamera();

  for (const t of G.terminals){
    t.pulse += dt * 3;
    if (t.hitFlash > 0) t.hitFlash -= dt;
    if (t.spawnFlash > 0) t.spawnFlash -= dt;
  }
  G.exit.pulse += dt * 4;

  // Reach the exit -> level ends immediately (GDD 8.2).
  if (Math.hypot(G.exit.x - G.dan.x, G.exit.y - G.dan.y) <= G.exit.r + G.dan.r){
    G.high = Math.max(G.high, G.score);
    G.state = "levelclear";
    G.transition = 1.6;
    return;
  }

  // Top the level back up with power-up pickups over time (for testing).
  G.pickupTimer -= dt;
  if (G.pickupTimer <= 0){
    if (G.pickups.length < CFG.MAX_PICKUPS) spawnPickup();
    G.pickupTimer = CFG.PICKUP_RESPAWN;
  }

  if (G.dan.hp <= 0){
    G.high = Math.max(G.high, G.score);
    G.state = "dead";
  }
}





function updateCamera(){
  // follow Dan, clamped to world bounds
  const worldW = CFG.COLS * CFG.TILE, worldH = CFG.ROWS * CFG.TILE;
  G.camera.x = clamp(G.dan.x - VIEW_W/2, 0, Math.max(0, worldW - VIEW_W));
  G.camera.y = clamp(G.dan.y - VIEW_H/2, 0, Math.max(0, worldH - VIEW_H));
}
