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

// Sustained radial vignettes (low HP + Cleaner-sick), screen-space, drawn
// after the world block restores so they stay fixed to the viewport.
export function drawVignettes(){
  const hpA = getLowHpAlpha(), sickA = getCleanerSickAlpha();
  if (hpA <= 0.001 && sickA <= 0.001) return;
  const cx = VIEW_W/2, cy = VIEW_H/2, outerR = Math.hypot(cx, cy);

  if (hpA > 0.001){
    const C = CFG.CAMERAFX;
    const g = ctx.createRadialGradient(cx, cy, outerR*0.55, cx, cy, outerR);
    g.addColorStop(0, hexA(C.lowHpVignetteColor, 0));
    g.addColorStop(1, hexA(C.lowHpVignetteColor, hpA));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (sickA > 0.001){
    const C = CFG.CAMERAFX;
    const g = ctx.createRadialGradient(cx, cy, outerR*0.55, cx, cy, outerR);
    g.addColorStop(0, hexA(C.cleanerSickColor, 0));
    g.addColorStop(1, hexA(C.cleanerSickColor, sickA));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
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
