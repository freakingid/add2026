/* =========================================================================
   dustbin.js — the Atomic Dustbin special item (GDD §5).

   A rare, glowing-green deployable. Dan carries ONE at a time (`G.dan.hasDustbin`,
   collected by walking over a floor pickup). Pressing E/F deploys it (GDD §4.4):
     - stationary -> dropped at Dan's feet; goes straight to the attract phase;
     - moving     -> THROWN in Dan's movement direction; slides with friction and
                     bounces off walls until it stops, then attracts.
   Attract phase (`attractDur` ≈ 2.5 s): a vortex opens — every robot within
   `attractRadius` (drones included, via `e.flying`) is pulled toward it and CANNOT
   act. The pull lives in `vortexHold`, called from `updateEnemies`: a caught robot
   skips its whole AI tick, so it neither moves on its own nor fires (the GDD's
   "pulled toward it and cannot fire" in one place).
   Detonate: a massive AoE that destroys/heavy-damages every robot in `blastRadius`
   for its NORMAL point value (routed through `killEnemy`), with a "DAN'S SPECIAL!"
   callout.

   State machine on `G.dustbin.state`:  "slide" -> "attract" -> (detonate -> null).
   Floor pickups live in `G.dustbinPickups`. `placeDustbins` is called from
   buildLevel, `updateDustbin` from update(); rendering is `drawDustbins` in
   render.js (same split as the vending machines).
   ========================================================================= */
import { CFG } from "./config.js";
import { G } from "./state.js";
import { isDeploySpecial, getMoveVec } from "./input.js";
import { moveBody, isWall, randomFloorTile } from "./world.js";
import { killEnemy } from "./combat.js";
import { addFloat } from "./effects.js";
import { COL } from "./palette.js";
import { sfx } from "./audio.js";

// Seed this level's dustbin floor pickups. RARE: guaranteed on level 1 (so a fresh
// run can always reach the special) then `spawnChance` odds per level after — the
// guarantee is testing convenience, tune it down toward "rare" with §8.1 procgen.
export function placeDustbins(){
  G.dustbinPickups = [];
  const D = CFG.DUSTBIN;
  if (G.level === 1 || Math.random() < D.spawnChance){
    const p = randomFloorTile(D.pickupMinDist);
    G.dustbinPickups.push({
      x:p.x, y:p.y, r:D.r,
      spin:Math.random()*Math.PI*2, bob:Math.random()*Math.PI*2,
    });
  }
}

export function updateDustbin(dt){
  const D = CFG.DUSTBIN;

  // --- floor pickups: spin/bob, collect on contact (Dan carries one at a time) ---
  for (let i = G.dustbinPickups.length - 1; i >= 0; i--){
    const p = G.dustbinPickups[i];
    p.spin += dt * 2.4;
    p.bob  += dt * 3;
    if (!G.dan.hasDustbin && Math.hypot(p.x - G.dan.x, p.y - G.dan.y) <= p.r + G.dan.r){
      G.dan.hasDustbin = true;
      addFloat(p.x, p.y - 16, "ATOMIC DUSTBIN", COL.atomic);
      G.dustbinPickups.splice(i, 1);
    }
  }

  // --- deploy (E/F or gamepad bumper/trigger): throw if moving, drop if standing
  //     still; one active at a time. isDeploySpecial() is edge-triggered. ---
  if (isDeploySpecial() && G.dan.hasDustbin && !G.dustbin) deployDustbin();

  // --- active dustbin: slide -> attract -> detonate ---
  const b = G.dustbin;
  if (!b) return;
  b.spin += dt * 4;

  if (b.state === "slide"){
    slideStep(b, dt);
    if (Math.hypot(b.vx, b.vy) < D.stopSpeed){     // settled -> open the vortex
      b.vx = 0; b.vy = 0;
      b.state = "attract"; b.timer = D.attractDur;
    }
  } else if (b.state === "attract"){
    b.timer -= dt;
    if (b.timer <= 0) detonate(b);
  }
}

// Throw in Dan's current movement direction, or drop in place if he's standing
// still (which begins the attract phase immediately).
function deployDustbin(){
  const D = CFG.DUSTBIN;
  // Throw direction = current movement input (WASD or left stick), normalized;
  // no movement -> drop in place. Knockback velocity is ignored on purpose.
  const mv = getMoveVec();
  const b = { x:G.dan.x, y:G.dan.y, r:D.r, spin:0, vx:0, vy:0, state:"slide", timer:0 };
  if (mv.x || mv.y){
    b.vx = mv.x * D.throwSpeed;
    b.vy = mv.y * D.throwSpeed;
  } else {
    b.state = "attract"; b.timer = D.attractDur;   // stationary deploy
  }
  G.dustbin = b;
  G.dan.hasDustbin = false;
  sfx.deploy();
}

// Slide with exponential friction + per-axis wall bounce (mirrors the bounce-shot
// reflection in player.js). Bouncing off a far wall to settle in a mob's centre is
// the GDD's "advanced play".
function slideStep(b, dt){
  const D = CFG.DUSTBIN;
  let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
  if (isWall((nx / CFG.TILE)|0, (b.y / CFG.TILE)|0)){ b.vx = -b.vx * D.bounce; nx = b.x + b.vx * dt; }
  if (isWall((b.x / CFG.TILE)|0, (ny / CFG.TILE)|0)){ b.vy = -b.vy * D.bounce; ny = b.y + b.vy * dt; }
  // Corner: still inside a wall after axis checks -> reflect both, hold position.
  if (isWall((nx / CFG.TILE)|0, (ny / CFG.TILE)|0)){
    b.vx = -b.vx * D.bounce; b.vy = -b.vy * D.bounce; nx = b.x; ny = b.y;
  }
  b.x = nx; b.y = ny;
  const decay = Math.exp(-D.friction * dt);
  b.vx *= decay; b.vy *= decay;
}

// Is enemy `e` caught in the active attract vortex? If so, pull it toward the
// centre (drones move freely; grounded bots slide via moveBody) and return true so
// the caller skips its normal AI — that is the "pulled toward it AND cannot fire"
// behaviour (GDD §5.2) expressed in one place. Called from updateEnemies.
export function vortexHold(e, dt){
  const b = G.dustbin;
  if (!b || b.state !== "attract") return false;
  const D = CFG.DUSTBIN;
  const dx = b.x - e.x, dy = b.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist > D.attractRadius) return false;
  const step = D.pullSpeed * dt;
  const mvx = (dx/dist) * step, mvy = (dy/dist) * step;
  if (e.flying){ e.x += mvx; e.y += mvy; }   // fliers ignore walls (as ever)
  else moveBody(e, mvx, mvy);
  return true;
}

// Massive AoE: every robot in blastRadius takes blastDmg (enough to destroy any
// current type); killEnemy awards its NORMAL points (GDD §5.3). Spawns a shockwave
// ring + soapy debris, and the "DAN'S SPECIAL!" callout. Dan is unharmed — it's his.
function detonate(b){
  const D = CFG.DUSTBIN;
  for (let i = G.enemies.length - 1; i >= 0; i--){
    const e = G.enemies[i];
    if (e.spawn > 0) continue;
    if (Math.hypot(e.x - b.x, e.y - b.y) <= D.blastRadius + e.r){
      e.hp -= D.blastDmg;
      e.hitFlash = 0.1;
      if (e.hp <= 0) killEnemy(i);
    }
  }
  G.marks.push({ x:b.x, y:b.y, life:1.5, kind:"blast" });
  for (let p = 0; p < 10; p++){
    const a = Math.random() * Math.PI * 2, r = Math.random() * D.blastRadius;
    G.marks.push({ x:b.x + Math.cos(a)*r, y:b.y + Math.sin(a)*r, life:1, kind:"debris", size:5 + Math.random()*6 });
  }
  addFloat(b.x, b.y - 24, "DAN'S SPECIAL!", COL.atomic);
  sfx.detonate();
  G.dustbin = null;
}
