/* =========================================================================
   enemies.js — the enemy roster: spawning, per-type AI, and the Cleaner's
   patrol routing + spray helpers.

   updateEnemies dispatches by e.type to the per-type updaters; each mover
   applies buffSpd(e) so a Manager's on-death pulse speeds nearby robots.
   spawnEnemy is the factory (per-type init); coneRayDist is shared with the
   Cleaner's renderer to clip its spray cone to walls.
   ========================================================================= */
import { CFG, ENEMY } from "./config.js";
import { G } from "./state.js";
import {
  moveBody, isWall, hasLineOfSight, destroyShelf, isDestructible,
  tileFloor, tileCenter, tileClearRun, rectPerimeterClear, clamp, applyBeltPush,
} from "./world.js";
import { meleeContact } from "./combat.js";
import { vortexHold } from "./dustbin.js";
import { emit } from "./events.js";
import { updatePicker, updateForklift, updateSecurity, updateSorter, updateCleaner,
         updateDrone, updateManager, updateScanner, updateInventory } from "./enemies-ai.js";

// Flips each drone spawn so successive drones orbit Dan in opposite directions
// (they cross paths — harder to dodge several at once).
let droneOrbitToggle = 1;
let _nextEid = 1;

/* ---- Cleaner patrol routing (uses world.js tile helpers) ---------------- */
function nearestWaypoint(e){
  let bi = 0, bd = Infinity;
  for (let i = 0; i < e.waypoints.length; i++){
    const w = e.waypoints[i];
    const dd = (w.x-e.x)*(w.x-e.x) + (w.y-e.y)*(w.y-e.y);
    if (dd < bd){ bd = dd; bi = i; }
  }
  return bi;
}

// Build a Cleaner's FIXED patrol route once at spawn (kept for life): a small
// rectangular LOOP if a fully-walkable one fits, else a back-and-forth LINE down
// the longest clear aisle through its spawn tile. Falls back to a 2-tile shuffle
// if boxed in. Sets e.waypoints / e.wpIndex / e.patrolLoop / e.wpDir.
function buildCleanerPatrol(e){
  const d = ENEMY.cleaner;
  const tx = (e.x / CFG.TILE)|0, ty = (e.y / CFG.TILE)|0;
  const CAP = 12;

  // Sometimes try a rectangular loop with a fully-clear perimeter.
  if (Math.random() < d.rectChance){
    for (let tries = 0; tries < 24; tries++){
      const w = 3 + (Math.random()*3|0), h = 3 + (Math.random()*3|0);
      const ox = tx - (Math.random()*(w+1)|0), oy = ty - (Math.random()*(h+1)|0);
      if (rectPerimeterClear(ox, oy, w, h)){
        e.waypoints = [
          tileCenter(ox, oy),     tileCenter(ox+w, oy),
          tileCenter(ox+w, oy+h), tileCenter(ox, oy+h),
        ];
        e.patrolLoop = true; e.wpDir = 1;
        e.wpIndex = nearestWaypoint(e);
        return;
      }
    }
  }

  // LINE: pick the axis with the longest clear run through this tile.
  let best = null;
  for (const [ax, ay] of [[1,0],[0,1]]){
    const pos = tileClearRun(tx, ty, ax, ay, CAP);
    const neg = tileClearRun(tx, ty, -ax, -ay, CAP);
    const total = pos + neg;
    if (!best || total > best.total) best = { ax, ay, pos, neg, total };
  }
  if (best && best.total >= d.lineMinTiles){
    e.waypoints = [
      tileCenter(tx + best.ax*best.pos, ty + best.ay*best.pos),
      tileCenter(tx - best.ax*best.neg, ty - best.ay*best.neg),
    ];
  } else {
    // Boxed in: tiny ping-pong to whatever single clear neighbour exists.
    const here = tileCenter(tx, ty);
    let other = here;
    for (const [ax, ay] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if (tileFloor(tx+ax, ty+ay)){ other = tileCenter(tx+ax, ty+ay); break; }
    }
    e.waypoints = [here, other];
  }
  e.patrolLoop = false; e.wpDir = 1;
  e.wpIndex = nearestWaypoint(e);
  if (e.wpIndex === e.waypoints.length - 1) e.wpDir = -1;
}

// Advance to the next patrol waypoint (loop wraps; line ping-pongs).
export function advancePatrol(e){
  if (e.patrolLoop){
    e.wpIndex = (e.wpIndex + 1) % e.waypoints.length;
  } else {
    e.wpIndex += e.wpDir;
    if (e.wpIndex >= e.waypoints.length - 1){ e.wpIndex = e.waypoints.length - 1; e.wpDir = -1; }
    else if (e.wpIndex <= 0){ e.wpIndex = 0; e.wpDir = 1; }
  }
}
// Create one enemy of the given type at a position.
export function spawnEnemy(type, pos){
  const d = ENEMY[type];
  const e = {
    type, x:pos.x, y:pos.y, r:d.radius,
    hp:d.hp, maxHp:d.hp, speed:d.speed,
    bob:Math.random()*Math.PI*2,
    spawn:0.4,            // brief grow-in so they don't blink in
    hitFlash:0,
  };
  if (type === "forklift"){
    e.mode = "roam";      // roam -> lock (windup) -> charge -> recover
    e.timer = 0;
    e.losCheck = Math.random() * 0.2;
    e.cdir = 0;
    e.chargeDist = 0;
  }
  if (type === "security"){
    e.losCheck = Math.random() * 0.15;       // throttled LOS poll
    e.canSee = false;
    e.fireCd = d.firstFireMin + Math.random() * 0.4;
    e.winding = 0;        // >0 => telegraphing a shot; aim latched in e.aim
    e.aim = 0;
  }
  if (type === "sorter"){
    e.losCheck = Math.random() * 0.12;
    e.canSee = false;     // exposed? flee : advance + lob
    e.fireCd = d.firstFireMin + Math.random() * 0.6;
    e.wander = Math.random() * Math.PI * 2;  // erratic-flee heading, random-walks
  }
  if (type === "cleaner"){
    buildCleanerPatrol(e);                  // fixed route chosen at spawn, kept for life
    e.mode = "patrol";                      // patrol -> spray(windup->active) -> patrol
    e.sprayCd = d.sprayGap * (0.5 + Math.random());
    e.windup = 0; e.sprayT = 0; e.spraying = false;
    e.wpTimer = d.wpTimeout;
    const w = e.waypoints[e.wpIndex];       // face toward the first waypoint
    e.face = Math.atan2(w.y - e.y, w.x - e.x);
  }
  if (type === "drone"){
    e.flying = true;                                   // flagged for walls/future Dustbin pull
    e.dropCd = d.firstFireMin + Math.random() * 0.6;   // grace before first bomb
    e.rotor = Math.random() * Math.PI * 2;             // spinning-rotor phase
    // Three-phase predatory orbit (STALK -> COMMIT -> DROP).
    e.phase = "stalk";
    e.orbitDir = droneOrbitToggle;                     // alternate CW/CCW across drones
    droneOrbitToggle = -droneOrbitToggle;
    e.orbitAngle = Math.atan2(e.y - G.dan.y, e.x - G.dan.x);  // start from current bearing
    e.stalkT = d.stalkMinT + Math.random() * (d.stalkMaxT - d.stalkMinT);
  }
  if (type === "manager"){
    e.losCheck = Math.random() * 0.2;
    e.canSee = false;
    e.fireCd = d.firstFireMin + Math.random() * 0.8;   // stagger opening shot
    e.winding = 0;      // >0 = telegraphing launch; aim latched in e.aim
    e.aim = 0;
    // e.berserk starts undefined; buffSpd/berserDmg handle that gracefully
  }
  if (type === "scanner"){
    buildCleanerPatrol(e);                  // reuse the Cleaner's fixed-route patrol
    e.wpTimer = ENEMY.cleaner.wpTimeout;
    const w = e.waypoints[e.wpIndex];       // face toward the first waypoint
    e.face = Math.atan2(w.y - e.y, w.x - e.x);
    e.losCheck = Math.random() * d.losCheckEvery;
    e.alarmT = 0; e.alarming = false;       // alarm timer + state (set by LOS to Dan)
    e.seesDan = false;                      // current LOS-to-Dan (drives the blue render beam)
    e.alarmTargets = [];                    // robots currently in the buff (drives the red beams)
    e.sweep = Math.random() * Math.PI * 2;  // radar-dish sweep phase
  }
  if (type === "inventory"){
    e.mode = "wander";                      // wander (oblivious) <-> hunt (lock a worker)
    e.heading = Math.random() * Math.PI * 2;
    e.wanderT = 0;
    e.target = null;                        // the worker being hunted
    e.huntCd = Math.random() * d.huntPeriod;   // stagger the first hunt check
  }
  e._spawnTime = performance.now();
  e.eid = _nextEid++;
  G.enemies.push(e);
  emit('enemy:spawned', {
    type: e.type,
    timeInLevel: performance.now() - G._levelStartTime,
  });
}
export function updateEnemies(dt){
  for (let i = G.enemies.length - 1; i >= 0; i--){
    const e = G.enemies[i];
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.spawn > 0){ e.spawn -= dt; continue; }
    e.bob += dt * 8;
    if (e.berserk > 0) e.berserk -= dt;   // decay on any enemy that received the pulse
    if (e.alarmed > 0) e.alarmed -= dt;   // Scanner alarm buff (refreshed each frame in range)

    // Atomic Dustbin attract phase (GDD 5.2): a caught robot is pulled toward the
    // vortex and skips its whole AI tick — so it can't move on its own OR fire.
    if (vortexHold(e, dt)) continue;

    if (e.type === "forklift") updateForklift(e, dt);
    else if (e.type === "security") updateSecurity(e, dt);
    else if (e.type === "sorter") updateSorter(e, dt);
    else if (e.type === "cleaner") updateCleaner(e, dt);
    else if (e.type === "drone") updateDrone(e, dt);
    else if (e.type === "manager") updateManager(e, dt);
    else if (e.type === "scanner") updateScanner(e, dt);
    else if (e.type === "inventory") updateInventory(e, dt);
    else updatePicker(e, dt);

    // Conveyor belt (§8.1.2): add the belt push to this enemy's position AFTER its
    // AI has decided its own move. applyBeltPush skips fliers (drones ride above the
    // belt) and is collision-resolved, so crossing strips push diagonally for free.
    applyBeltPush(e, dt);

    // melee contact with Dan (single event; re-entry needed via knockback)
    const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist <= e.r + G.dan.r){
      let dmg;
      if (e.type === "forklift")
        dmg = (e.mode === "charge") ? ENEMY.forklift.dmgCharge : ENEMY.forklift.dmgContact;
      else if (e.type === "security")
        dmg = ENEMY.security.dmgContact;   // light contact zap (ranged unit)
      else if (e.type === "sorter" || e.type === "cleaner" || e.type === "drone" || e.type === "manager" || e.type === "scanner")
        dmg = 0;                           // hazard/ranged/support units: no contact damage (GDD 6)
      else if (e.type === "inventory")
        dmg = ENEMY.inventory.dmgContact;  // light melee bump (GDD 6.1.6)
      else
        dmg = ENEMY.picker.dmg;
      // Buff bonuses to melee: Manager berserk pulse (GDD 6.1.9) and Scanner alarm (GDD 6.1.3).
      if (dmg > 0 && e.berserk > 0) dmg += ENEMY.manager.berserDmgBonus;
      if (dmg > 0 && e.alarmed > 0) dmg += ENEMY.scanner.alarmDmgBonus;
      meleeContact(e, dx, dy, dist, dmg);
    }
  }
}

// Combined speed multiplier from active buffs: the Manager's on-death berserk
// pulse and the Scanner's continuous alarm (they stack). Safe for any enemy type:
// e.berserk / e.alarmed are undefined on spawns and undefined > 0 is false.
export function buffSpd(e){
  let m = 1;
  if (e.berserk > 0) m *= ENEMY.manager.berserSpeedMult;
  if (e.alarmed > 0) m *= ENEMY.scanner.alarmSpeedMult;
  return m;
}

// Is Dan inside this Cleaner's active cone? (range + half-angle + LOS, so the
// spray is blocked by shelves.)
export function danInSprayCone(e, d){
  const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
  const dist = Math.hypot(dx, dy);
  if (dist > d.sprayRange + G.dan.r) return false;
  let diff = Math.atan2(dy, dx) - e.face;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > d.sprayHalfAngle) return false;
  return hasLineOfSight(e.x, e.y, G.dan.x, G.dan.y);
}

// March from (x0,y0) along `ang` until a wall tile or `maxR`; returns the clear
// distance (just short of the wall). Used to clip the Cleaner's spray cone to
// shelf geometry so it visually STOPS at walls instead of bleeding through them.
export function coneRayDist(x0, y0, ang, maxR){
  const cx = Math.cos(ang), cy = Math.sin(ang), step = 6;
  for (let len = step; len <= maxR; len += step){
    if (isWall(((x0 + cx*len)/CFG.TILE)|0, ((y0 + cy*len)/CFG.TILE)|0)) return len - step;
  }
  return maxR;
}

// Refresh Dan's slow and apply a damage tick (rate-limited by dan.sprayTick so
// overlapping cones can't multi-tick in one frame; tick timer decays in updateDan).
export function applySpray(d){
  G.dan.slow = d.slowDur;
  if (G.dan.sprayTick <= 0){
    G.dan.hp -= d.sprayDmg;
    G.dan.sprayTick = d.tickEvery;
  }
}

