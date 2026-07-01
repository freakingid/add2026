/* =========================================================================
   render-marks.js — drawMarks(), split out of render.js to keep it under
   the 24KB module-split convention. See STATUS.md architecture map.
   ========================================================================= */
import { ctx } from "./canvas.js";
import { G } from "./state.js";
import { CFG } from "./config.js";
import { hexA } from "./render-camerafx.js";

export function drawMarks(){
  for (const m of G.marks){
    if (m.kind === "berserk"){
      // Expanding orange ring: Manager's on-death pulse made visible.
      const progress = 1 - m.life / 1.5;          // 0 at death -> 1 at end
      const rad = progress * 200;
      ctx.strokeStyle = "rgba(255,100,20," + (m.life / 1.5 * 0.75).toFixed(2) + ")";
      ctx.lineWidth = 4 - progress * 2.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(1, rad), 0, Math.PI*2);
      ctx.stroke();
    } else if (m.kind === "blast"){
      // Atomic Dustbin detonation: a bright shockwave ring flashing out to blastRadius.
      const progress = 1 - m.life / 1.5;            // 0 at detonation -> 1 at end
      const rad = progress * CFG.DUSTBIN.blastRadius;
      // filled flash core, fading fast
      ctx.fillStyle = "rgba(93,255,143," + (m.life / 1.5 * 0.30).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(1, rad), 0, Math.PI*2);
      ctx.fill();
      // leading shock ring
      ctx.strokeStyle = "rgba(220,255,235," + (m.life / 1.5 * 0.9).toFixed(2) + ")";
      ctx.lineWidth = 6 - progress * 4;
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(1, rad), 0, Math.PI*2);
      ctx.stroke();
    } else if (m.kind === "debris"){
      ctx.fillStyle = "rgba(150,108,60," + (0.7 * m.life).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(m.x, m.y, (m.size || 6) * (1.3 - m.life * 0.5), 0, Math.PI*2);
      ctx.fill();
    } else if (m.kind === "healRing"){
      const progress = 1 - m.life;                       // life starts at 1.0/0.85/0.70, all decay at the same 1.6/s rate
      const rad = 4 + progress * 16;
      ctx.strokeStyle = m.color.startsWith('#') ? hexA(m.color, Math.max(0, m.life) * 0.85) : m.color;
      ctx.lineWidth = 2.5 - progress * 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(1, rad), 0, Math.PI*2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(150,220,255," + (0.35 * m.life).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 7 * (1.2 - m.life * 0.4), 0, Math.PI*2);
      ctx.fill();
    }
  }
}
