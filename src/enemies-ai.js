/* =========================================================================
   enemies-ai.js — per-type AI updaters for all enemy robots.

   Each exported function handles one full AI tick for its enemy type.
   Called by updateEnemies in enemies.js; imports shared helpers from there.
   ========================================================================= */
import { CFG, ENEMY } from "./config.js";
import { G } from "./state.js";
import {
  moveBody, isWall, hasLineOfSight, destroyShelf, isDestructible,
  tileFloor, tileCenter, tileClearRun, clamp, applyBeltPush,
} from "./world.js";
import { fireEnemyBolt, fireEnemyArc, fireEnemyDrop, fireEnemyHoming } from "./projectiles.js";
import { killWorker } from "./workers.js";
import { sfx } from "./audio.js";
import { emit } from "./events.js";
import { buffSpd, danInSprayCone, applySpray, advancePatrol, coneRayDist } from "./enemies.js";

// Basic chaser (Picker).
export function updatePicker(e, dt){
  const dx = G.dan.x - e.x, dy = G.dan.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  moveBody(e, (dx/dist) * e.speed * buffSpd(e) * dt, (dy/dist) * e.speed * buffSpd(e) * dt);
}

// Slow tank that locks line-of-sight and charges, smashing shelves (GDD 6).
export function updateForklift(e, dt){
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
      if (isDestructible(tx, ty)){
        destroyShelf(tx, ty);                       // plow through shelving
        e.x = nx; e.y = ny;
      } else {
        e.mode = "recover"; e.timer = d.recover;   // can't smash walls / pallets / pillars
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
export function updateSecurity(e, dt){
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
      emit('enemy:fired', { type: e.type });
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
export function updateSorter(e, dt){
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
      emit('enemy:fired', { type: e.type });
      e.fireCd = d.fireCd;
    }
    // Out of range: fireCd stays ready (<=0), so it lobs the instant it closes in.
  }
}

// Debuffer / slow hazard (GDD 6). Follows a FIXED patrol route (built at spawn)
// and sprays a short cone AHEAD of its heading; the spray ticks damage AND
// refreshes a movement-slow on Dan while he's inside it. Oblivious to Dan by
// default (cone points where it walks); set ENEMY.cleaner.aimAtDan to face Dan.
export function updateCleaner(e, dt){
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

// Free mover (NOT moveBody): step straight toward (tx,ty) at e.speed, without
// overshooting. Flying drones ignore walls; clamped to the border by the caller.
export function droneMoveToward(e, tx, ty, dt){
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
export function droneEnterStalk(e, d, flip){
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
export function updateDrone(e, dt){
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
      emit('enemy:fired', { type: e.type });
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
export function updateManager(e, dt){
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
      emit('enemy:fired', { type: e.type });
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
export function updateScanner(e, dt){
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
    e.seesDan = (Math.hypot(G.dan.x - e.x, G.dan.y - e.y) < d.sight &&
                 hasLineOfSight(e.x, e.y, G.dan.x, G.dan.y));
    if (e.seesDan){
      e.alarmT = d.alarmGrace;            // refresh; lingers alarmGrace after LOS breaks
    }
  }
  if (e.alarmT > 0) e.alarmT -= dt;
  const wasAlarming = e.alarming;
  e.alarming = e.alarmT > 0;
  if (e.alarming && !wasAlarming) sfx.alarm();   // klaxon on the rising edge only

  // Broadcast: refresh a short buff timer on every robot in range each frame, and
  // collect the in-range set so drawScanFX can draw the red beams (render-only).
  if (!e.alarmTargets) e.alarmTargets = [];   // guard: robots loaded from an old save
  e.alarmTargets.length = 0;
  if (e.alarming){
    for (const other of G.enemies){
      if (other === e || other.spawn > 0) continue;
      if (Math.hypot(other.x - e.x, other.y - e.y) <= d.alarmRadius){
        other.alarmed = d.alarmHold;
        e.alarmTargets.push(other);
      }
    }
  }
}

// Wanderer / worker-hunter (GDD 6.1.6). Two modes: WANDER (oblivious random roam)
// and HUNT (lock the nearest human worker and pursue relentlessly). It snaps into
// HUNT when a worker comes within proxAcquire, or on its huntPeriod timer; reaching
// the locked worker KILLS it (the only robot that can — no points, gone for the
// level), then it drops back to WANDER. Slow, but it corners fleeing workers.
export function updateInventory(e, dt){
  const d = ENEMY.inventory;
  e.huntCd -= dt;

  // No workers left to hunt -> turn on Dan himself (GDD 6.1.6). Re-checked every
  // tick so the bot pivots the instant the last human is gone. Reuses "hunt" mode
  // (hot-red eye, faces target) with Dan as the target; melee damage is dealt by
  // the shared contact block in updateEnemies().
  if (G.workers.length === 0){
    e.mode = "hunt"; e.target = G.dan;
    const tx = G.dan.x - e.x, ty = G.dan.y - e.y;
    const td = Math.hypot(tx, ty) || 1;
    moveBody(e, (tx/td) * d.huntDanSpeed * buffSpd(e) * dt, (ty/td) * d.huntDanSpeed * buffSpd(e) * dt);
    return;
  }

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
