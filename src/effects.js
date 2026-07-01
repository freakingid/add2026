/* =========================================================================
   effects.js — transient feedback: floating score text + soapy/debris marks.
   A safe leaf (state only) so combat/level/world can all push effects without
   creating import cycles.
   ========================================================================= */
import { G } from "./state.js";

export function addFloat(x, y, text, color){
  G.floats.push({ x, y, text, color, life:1.1, vy:-26 });
}

// Three rings at staggered starting life so they cascade rather than popping
// in sync — reuses the existing life-decay loop below, no new timer needed.
export function addHealRing(x, y, color){
  G.marks.push({ x, y, life:1.00, kind:"healRing", color, vy:-22 });
  G.marks.push({ x, y, life:0.85, kind:"healRing", color, vy:-22 });
  G.marks.push({ x, y, life:0.70, kind:"healRing", color, vy:-22 });
}

export function updateEffects(dt){
  for (let i = G.marks.length - 1; i >= 0; i--){
    const m = G.marks[i];
    if (m.vy) m.y += m.vy * dt;
    m.life -= dt * 1.6;
    if (m.life <= 0) G.marks.splice(i, 1);
  }
  for (let i = G.floats.length - 1; i >= 0; i--){
    const f = G.floats[i];
    f.y += f.vy * dt;
    f.life -= dt;
    if (f.life <= 0) G.floats.splice(i, 1);
  }
}
