/* =========================================================================
   render-camerafx.js — ctx drawing calls for camerafx.js's screen/world
   effects (SPEC-camera-effects.md). Split from render.js per the
   render-entities.js/render-ebolts.js precedent so render.js only wires
   these in, never draws them directly.
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";
import { getLowHpAlpha, getCleanerSickAlpha, getFlashLayers, getDesatAlpha } from "./camerafx.js";
import { CFG } from "./config.js";

export function hexA(hex, alpha){
  const v = parseInt(hex.slice(1), 16);
  const r = (v>>16)&255, g = (v>>8)&255, b = v&255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// Sustained low-HP radial vignette, screen-space, drawn after the world
// block restores so it stays fixed to the viewport.
export function drawVignettes(){
  const hpA = getLowHpAlpha();
  if (hpA <= 0.001) return;
  const cx = VIEW_W/2, cy = VIEW_H/2, outerR = Math.hypot(cx, cy);

  const C = CFG.CAMERAFX;
  const g = ctx.createRadialGradient(cx, cy, outerR*0.55, cx, cy, outerR);
  g.addColorStop(0, hexA(C.lowHpVignetteColor, 0));
  g.addColorStop(1, hexA(C.lowHpVignetteColor, hpA));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// Cleaner-sick: faint glow around Dan, world-space, drawn behind his sprite
// (same convention as enemy berserk/alarm auras in render-entities.js).
export function drawCleanerGlow(x, y){
  const a = getCleanerSickAlpha();
  if (a < 0.01) return;
  const t = performance.now()/1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  const alpha = a * (0.6 + 0.4*pulse);
  ctx.fillStyle = hexA(CFG.CAMERAFX.cleanerSickColor, alpha);
  ctx.beginPath();
  ctx.arc(x, y, CFG.DAN_RADIUS + 6 + pulse*3, 0, Math.PI*2);
  ctx.fill();
}

// One-shot flash layers (player died / dustbin detonate/bounce/throw /
// manager pulse / powerup collected), screen-space, drawn on top of vignettes.
export function drawFlashes(){
  for (const f of getFlashLayers()){
    if (f.alpha <= 0.001) continue;
    ctx.fillStyle = hexA(f.color, f.alpha);
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

// Worker-died desaturation pulse — world-space wash. Called INSIDE the world
// save/restore block, before its ctx.restore(), so only the world layer
// desaturates (not the HUD).
export function drawDesaturation(){
  const a = getDesatAlpha();
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = a;
  ctx.fillStyle = 'hsl(0,0%,50%)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}
