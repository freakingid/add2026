/* =========================================================================
   render-ebolts.js — enemy projectile sprites.

   drawEbolts renders each projectile kind (bolt / arc box / drop package
   + reticle / homing missile).
   ========================================================================= */
import { ctx } from "./canvas.js";
import { G } from "./state.js";
import { COL } from "./palette.js";

// Render every active enemy projectile by kind (taser bolt; lobbed box).
export function drawEbolts(){
  for (const b of G.ebolts){
    if (b.kind === "bolt"){
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);
      // outer glow
      ctx.fillStyle = COL.boltGlow;
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 2.1, 0, Math.PI*2);
      ctx.fill();
      // electric body — a short streak with a crackle wobble
      ctx.strokeStyle = COL.bolt;
      ctx.lineWidth = b.r * 1.1;
      ctx.lineCap = "round";
      const wob = Math.sin(b.spin) * b.r * 0.5;
      ctx.beginPath();
      ctx.moveTo(-b.r*1.8, 0);
      ctx.lineTo(0, wob);
      ctx.lineTo(b.r*1.8, 0);
      ctx.stroke();
      // hot white core
      ctx.fillStyle = COL.boltCore;
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 0.55, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    } else if (b.kind === "arc"){
      // landing telegraph: fixed reticle at the impact point (whole flight)
      const pulse = 0.5 + 0.5 * Math.sin(b.spin * 0.6);
      ctx.strokeStyle = "rgba(255,120,90," + (0.35 + 0.35*pulse).toFixed(2) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.tx, b.ty, b.blast, 0, Math.PI*2);
      ctx.stroke();
      // moving ground shadow under the box (bigger/darker as it nears ground)
      const near = 1 - (b.height / (b.peak || 1));   // 0 high -> 1 grounded
      ctx.fillStyle = "rgba(0,0,0," + (0.12 + 0.22*near).toFixed(3) + ")";
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r * (0.7 + near*0.5), b.r * (0.4 + near*0.3), 0, 0, Math.PI*2);
      ctx.fill();
      // the tumbling cardboard box, lifted by its arc height
      ctx.save();
      ctx.translate(b.x, b.y - b.height);
      ctx.rotate(b.spin * 0.5);
      ctx.fillStyle = COL.box;
      ctx.fillRect(-b.r, -b.r, b.r*2, b.r*2);
      ctx.fillStyle = COL.boxDark;
      ctx.fillRect(-b.r, b.r*0.3, b.r*2, b.r*0.7);     // shaded lower flap
      ctx.strokeStyle = COL.boxTape;                    // packing-tape seam
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-b.r, 0); ctx.lineTo(b.r, 0);
      ctx.moveTo(0, -b.r); ctx.lineTo(0, b.r);
      ctx.stroke();
      ctx.strokeStyle = COL.boxDark;
      ctx.strokeRect(-b.r, -b.r, b.r*2, b.r*2);
      ctx.restore();
    } else if (b.kind === "drop"){
      // Fixed landing reticle (whole descent): blast ring + crosshair ticks.
      const pulse = 0.5 + 0.5 * Math.sin(b.spin * 0.8);
      ctx.strokeStyle = "rgba(255,140,60," + (0.4 + 0.45*pulse).toFixed(2) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.tx, b.ty, b.blast, 0, Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      for (const a of [0, Math.PI/2, Math.PI, -Math.PI/2]){
        ctx.moveTo(b.tx + Math.cos(a)*(b.blast-5), b.ty + Math.sin(a)*(b.blast-5));
        ctx.lineTo(b.tx + Math.cos(a)*(b.blast+4), b.ty + Math.sin(a)*(b.blast+4));
      }
      ctx.stroke();

      // Growing ground shadow under the falling bomb (darkens as it nears).
      const near = 1 - (b.height / (b.h0 || 1));    // 0 high -> 1 grounded
      ctx.fillStyle = "rgba(0,0,0," + (0.1 + 0.3*near).toFixed(3) + ")";
      ctx.beginPath();
      ctx.ellipse(b.tx, b.ty, b.r * (0.5 + near*0.8), b.r * (0.3 + near*0.45), 0, 0, Math.PI*2);
      ctx.fill();

      // The package bomb, descending vertically onto the reticle. Fake
      // perspective: starts ~2x size and shrinks to 1x as it nears the ground.
      const pscale = 1 + (b.height / (b.h0 || 1));   // 2 at release -> 1 at landing
      ctx.save();
      ctx.translate(b.tx, b.ty - b.height);
      ctx.scale(pscale, pscale);
      ctx.rotate(b.spin * 0.35);
      ctx.fillStyle = COL.bomb;
      ctx.fillRect(-b.r, -b.r, b.r*2, b.r*2);
      ctx.fillStyle = COL.bombDark;
      ctx.fillRect(-b.r, b.r*0.3, b.r*2, b.r*0.7);          // shaded lower flap
      // hazard chevrons across the top (reads as "armed", not just cardboard)
      ctx.fillStyle = COL.bombStripe;
      ctx.fillRect(-b.r, -b.r*0.55, b.r*2, b.r*0.3);
      ctx.fillStyle = COL.bombDark;
      ctx.fillRect(-b.r*0.55, -b.r*0.55, b.r*0.3, b.r*0.3);
      ctx.fillRect( b.r*0.25, -b.r*0.55, b.r*0.3, b.r*0.3);
      ctx.strokeStyle = COL.bombDark;
      ctx.lineWidth = 2;
      ctx.strokeRect(-b.r, -b.r, b.r*2, b.r*2);
      // blinking red arming light
      ctx.fillStyle = (Math.floor(performance.now()/80) % 2 === 0) ? COL.bombLight : "#5c1414";
      ctx.beginPath();
      ctx.arc(0, b.r*0.62, b.r*0.22, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    } else if (b.kind === "homing"){
      // Slow tracking missile: a rocket silhouette oriented along its velocity.
      const ang = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(ang);

      // Engine glow / exhaust plume behind the missile
      ctx.fillStyle = "rgba(255,160,40,0.55)";
      ctx.beginPath();
      ctx.moveTo(-b.r * 1.1, 0);
      ctx.lineTo(-b.r * 2.9, -b.r * 0.44);
      ctx.lineTo(-b.r * 3.6, 0);
      ctx.lineTo(-b.r * 2.9,  b.r * 0.44);
      ctx.closePath();
      ctx.fill();
      // Outer heat glow
      ctx.fillStyle = "rgba(255,80,20,0.18)";
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 2.8, 0, Math.PI*2);
      ctx.fill();

      // Body
      ctx.fillStyle = COL.missile;
      ctx.fillRect(-b.r * 1.0, -b.r * 0.5, b.r * 2.0, b.r);
      // Warning stripe
      ctx.fillStyle = COL.bombStripe;
      ctx.fillRect(-b.r * 0.28, -b.r * 0.5, b.r * 0.46, b.r);

      // Warhead (tapered nose)
      ctx.fillStyle = COL.missileWarhead;
      ctx.beginPath();
      ctx.moveTo(b.r * 1.0,  -b.r * 0.5);
      ctx.lineTo(b.r * 2.3,   0);
      ctx.lineTo(b.r * 1.0,   b.r * 0.5);
      ctx.closePath();
      ctx.fill();

      // Tail fins
      ctx.fillStyle = COL.missileFin;
      ctx.beginPath();
      ctx.moveTo(-b.r, 0);
      ctx.lineTo(-b.r * 1.6, -b.r * 0.95);
      ctx.lineTo(-b.r * 0.7, -b.r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-b.r, 0);
      ctx.lineTo(-b.r * 1.6,  b.r * 0.95);
      ctx.lineTo(-b.r * 0.7,  b.r * 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }
}
