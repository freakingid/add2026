/* =========================================================================
   flash.js — brief full-screen tint for high-signal moments (e.g. last
   enemy cleared) that shouldn't rely on audio alone to register.

   Module-local state, same convention as wipe.js. Wire-in:
     update.js — updateFlash(dt) every frame
     render.js — drawFlash() late in the draw order, before drawWipe()
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";

const DECAY = 5.5;      // higher = faster fade (intensity units/sec)
let intensity = 0;      // 0..PEAK, decays to 0

// Warm off-white, NOT pure white — pure white is already used for the
// player's damage/i-frame flash and terminal/vend hit-flashes; this needs
// to read as "good event", not "you got hit."
const COLOR = "255,247,230";

export function startFlash(peak = 0.22){
  intensity = peak;
}

export function updateFlash(dt){
  if (intensity <= 0) return;
  intensity -= DECAY * dt;
  if (intensity < 0) intensity = 0;
}

export function drawFlash(){
  if (intensity <= 0) return;
  ctx.save();
  ctx.fillStyle = `rgba(${COLOR},${intensity.toFixed(3)})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
}
