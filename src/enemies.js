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
  moveBody, isWall, hasLineOfSight, destroyShelf, isBorderTile,
  tileFloor, tileCenter, tileClearRun, rectPerimeterClear, clamp,
} from "./world.js";
import { meleeContact } from "./combat.js";
import { fireEnemyBolt, fireEnemyArc, fireEnemyDrop, fireEnemyHoming } from "./projectiles.js";
import { killWorker } from "./workers.js";
import { vortexHold } from "./dustbin.js";

// Flips each drone spawn so successive drones orbit Dan in opposite directions
// (they cross paths — harder to dodge several at once).
let droneOrbitToggle = 1;

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
function advancePatrol(e){
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
    e.sweep = Math.random() * Math.PI * 2;  // radar-dish sweep phase
  }
  if (type === "inventory"){
    e.mode = "wander";                      // wander (oblivious) <-> hunt (lock a worker)
    e.heading = Math.random() * Math.PI * 2;
    e.wanderT = 0;
    e.target = null;                        // the worker being hunted
    e.huntCd = Math.random() * d.huntPeriod;   // stagger the first hunt check
  }
  G.enemies.push(e);
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
function buffSpd(e){
  let m = 1;
  if (e.berserk > 0) m *= ENEMY.manager.berserSpeedMult;
  if (e.alarmed > 0) m *= ENEMY.scanner.alarmSpeedMult;
  return m;
}

// Basic chaser (Picker).
function updatePicker(e, dt){
  const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  moveBody(e, (dx/dist) * e.speed * buffSpd(e) * dt, (dy/dist) * e.speed * buffSpd(e) * dt);
}

// Slow tank that locks line-of-sight and charges, smashing shelves (GDD 6).
function updateForklift(e, dt){
  const d = ENEMY.forklift;
  if (e.mode === "roam"){
    const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    moveBody(e, (dx/dist) * e.speed * dt, (dy/dist) * e.speed * dt);
    e.losCheck -= dt;
    if (e.losCheck <= 0){
      e.losCheck = 0.2;
      if (dist < d.sight && hasLineOfSight(e.x, e.y, G.dan.x, G.dan.y)){
        e.mode = "lock"; e.timer = d.windup; e.cdir = Math.atan2(dy, dx);
      }
    }
  } else if (e.mode === "lock"){
    e.timer -= dt;                       // wind-up telegraph before the charge
    if (e.timer <= 0){ e.mode = "charge"; e.chargeDist = 0; }
  } else if (e.mode === "charge"){
    const step = d.chargeSpeed * dt;
    const nx = e.x + Math.cos(e.cdir) * step;
    const ny = e.y + Math.sin(e.cdir) * step;
    const tx = (nx / CFG.TILE)|0, ty = (ny / CFG.TILE)|0;
    if (isWall(tx, ty)){
      if (isBorderTile(tx, ty)){
        e.mode = "recover"; e.timer = d.recover;   // can't smash the outer wall
      } else {
        destroyShelf(tx, ty);                       // plow through shelving
        e.x = nx; e.y = ny;
      }
    } else {
      e.x = nx; e.y = ny;
    }
    e.chargeDist += step;
    if (e.chargeDist > d.maxCharge){ e.mode = "recover"; e.timer = d.recover; }
  } else { // recover
    e.timer -= dt;
    if (e.timer <= 0) e.mode = "roam";
  }
}

// Fast ranged pursuer: chases Dan and fires straight taser bolts on a fast
// cooldown whenever it has line-of-sight and Dan is within fire range (GDD 6).
function updateSecurity(e, dt){
  const d = ENEMY.security;
  const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  // Aggressive pursuit — always close on Dan (it fires while moving).
  moveBody(e, (dx/dist) * e.speed * buffSpd(e) * dt, (dy/dist) * e.speed * buffSpd(e) * dt);

  // Throttled line-of-sight check (reuses the Forklift's LOS helper).
  e.losCheck -= dt;
  if (e.losCheck <= 0){
    e.losCheck = 0.15;
    e.canSee = dist < d.sight && hasLineOfSight(e.x, e.y, G.dan.x, G.dan.y);
  }

  if (e.winding > 0){
    // Telegraphing: aim was latched at windup start, so Dan can sidestep it.
    e.winding -= dt;
    if (e.winding <= 0){
      fireEnemyBolt(e, e.aim, d);
      e.fireCd = d.fireCd;
    }
  } else {
    e.fireCd -= dt;
    if (e.fireCd <= 0 && e.canSee && dist <= d.fireRange){
      e.aim = Math.atan2(dy, dx);   // latch aim; bolt flies straight, no homing
      e.winding = d.windup;
    }
  }
}

// Cowardly lob attacker (GDD 6). Always knows Dan's position; line of sight
// only sets its mood. Exposed (has LOS) -> panics and flees fast in an erratic
// scatter, holding fire. In cover (no LOS) -> feels safe, advances on Dan, and
// lobs an arcing box that clears the walls between them.
function updateSorter(e, dt){
  const d = ENEMY.sorter;
  const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  e.losCheck -= dt;
  if (e.losCheck <= 0){
    e.losCheck = d.losCheckEvery;
    e.canSee = hasLineOfSight(e.x, e.y, G.dan.x, G.dan.y);
  }

  if (e.canSee){
    // Exposed -> panic. Flee away from Dan with a wandering jitter so the path
    // reads as a freak-out rather than a straight retreat.
    e.wander += (Math.random() - 0.5) * d.fleeJitter * dt * 6;
    const away = Math.atan2(-dy, -dx);
    const ang = away + Math.sin(e.wander) * 0.9;
    const fl = d.fleeSpeed * buffSpd(e);
    moveBody(e, Math.cos(ang) * fl * dt, Math.sin(ang) * fl * dt);
  } else {
    // In cover -> advance toward Dan, and bombard once within lob range.
    moveBody(e, (dx/dist) * e.speed * buffSpd(e) * dt, (dy/dist) * e.speed * buffSpd(e) * dt);
    e.fireCd -= dt;
    if (e.fireCd <= 0 && dist <= d.fireRange){
      fireEnemyArc(e, G.dan.x, G.dan.y, d);   // target Dan's position at lob time
      e.fireCd = d.fireCd;
    }
    // Out of range: fireCd stays ready (<=0), so it lobs the instant it closes in.
  }
}

// Debuffer / slow hazard (GDD 6). Follows a FIXED patrol route (built at spawn)
// and sprays a short cone AHEAD of its heading; the spray ticks damage AND
// refreshes a movement-slow on Dan while he's inside it. Oblivious to Dan by
// default (cone points where it walks); set ENEMY.cleaner.aimAtDan to face Dan.
function updateCleaner(e, dt){
  const d = ENEMY.cleaner;

  if (e.mode === "spray"){
    // Hold position; telegraph (windup) then emit the damaging cone.
    e.spraying = false;
    if (e.windup > 0){
      e.windup -= dt;
    } else {
      e.spraying = true;
      e.sprayT -= dt;
      if (danInSprayCone(e, d)) applySpray(d);
      if (e.sprayT <= 0){
        e.mode = "patrol"; e.sprayCd = d.sprayGap; e.spraying = false;
        e.wpTimer = d.wpTimeout;   // don't count the spray pause against the stuck-timer
      }
    }
    return;
  }

  // --- patrol: walk toward the current waypoint along the fixed route ---
  const w = e.waypoints[e.wpIndex];
  const dx = w.x - e.x, dy = w.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  e.face = Math.atan2(dy, dx);                       // face the direction of travel
  moveBody(e, (dx/dist) * e.speed * buffSpd(e) * dt, (dy/dist) * e.speed * buffSpd(e) * dt);

  // Advance on arrival, or if stuck against geometry for too long.
  e.wpTimer -= dt;
  if (dist <= d.arriveDist || e.wpTimer <= 0){
    advancePatrol(e);
    e.wpTimer = d.wpTimeout;
  }

  // Spray on cadence, but only when facing reasonably open space — so it never
  // sprays straight into a shelf it's hugging (and the visible cone has room).
  e.sprayCd -= dt;
  if (e.sprayCd <= 0){
    const clearAhead = coneRayDist(e.x, e.y, e.face, d.sprayRange);
    if (clearAhead >= d.sprayRange * d.sprayMinClear){
      if (d.aimAtDan) e.face = Math.atan2(G.dan.y - e.y, G.dan.x - e.x);
      e.mode = "spray"; e.windup = d.sprayWindup; e.sprayT = d.sprayDur;
    } else {
      e.sprayCd = 0.4;   // facing a wall — retry shortly once it's in the open
    }
  }
}

// Is Dan inside this Cleaner's active cone? (range + half-angle + LOS, so the
// spray is blocked by shelves.)
function danInSprayCone(e, d){
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
function applySpray(d){
  G.dan.slow = d.slowDur;
  if (G.dan.sprayTick <= 0){
    G.dan.hp -= d.sprayDmg;
    G.dan.sprayTick = d.tickEvery;
  }
}

// Free mover (NOT moveBody): step straight toward (tx,ty) at e.speed, without
// overshooting. Flying drones ignore walls; clamped to the border by the caller.
function droneMoveToward(e, tx, ty, dt){
  const mx = tx - e.x, my = ty - e.y;
  const ml = Math.hypot(mx, my);
  if (ml > 1){
    const step = Math.min(e.speed * dt, ml);
    e.x += (mx / ml) * step;
    e.y += (my / ml) * step;
  }
}

// (Re)enter STALK with a fresh randomised duration; optionally flip orbit
// direction (after a completed drop) and resume the circle from the current
// bearing so the orbit doesn't snap.
function droneEnterStalk(e, d, flip){
  e.phase = "stalk";
  e.stalkT = d.stalkMinT + Math.random() * (d.stalkMaxT - d.stalkMinT);
  if (flip && Math.random() < 0.5) e.orbitDir = -e.orbitDir;
  e.orbitAngle = Math.atan2(e.y - G.dan.y, e.x - G.dan.x);
}

// Aerial bomber (GDD 6). FLYING: ignores ground walls entirely (free mover, NOT
// moveBody), staying only inside the outer border. Three-phase predatory orbit:
//   STALK  — circle Dan at stalkRadius in e.orbitDir; no bombs; for a randomised
//            stalkMinT..stalkMaxT, then COMMIT.
//   COMMIT — break orbit and climb to a hover spot above Dan's column. If Dan
//            jukes so |drone.x - Dan.x| > abortDist before alignment, abort back
//            to STALK (mobility is the counterplay); once at/above Dan AND within
//            dropAlignX, enter DROP.
//   DROP   — drop a package bomb straight down its OWN column onto Dan's row
//            (existing fireEnemyDrop reticle/shadow), then re-enter STALK.
// Bombs only fire in DROP; the drop cooldown ticks in every phase so it's ready
// by the time the drone lines up.
function updateDrone(e, dt){
  const d = ENEMY.drone;
  e.rotor += dt * 26;                       // fast rotor spin (visual)
  e.dropCd -= dt;

  if (e.phase === "stalk"){
    // Orbit Dan. Angular rate uses ~70% of the speed budget so the chaser keeps
    // its radius instead of spending all its speed on tangential travel.
    e.orbitAngle += e.orbitDir * (e.speed * 0.7 / d.stalkRadius) * dt;
    const tgx = G.dan.x + Math.cos(e.orbitAngle) * d.stalkRadius;
    const tgy = G.dan.y + Math.sin(e.orbitAngle) * d.stalkRadius;
    droneMoveToward(e, tgx, tgy, dt);
    e.stalkT -= dt;
    if (e.stalkT <= 0) e.phase = "commit";

  } else if (e.phase === "commit"){
    // Climb toward the hover spot above Dan's column.
    droneMoveToward(e, G.dan.x, G.dan.y - d.hoverAbove, dt);
    if (Math.abs(e.x - G.dan.x) > d.abortDist){
      droneEnterStalk(e, d, false);         // Dan juked away — abort
    } else if (e.y <= G.dan.y && Math.abs(e.x - G.dan.x) <= d.dropAlignX){
      e.phase = "drop";                     // at/above Dan and lined up
    }

  } else { // drop
    if (e.dropCd <= 0){
      fireEnemyDrop(e, e.x, G.dan.y, d);    // x = drone's column, y = Dan's row
      e.dropCd = d.dropCd;
      droneEnterStalk(e, d, true);          // fresh stalk, maybe flip direction
    } else {
      // Hold the firing line over Dan's column until the bomb is off cooldown.
      droneMoveToward(e, G.dan.x, G.dan.y - d.hoverAbove, dt);
      if (Math.abs(e.x - G.dan.x) > d.abortDist) droneEnterStalk(e, d, false);
    }
  }

  // Flier: no wall collision; just stay inside the playable interior (border).
  const lo = CFG.TILE + e.r, hiX = (CFG.COLS - 1) * CFG.TILE - e.r,
        hiY = (CFG.ROWS - 1) * CFG.TILE - e.r;
  e.x = clamp(e.x, lo, hiX);
  e.y = clamp(e.y, lo, hiY);
}

// Rare boss-tier pursuer (GDD 6.1.9). Slow ground unit; fires a homing missile on
// a long cooldown whenever it has line-of-sight + range. Brief windup telegraphs the
// launch. On death (handled in killEnemy) emits a berserk pulse buffing nearby robots.
function updateManager(e, dt){
  const d = ENEMY.manager;
  const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  // Slow ground pursuer — berserk also boosts its own speed (rare: two Managers)
  moveBody(e, (dx/dist) * e.speed * buffSpd(e) * dt, (dy/dist) * e.speed * buffSpd(e) * dt);

  // Throttled LOS check
  e.losCheck -= dt;
  if (e.losCheck <= 0){
    e.losCheck = 0.25;
    e.canSee = dist < d.sight && hasLineOfSight(e.x, e.y, G.dan.x, G.dan.y);
  }

  if (e.winding > 0){
    // Telegraph: aim latched at windup start so Dan can sidestep the launch.
    e.winding -= dt;
    if (e.winding <= 0){
      fireEnemyHoming(e, d);
      e.fireCd = d.fireCd;
    }
  } else {
    e.fireCd -= dt;
    if (e.fireCd <= 0 && e.canSee && dist <= d.fireRange){
      e.aim = Math.atan2(dy, dx);   // latch initial heading; missile steers from there
      e.winding = d.windup;
    }
  }
}

// Support / alarm emitter (GDD 6.1.3). Patrols a fixed route (same routing as the
// Cleaner) with NO direct attack. While it has line-of-sight to Dan it broadcasts
// an ALARM: every robot within alarmRadius gets a short e.alarmed timer (refreshed
// each frame), which buffSpd reads for a speed boost and the melee block reads for
// a damage bonus — lighter than the Manager's berserk and continuous while in
// range. The alarm lingers alarmGrace after LOS breaks, and fades almost instantly
// (alarmHold) when the Scanner dies or a robot leaves range. Kill it first.
function updateScanner(e, dt){
  const d = ENEMY.scanner;

  // Patrol along the fixed route (same waypoint follow as the Cleaner).
  const w = e.waypoints[e.wpIndex];
  const dx = w.x - e.x, dy = w.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  e.face = Math.atan2(dy, dx);
  moveBody(e, (dx/dist) * e.speed * buffSpd(e) * dt, (dy/dist) * e.speed * buffSpd(e) * dt);
  e.wpTimer -= dt;
  if (dist <= ENEMY.cleaner.arriveDist || e.wpTimer <= 0){
    advancePatrol(e);
    e.wpTimer = ENEMY.cleaner.wpTimeout;
  }

  // Radar sweep (visual) + throttled LOS poll that (re)arms the alarm.
  e.sweep += dt * d.sweepRate;
  e.losCheck -= dt;
  if (e.losCheck <= 0){
    e.losCheck = d.losCheckEvery;
    if (Math.hypot(G.dan.x - e.x, G.dan.y - e.y) < d.sight &&
        hasLineOfSight(e.x, e.y, G.dan.x, G.dan.y)){
      e.alarmT = d.alarmGrace;            // refresh; lingers alarmGrace after LOS breaks
    }
  }
  if (e.alarmT > 0) e.alarmT -= dt;
  e.alarming = e.alarmT > 0;

  // Broadcast: refresh a short buff timer on every robot in range each frame.
  if (e.alarming){
    for (const other of G.enemies){
      if (other === e || other.spawn > 0) continue;
      if (Math.hypot(other.x - e.x, other.y - e.y) <= d.alarmRadius){
        other.alarmed = d.alarmHold;
      }
    }
  }
}

// Wanderer / worker-hunter (GDD 6.1.6). Two modes: WANDER (oblivious random roam)
// and HUNT (lock the nearest human worker and pursue relentlessly). It snaps into
// HUNT when a worker comes within proxAcquire, or on its huntPeriod timer; reaching
// the locked worker KILLS it (the only robot that can — no points, gone for the
// level), then it drops back to WANDER. Slow, but it corners fleeing workers.
function updateInventory(e, dt){
  const d = ENEMY.inventory;
  e.huntCd -= dt;

  // Nearest living worker (target candidate).
  let near = null, bd = Infinity;
  for (const w of G.workers){
    const dd = (w.x - e.x)*(w.x - e.x) + (w.y - e.y)*(w.y - e.y);
    if (dd < bd){ bd = dd; near = w; }
  }

  // Acquire: a worker within proxAcquire, or the periodic timer fired.
  if (e.mode === "wander" && near && (bd <= d.proxAcquire*d.proxAcquire || e.huntCd <= 0)){
    e.mode = "hunt"; e.target = near; e.huntCd = d.huntPeriod;
  }

  if (e.mode === "hunt"){
    // Target rescued/killed -> grab the nearest remaining, else give up hunting.
    if (!e.target || G.workers.indexOf(e.target) < 0) e.target = near;
    if (!e.target){
      e.mode = "wander";
    } else {
      const tx = e.target.x - e.x, ty = e.target.y - e.y;
      const td = Math.hypot(tx, ty) || 1;
      moveBody(e, (tx/td) * d.huntSpeed * buffSpd(e) * dt, (ty/td) * d.huntSpeed * buffSpd(e) * dt);
      if (Math.hypot(e.target.x - e.x, e.target.y - e.y) <= e.r + e.target.r){
        killWorker(e.target);
        e.target = null; e.mode = "wander"; e.huntCd = d.huntPeriod;
      }
      return;
    }
  }

  // WANDER: slow random roam; re-pick heading periodically, turn if boxed in.
  e.wanderT -= dt;
  if (e.wanderT <= 0){
    e.heading += (Math.random() - 0.5) * Math.PI;
    e.wanderT = d.wanderMin + Math.random() * (d.wanderMax - d.wanderMin);
  }
  const ox = e.x, oy = e.y;
  moveBody(e, Math.cos(e.heading) * e.speed * buffSpd(e) * dt, Math.sin(e.heading) * e.speed * buffSpd(e) * dt);
  if (e.x === ox && e.y === oy) e.heading += Math.PI * 0.5 + Math.random();
}
