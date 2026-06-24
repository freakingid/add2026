/* =========================================================================
   workers.js — human workers and rescue scoring (GDD 7).

   Workers wander slowly and flee robots they get close to; Dan rescues one by
   touching it, for escalating points (rescueBase doubles each: 100/200/400/800/
   1600 = 3100 for all five), with a celebratory callout on the last. The only
   thing that can KILL a worker is the Inventory Bot (GDD 6.1.6) — not built yet,
   so for now workers only ever leave the level by being rescued.
   ========================================================================= */
import { CFG } from "./config.js";
import { COL } from "./palette.js";
import { G } from "./state.js";
import { moveBody } from "./world.js";
import { addFloat } from "./effects.js";

export function updateWorkers(dt){
  const d = CFG.WORKER;
  for (let i = G.workers.length - 1; i >= 0; i--){
    const w = G.workers[i];
    w.bob += dt * 6;

    // Nearest robot within avoidRadius becomes a threat to scurry away from.
    let threat = null, bd = d.avoidRadius * d.avoidRadius;
    for (const e of G.enemies){
      if (e.spawn > 0) continue;
      const dd = (e.x - w.x)*(e.x - w.x) + (e.y - w.y)*(e.y - w.y);
      if (dd < bd){ bd = dd; threat = e; }
    }

    let speed;
    if (threat){
      w.fleeing = true;
      w.heading = Math.atan2(w.y - threat.y, w.x - threat.x) + (Math.random() - 0.5) * 0.4;
      speed = d.fleeSpeed;
    } else {
      w.fleeing = false;
      w.wanderT -= dt;
      if (w.wanderT <= 0){
        w.heading += (Math.random() - 0.5) * Math.PI;   // gentle course change
        w.wanderT = d.wanderMin + Math.random() * (d.wanderMax - d.wanderMin);
      }
      speed = d.speed;
    }

    // Move, sliding along walls; if fully boxed in, turn to find a way out.
    const ox = w.x, oy = w.y;
    moveBody(w, Math.cos(w.heading) * speed * dt, Math.sin(w.heading) * speed * dt);
    if (w.x === ox && w.y === oy) w.heading += Math.PI * 0.5 + Math.random();

    // Rescue on contact with Dan (GDD 7.3).
    if (Math.hypot(G.dan.x - w.x, G.dan.y - w.y) <= w.r + G.dan.r) rescueWorker(i);
  }
}

// Award the escalating rescue value, count it, and remove the worker.
function rescueWorker(i){
  const w = G.workers[i], d = CFG.WORKER;
  const pts = d.rescueBase * Math.pow(2, G.rescued);   // 100, 200, 400, 800, 1600
  G.score += pts;
  G.rescued++;
  addFloat(w.x, w.y - 14, "+" + pts + " SAVED", COL.atomic);
  G.workers.splice(i, 1);
  // Celebratory callout for the full clear of all workers (GDD 7.2).
  if (G.rescued === d.count) addFloat(G.dan.x, G.dan.y - 30, "ALL " + d.count + " SAVED!", COL.amber);
}
