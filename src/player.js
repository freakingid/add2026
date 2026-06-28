/* =========================================================================
   player.js — Dan and his soap bubbles.

   updateDan: aim (keyboard fire key wins, else mouse), WASD movement with
   Cleaner-slow scaling, knockback decay, i-frame/cooldown/slow timers, and
   firing (Rapid/Triple/Bounce stack rules + per-trigger counter decrement).
   updateShots: bubble motion, wall bounce/expiry, and hits on enemies/terminals.
   ========================================================================= */
import { CFG } from "./config.js";
import { G } from "./state.js";
import { mouse, getMoveVec, getFireAngle } from "./input.js";
import { moveBody, isWall, pushAtWorld, clampNet, hasLineOfSight } from "./world.js";
import { killEnemy, destroyTerminal } from "./combat.js";
import { sfx } from "./audio.js";
import { emit } from "./events.js";

export function updateDan(dt){
  // Aim: the active fire direction wins. When not firing, keyboard mode keeps Dan
  // facing the mouse cursor; gamepad mode holds his last fire heading (GDD §11).
  const fireAngle = getFireAngle();
  if (fireAngle !== null){
    G.dan.angle = fireAngle;
  } else if (G.inputMode !== "gamepad"){
    const mwx = mouse.sx + G.camera.x;
    const mwy = mouse.sy + G.camera.y;
    G.dan.angle = Math.atan2(mwy - G.dan.y, mwx - G.dan.x);
  }

  // movement input — already normalized (mag 0 or 1) by the input layer.
  const mv = getMoveVec();

  // Aim heading bookkeeping for conv_wrong_aisle: store the angle Dan is facing
  // this frame (fire heading when firing, else cursor/last-heading from above).
  G.dan.lastAimAngle = G.dan.angle;

  // Movement-input ring buffer for cmb_confrontational: one {dx,dy,t} per frame,
  // trimmed to the last 500 ms. Records intent (getMoveVec), not velocity.
  const _now = performance.now();
  G.dan.moveHistory.push({ dx: mv.x, dy: mv.y, t: _now });
  while (G.dan.moveHistory.length && _now - G.dan.moveHistory[0].t > 500) {
    G.dan.moveHistory.shift();
  }

  // player:stood_still — accumulate stillness; emit once at 1000 ms, then reset.
  if (mv.x !== 0 || mv.y !== 0) {
    G.dan.stillInputMs = 0;
    G.dan._stoodStillEmitted = false;
  } else {
    G.dan.stillInputMs += dt * 1000;
    if (G.dan.stillInputMs >= 1000 && !G.dan._stoodStillEmitted) {
      emit('player:stood_still', { durationMs: G.dan.stillInputMs });
      G.dan._stoodStillEmitted = true;
    }
  }

  // Cleaner spray slows Dan's movement while the debuff is active.
  const moveSpeed = CFG.DAN_SPEED * (G.dan.slow > 0 ? CFG.SLOW_FACTOR : 1);
  // Conveyor belt (§8.1.2): Dan's net velocity is his own move vector PLUS the
  // belt push at his cell, so riding with it speeds him up and pushing against it
  // slows him but still makes headway. Clamp the net so a fast belt can't fling
  // him. The belt acts even when standing still (mv = 0). onBelt drives the hum.
  const belt = pushAtWorld(G.dan.x, G.dan.y);
  G.dan.onBelt = belt.dx !== 0 || belt.dy !== 0;
  const net = clampNet(mv.x * moveSpeed + belt.dx, mv.y * moveSpeed + belt.dy, CFG.DAN_NET_SPEED_MAX);
  moveBody(G.dan, net.x * dt, net.y * dt);

  // conveyor:push_start / conveyor:push_tick
  if (G.dan.onBelt && !G.dan._prevOnBelt) emit('conveyor:push_start');
  if (G.dan.onBelt) emit('conveyor:push_tick', { dx: belt.dx, dy: belt.dy });
  G.dan._prevOnBelt = G.dan.onBelt;

  // knockback velocity (decays via friction)
  if (G.dan.kvx || G.dan.kvy){
    moveBody(G.dan, G.dan.kvx * dt, G.dan.kvy * dt);
    const decay = Math.exp(-CFG.KNOCKBACK_FRICTION * dt);
    G.dan.kvx *= decay; G.dan.kvy *= decay;
    if (Math.hypot(G.dan.kvx, G.dan.kvy) < 8){ G.dan.kvx = 0; G.dan.kvy = 0; }
  }

  if (G.dan.iframe > 0) G.dan.iframe -= dt;
  if (G.dan.cooldown > 0) G.dan.cooldown -= dt;
  if (G.dan.slow > 0) G.dan.slow -= dt;
  if (G.dan.sprayTick > 0) G.dan.sprayTick -= dt;

  // fire — a fire direction is active (keyboard fire keys / mouse, or right stick)
  const wantFire = fireAngle !== null;

  // Active power-up flags this trigger (GDD 3).
  const rf  = G.powerups.rapid  > 0;
  const tri = G.powerups.triple > 0;
  const bn  = G.powerups.bounce > 0;

  // Max shots on screen by stack state (GDD 3.2): 3 base, +3 RF, +3 Triple.
  const cap = CFG.SHOT_MAX_ON_SCREEN + (rf?3:0) + (tri?3:0);
  // Rapid Fire doubles fire rate (halves cooldown).
  const cooldown = CFG.SHOT_COOLDOWN / (rf ? CFG.RAPID_MULT : 1);

  const volley = tri ? 3 : 1;
  if (wantFire && G.dan.cooldown <= 0 && G.shots.length + volley <= cap){
    fireVolley(G.dan.angle, tri, bn);
    G.dan.cooldown = cooldown;
    // One trigger consumes one shot from each active counter.
    if (rf)  G.powerups.rapid--;
    if (tri) G.powerups.triple--;
    if (bn)  G.powerups.bounce--;
  }
}

// Fire one trigger event: 3-projectile fan if Triple, else single.
function fireVolley(angle, triple, bounce){
  sfx.shoot();   // one bloop per trigger, not per pellet
  emit('bolt:fired', {
    kind: bounce ? 'bounce' : 'standard',
    isTripleShotActive: !!triple,
  });
  if (triple){
    const s = CFG.TRIPLE_SPREAD;
    fireBubble(angle - s, triple, bounce);
    fireBubble(angle,     triple, bounce);
    fireBubble(angle + s, triple, bounce);
  } else {
    fireBubble(angle, triple, bounce);
  }
}

function fireBubble(angle, big, bounce){
  const muzzle = G.dan.r + 6;
  G.shots.push({
    x: G.dan.x + Math.cos(angle) * muzzle,
    y: G.dan.y + Math.sin(angle) * muzzle,
    vx: Math.cos(angle) * CFG.SHOT_SPEED,
    vy: Math.sin(angle) * CFG.SHOT_SPEED,
    r: big ? CFG.SHOT_RADIUS * 1.5 : CFG.SHOT_RADIUS,
    traveled: 0,
    wob: Math.random()*Math.PI*2,
    big: !!big,          // Triple Shot -> larger, opaque cleaning pod
    bounce: !!bounce,    // Bounce Shot -> ricochet off walls
    bounceCount: 0,      // wall bounce tally (for bounce achievements)
    chainCount: 0,       // enemies struck by this shot in sequence (for bnc_chain)
    wallsHit: null,      // Set of stringified tile coords hit (lazy-init on first bounce)
    danPosAtFire: { x: G.dan.x, y: G.dan.y },  // for blind-shot LOS check at hit time
    spawnTime: performance.now(),               // for timeAliveMs context
  });
}

export function updateShots(dt){
  for (let i = G.shots.length - 1; i >= 0; i--){
    const s = G.shots[i];
    const stepX = s.vx * dt, stepY = s.vy * dt;
    s.wob += dt * 12;

    if (s.bounce){
      // Per-axis reflection so bubbles ricochet off tile walls (GDD 3).
      let nx = s.x + stepX, ny = s.y + stepY;
      let bounced = false;
      const tileX = (s.x / CFG.TILE)|0, tileY = (s.y / CFG.TILE)|0;
      if (isWall((nx / CFG.TILE)|0, tileY)){
        s.vx = -s.vx; nx = s.x + s.vx * dt; bounced = true;
        // track bounce on x-axis wall
        const wk = `${(nx / CFG.TILE)|0},${tileY}`;
        s.bounceCount++; if (!s.wallsHit) s.wallsHit = new Set(); s.wallsHit.add(wk);
      }
      if (isWall(tileX, (ny / CFG.TILE)|0)){
        s.vy = -s.vy; ny = s.y + s.vy * dt; bounced = true;
        // track bounce on y-axis wall
        const wk = `${tileX},${(ny / CFG.TILE)|0}`;
        s.bounceCount++; if (!s.wallsHit) s.wallsHit = new Set(); s.wallsHit.add(wk);
      }
      // Corner case: still inside a wall after axis checks — reflect both.
      if (!bounced && isWall((nx / CFG.TILE)|0, (ny / CFG.TILE)|0)){
        s.vx = -s.vx; s.vy = -s.vy;
        nx = s.x + s.vx * dt; ny = s.y + s.vy * dt; bounced = true;
        const wk = `${(nx / CFG.TILE)|0},${(ny / CFG.TILE)|0}`;
        s.bounceCount++; if (!s.wallsHit) s.wallsHit = new Set(); s.wallsHit.add(wk);
      }
      if (bounced) G.marks.push({ x:s.x, y:s.y, life:1 }); // soapy splat
      s.x = nx; s.y = ny;
    } else {
      s.x += stepX; s.y += stepY;
    }
    s.traveled += Math.hypot(stepX, stepY);

    // Expire by range; non-bounce shots also fizzle on the first wall hit.
    const inWall = isWall((s.x / CFG.TILE)|0, (s.y / CFG.TILE)|0);
    if (s.traveled >= CFG.SHOT_RANGE || (!s.bounce && inWall)){
      emit(s.traveled >= CFG.SHOT_RANGE ? 'bolt:expired' : 'bolt:missed');
      G.shots.splice(i, 1);
      continue;
    }

    // hit enemies, then dispatch terminals
    let consumed = false;
    for (let j = G.enemies.length - 1; j >= 0; j--){
      const e = G.enemies[j];
      if (e.spawn > 0) continue;
      if (Math.hypot(e.x - s.x, e.y - s.y) <= e.r + s.r){
        e.hp -= 1; e.hitFlash = 0.1;
        sfx.pop();   // soap bubble pops on a robot
        s.chainCount = (s.chainCount ?? 0) + 1;   // enemies hit by this shot in sequence
        const bc = s.bounceCount ?? 0;
        const uwc = s.wallsHit?.size ?? 0;
        const hadLOS = hasLineOfSight(s.danPosAtFire.x, s.danPosAtFire.y, e.x, e.y);
        emit('bolt:hit', { targetType: e.type, bounceCount: bc, uniqueWallCount: uwc });
        G.shots.splice(i, 1);
        if (e.hp <= 0) killEnemy(j, {
          killerKind: 'bubble',
          bounceCount: bc,
          uniqueWallCount: uwc,
          chainCount: s.chainCount,
          hadLOSAtFire: hadLOS,
          pos: { x: e.x, y: e.y },
          timeAliveMs: performance.now() - (e._spawnTime ?? 0),
        });
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    for (let k = G.terminals.length - 1; k >= 0; k--){
      const t = G.terminals[k];
      if (Math.hypot(t.x - s.x, t.y - s.y) <= t.r + s.r){
        t.hp -= 1; t.hitFlash = 0.12;
        sfx.terminalHit();
        G.shots.splice(i, 1);
        if (t.hp <= 0) destroyTerminal(k);
        break;
      }
    }
  }
}
