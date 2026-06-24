/* =========================================================================
   projectiles.js — the shared enemy-projectile pool (G.ebolts).

   One pool drives every robot's ranged attack. Each entry carries a `kind`
   that selects its motion + how it expires, so later enemies reuse this:
     bolt   (Security)  — straight line, dies on walls            [implemented]
     arc    (Sorter)    — lobbed box, ignores walls, time-based landing + AoE [implemented]
     drop   (Drone)     — bomb descends onto a fixed point, ignores walls + AoE [implemented]
     cone   (Cleaner)   — short spray, applies slow debuff   [handled outside pool]
     homing (Manager)   — slow-tracking missile                       [implemented]
   Collision vs Dan funnels through the SAME i-frame window as melee so two
   sources can't both land in one instant.
   ========================================================================= */
import { CFG } from "./config.js";
import { G } from "./state.js";
import { isWall } from "./world.js";
import { hitDanRanged, hitDanArea } from "./combat.js";
import { sfx } from "./audio.js";

// Fire a homing missile from Manager `e`. The missile's initial direction is toward
// Dan, but it can steer each frame (capped turn rate — outrunnable, lure-into-walls).
export function fireEnemyHoming(e, d){
  sfx.enemyFire();
  const angle = Math.atan2(G.dan.y - e.y, G.dan.x - e.x);
  const muzzle = e.r + 6;
  G.ebolts.push({
    kind: "homing",
    x: e.x + Math.cos(angle) * muzzle,
    y: e.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * d.missileSpeed,
    vy: Math.sin(angle) * d.missileSpeed,
    speed:    d.missileSpeed,
    turnRate: d.missileTurnRate,
    r:    d.missileRadius,
    dmg:  d.missileDmg,
    blast: d.missileBlast,
    traveled: 0,
    range: d.missileRange,
    spin: Math.random() * Math.PI * 2,
  });
}

// Spawn one bolt from enemy `e` traveling along `angle`. `d` = that type's
// ENEMY entry (supplies boltSpeed / boltDmg / boltRadius / boltRange).
export function fireEnemyBolt(e, angle, d){
  sfx.enemyFire();
  const muzzle = e.r + 4;
  G.ebolts.push({
    kind: "bolt",
    x: e.x + Math.cos(angle) * muzzle,
    y: e.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * d.boltSpeed,
    vy: Math.sin(angle) * d.boltSpeed,
    r: d.boltRadius,
    dmg: d.boltDmg,
    traveled: 0,
    range: d.boltRange,
    spin: Math.random() * Math.PI * 2,
  });
}

// Lob a cardboard box from `e` toward (tx,ty) — Dan's position at fire time.
// The arc clears walls and lands after `arcDur`, then checks a blast radius.
export function fireEnemyArc(e, tx, ty, d){
  sfx.enemyFire();
  const dist = Math.hypot(tx - e.x, ty - e.y);
  G.ebolts.push({
    kind: "arc",
    x: e.x, y: e.y,            // current ground position (interpolated)
    x0: e.x, y0: e.y,         // launch point
    tx, ty,                   // landing point
    t: 0, dur: d.arcDur,
    peak: 24 + dist * 0.10,   // lob higher on longer throws (visual only)
    height: 0, k: 0,
    dmg: d.arcDmg, blast: d.arcBlast,
    r: 9, spin: Math.random() * Math.PI * 2,
  });
}

// Drop a package bomb from a Drone straight down its column onto (tx,ty) — the
// drone's own x and Dan's row. The visual fall distance is the drone->row gap,
// so the bomb appears to detach from the drone and descend. Reticle + growing
// shadow are the telegraph. Ignores walls (stopsOnWall:false), so cover is no
// defense.
export function fireEnemyDrop(e, tx, ty, d){
  sfx.enemyFire();
  const fall = Math.max(d.dropMinFall, ty - e.y);   // start at the drone's height
  G.ebolts.push({
    kind: "drop",
    tx, ty,                   // landing point: drone's column, Dan's row
    t: 0, dur: d.dropDur,     // descent + telegraph window
    h0: fall, height: fall,   // visual fall = drone->row gap
    dmg: d.dropDmg, blast: d.dropBlast,
    stopsOnWall: false,
    r: d.baseR, spin: Math.random() * Math.PI * 2,
  });
}

export function updateEbolts(dt){
  for (let i = G.ebolts.length - 1; i >= 0; i--){
    const b = G.ebolts[i];
    b.spin += dt * 22;

    // Lobbed kinds resolve on a timer and ignore walls; handle separately.
    if (b.kind === "arc"){
      if (updateArc(b, dt)) G.ebolts.splice(i, 1);
      continue;
    }
    if (b.kind === "drop"){
      if (updateDrop(b, dt)) G.ebolts.splice(i, 1);
      continue;
    }
    if (b.kind === "homing"){
      if (updateHoming(b, dt)) G.ebolts.splice(i, 1);
      continue;
    }

    // --- straight kinds (bolt): move, expire on range/wall, hit on overlap ---
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.traveled += Math.hypot(b.vx, b.vy) * dt;

    const stopsOnWall = (b.kind === "bolt");
    const inWall = isWall((b.x / CFG.TILE)|0, (b.y / CFG.TILE)|0);
    if (b.traveled >= b.range || (stopsOnWall && inWall)){
      G.ebolts.splice(i, 1);
      continue;
    }

    // Hit Dan. Absorbed by an active i-frame window (counts as a blocked hit).
    if (Math.hypot(b.x - G.dan.x, b.y - G.dan.y) <= b.r + G.dan.r){
      if (G.dan.iframe <= 0) hitDanRanged(b);
      G.ebolts.splice(i, 1);
    }
  }
}

// Advance a lobbed box: interpolate ground position launch->landing over `dur`
// with a parabolic height for the draw. Ignores walls entirely. On landing,
// splat + AoE check around the impact point. Returns true when finished.
function updateArc(b, dt){
  b.t += dt;
  b.k = Math.min(b.t / b.dur, 1);
  b.x = b.x0 + (b.tx - b.x0) * b.k;
  b.y = b.y0 + (b.ty - b.y0) * b.k;
  b.height = Math.sin(b.k * Math.PI) * b.peak;
  if (b.k >= 1){
    G.marks.push({ x:b.tx, y:b.ty, life:1 });           // impact burst
    if (G.dan.iframe <= 0 &&
        Math.hypot(G.dan.x - b.tx, G.dan.y - b.ty) <= b.blast + G.dan.r){
      hitDanArea(b.tx, b.ty, b.dmg);
    }
    return true;
  }
  return false;
}

// Advance a dropped package bomb: the landing point (tx,ty) is fixed; the bomb
// descends vertically onto it over `dur` with an accelerating fall. Ignores
// walls entirely. On landing: splat + debris + AoE check. Returns true when done.
function updateDrop(b, dt){
  b.t += dt;
  const k = Math.min(b.t / b.dur, 1);
  b.height = b.h0 * (1 - k * k);                       // ease-in (accelerating drop)
  if (k >= 1){
    G.marks.push({ x:b.tx, y:b.ty, life:1 });           // impact burst
    for (let p = 0; p < 5; p++){                       // chunky package debris
      G.marks.push({
        x: b.tx + (Math.random()-0.5)*20,
        y: b.ty + (Math.random()-0.5)*20,
        life: 1, kind:"debris", size: 5 + Math.random()*4,
      });
    }
    if (G.dan.iframe <= 0 &&
        Math.hypot(G.dan.x - b.tx, G.dan.y - b.ty) <= b.blast + G.dan.r){
      hitDanArea(b.tx, b.ty, b.dmg);
    }
    return true;
  }
  return false;
}

// Advance a homing missile: steer toward Dan each frame by up to `turnRate` rad/s
// (capped so it's outrunnable on straights). Stops on wall impact (small AoE) or
// Dan overlap, and expires at max range. Returns true when finished.
function updateHoming(b, dt){
  // Steer toward Dan with a capped turn so the missile can be outrun or lured.
  const curAngle = Math.atan2(b.vy, b.vx);
  const targetAngle = Math.atan2(G.dan.y - b.y, G.dan.x - b.x);
  let diff = targetAngle - curAngle;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = Math.sign(diff) * Math.min(Math.abs(diff), b.turnRate * dt);
  const newAngle = curAngle + turn;
  b.vx = Math.cos(newAngle) * b.speed;
  b.vy = Math.sin(newAngle) * b.speed;

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.traveled += b.speed * dt;

  // Expire on range.
  if (b.traveled >= b.range) return true;

  // Wall impact: small AoE burst, then remove. Harmless if Dan is out of blast.
  if (isWall((b.x / CFG.TILE)|0, (b.y / CFG.TILE)|0)){
    G.marks.push({ x:b.x, y:b.y, life:1 });
    if (G.dan.iframe <= 0 && Math.hypot(G.dan.x - b.x, G.dan.y - b.y) <= b.blast + G.dan.r)
      hitDanArea(b.x, b.y, b.dmg);
    return true;
  }

  // Hit Dan.
  if (Math.hypot(b.x - G.dan.x, b.y - G.dan.y) <= b.r + G.dan.r){
    if (G.dan.iframe <= 0) hitDanRanged(b);
    return true;
  }
  return false;
}
