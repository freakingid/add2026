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
import { pollGamepad, pollModals } from "./input.js";
import { updateDan, updateShots } from "./player.js";
import { updateEnemies } from "./enemies.js";
import { updateEbolts } from "./projectiles.js";
import { updateWorkers } from "./workers.js";
import { updateVending } from "./vending.js";
import { updateDustbin } from "./dustbin.js";
import { updateEffects } from "./effects.js";
import { nextLevel, spawnWave, spawnPickup, updatePickups } from "./level.js";
import { getLevelAchievementSummary } from "./achievements.js";
import { sfx, music } from "./audio.js";
import { emit, on } from "./events.js";
import { updateWipe, startWipeClose, startWipeOpen } from "./wipe.js";
import { updateFlash, startFlash } from "./flash.js";
import { pollPause } from "./pause.js";

on('level:all_enemies_dead', () => { sfx.lastEnemyCleared(); startFlash(); });

export function update(dt){
  updateWipe(dt);    // runs in all states including levelclear
  updateFlash(dt);   // runs in all states, same reasoning as updateWipe

  // Poll the gamepad every frame, in every state — events are unreliable, and the
  // title/dead screens need it to start/restart a run (handled inside pollGamepad).
  pollGamepad();

  // Modal input (post-level / lifetime achievement modals) is polled every frame,
  // device-agnostically, BEFORE state branching so it works over title + levelclear.
  pollModals(dt);

  // Paused state — world is frozen; only pause polling runs.
  // updateWipe + pollGamepad still run (above) so the wipe can finish and
  // START can un-pause via the gamepad path in input.js.
  if (G.state === "paused"){
    pollPause(dt);
    return;
  }

  // Level-clear splash: freeze the world, then build the next level.
  if (G.state === "levelclear"){
    sfx.conveyor(false);   // belt hum off while the world is frozen

    // Emit level:end exactly once on entering levelclear (was in nextLevel) so the
    // post-level modal can read getLevelAchievementSummary() during the splash.
    if (!G._levelEndEmitted){
      G._levelEndEmitted = true;
      emit('level:end', {
        levelTime: performance.now() - G._levelStartTime,
        workersRescued: G.rescued,
        levelNumber: G.level,
      });
      // Open the post-level modal iff something progressed this level.
      if (getLevelAchievementSummary().length > 0) G._showAchievementModal = true;
    }

    // While the modal is up it intercepts the advance: the player must dismiss it
    // (Continue) before the level advances. Otherwise the splash timer runs out.
    if (G._showAchievementModal || G._showLifetimeModal) return;

    G.transition -= dt;
    if (G.transition <= 0) nextLevel();
    return;
  }

  if (G.state !== "playing"){ sfx.conveyor(false); return; }

  updateDan(dt);
  sfx.conveyor(!!G.dan.onBelt);   // hum while Dan rides a conveyor, fades when he steps off
  updateShots(dt);
  updateDustbin(dt);   // deploy/collect + slide/attract/detonate, before enemies see the vortex

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

  // level:all_enemies_dead — fires once when all terminals are gone AND no active
  // enemies remain (terminals splice on destroy, so length === 0 = all dead).
  if (!G._allEnemiesDeadEmitted
      && G.terminals.length === 0
      && G.enemies.length === 0) {
    G._allEnemiesDeadEmitted = true;
    emit('level:all_enemies_dead');
  }

  updateEbolts(dt);
  updatePickups(dt);
  updateVending(dt);
  updateWorkers(dt);
  updateEffects(dt);
  updateCamera();

  if (G._wipeOpenPending) {
    G._wipeOpenPending = false;
    const sx = G.dan.x - G.camera.x;
    const sy = G.dan.y - G.camera.y;
    startWipeOpen(sx, sy);
  }

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
    G.transition = CFG.WIPE_CLOSE_DUR + CFG.WIPE_HOLD_IN + 0.05;
    const sx = G.dan.x - G.camera.x;
    const sy = G.dan.y - G.camera.y;
    startWipeClose(sx, sy);
    sfx.levelClear();
    music.fadeOut(2.0);
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
    sfx.gameOver();
    music.stop();
    emit('run:end', {
      runTime: performance.now() - G._runStartTime,
      levelsCompleted: G.level - 1,
      totalScore: G.score,
      inputMode: G.inputMode,
    });
  }
}





function updateCamera(){
  // follow Dan, clamped to world bounds
  const worldW = CFG.COLS * CFG.TILE, worldH = CFG.ROWS * CFG.TILE;
  G.camera.x = clamp(G.dan.x - VIEW_W/2, 0, Math.max(0, worldW - VIEW_W));
  G.camera.y = clamp(G.dan.y - VIEW_H/2, 0, Math.max(0, worldH - VIEW_H));
}
