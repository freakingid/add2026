/* =========================================================================
   render-scanfx.js — Scanner "sensor beam" overlay.

   Drawn inside render()'s world transform, just before drawEnemies(). For each
   Scanner that currently sees Dan (e.seesDan): a translucent glowing BLUE beam
   Dan -> Scanner with ">" chevrons flowing toward the Scanner, plus a translucent
   glowing RED beam Scanner -> each buffed robot (e.alarmTargets) with ">" chevrons
   flowing toward each robot. Pure visual; reads sim state only. No LOS import
   (gating uses e.seesDan set in enemies-ai.js). Colors/speeds in CFG.SCANFX.
   ========================================================================= */
import { ctx } from "./canvas.js";
import { G } from "./state.js";
import { CFG } from "./config.js";

// One glowing beam + flowing ">" chevrons marching from (ax,ay) toward (bx,by).
function beam(ax, ay, bx, by, core, glow, arrowCol){
  const F = CFG.SCANFX;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ang = Math.atan2(dy, dx);

  // Line: fat translucent glow underlay + thin bright core (manual glow, no shadowBlur).
  ctx.lineCap = "round";
  ctx.strokeStyle = glow; ctx.lineWidth = F.glowWidth;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = core; ctx.lineWidth = F.coreWidth;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();

  // ">" chevrons scroll a->b so they read as travelling toward the target.
  const phase = (performance.now() / 1000 * F.arrowSpeed) % F.arrowSpacing;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);                 // ">" points +x -> now points along a->b
  ctx.font = F.arrowFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = arrowCol;
  for (let s = phase; s < len - 2; s += F.arrowSpacing) ctx.fillText(">", s, 0);
  ctx.restore();
}

export function drawScanFX(){
  const F = CFG.SCANFX;
  for (const e of G.enemies){
    if (e.type !== "scanner" || e.spawn > 0 || !e.seesDan) continue;
    // Blue: Dan -> Scanner (this Scanner is registering the player).
    beam(G.dan.x, G.dan.y, e.x, e.y, F.blueCore, F.blueGlow, F.blueArrow);
    // Red: Scanner -> each robot it is actively buffing this frame.
    const tg = e.alarmTargets;
    if (!tg) continue;
    for (const o of tg){
      if (!o || o.spawn > 0) continue;
      beam(e.x, e.y, o.x, o.y, F.redCore, F.redGlow, F.redArrow);
    }
  }
}
