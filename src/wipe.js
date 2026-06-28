/* =========================================================================
   wipe.js — iris wipe screen transition.

   A grid of mop-bucket icons scales up (Iris In / closing) to cover the screen
   or scales down (Iris Out / opening) to reveal it. Every icon scales from the
   same focal point — Dan's screen-space position at trigger time.

   All state is module-local; nothing goes on G. Wire-in:
     update.js  — updateWipe(dt) each frame; startWipeClose on exit collision
     level.js   — startWipeOpen at end of loadLevel
     render.js  — drawWipe() as the absolute last draw call
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from './canvas.js';
import { CFG } from './config.js';
import { COL } from './palette.js';

let phase = 'none';   // 'none' | 'opening' | 'hold_out' | 'closing' | 'hold_in'
let t = 0;            // normalized 0..1 within the current animated phase
let holdTimer = 0;    // counts down during hold phases
let focalX = 0;       // screen-space X when wipe was triggered (held fixed)
let focalY = 0;       // screen-space Y when wipe was triggered (held fixed)

export function startWipeClose(sx, sy) {
  phase = 'closing';
  t = 0;
  focalX = sx;
  focalY = sy;
}

export function startWipeOpen(sx, sy) {
  phase = 'hold_out';
  t = 0;
  holdTimer = CFG.WIPE_HOLD_OUT;
  focalX = sx;
  focalY = sy;
}

export function updateWipe(dt) {
  if (phase === 'none') return;

  if (phase === 'closing') {
    t += dt / CFG.WIPE_CLOSE_DUR;
    if (t >= 1) { t = 1; phase = 'hold_in'; holdTimer = CFG.WIPE_HOLD_IN; }

  } else if (phase === 'hold_in') {
    holdTimer -= dt;
    // Do NOT call nextLevel() here — update.js's G.transition countdown does that.
    // This phase just keeps the screen covered until that fires.
    if (holdTimer <= 0) phase = 'none';   // safety fallback

  } else if (phase === 'hold_out') {
    holdTimer -= dt;
    if (holdTimer <= 0) { phase = 'opening'; t = 0; }

  } else if (phase === 'opening') {
    t += dt / CFG.WIPE_OPEN_DUR;
    if (t >= 1) { t = 1; phase = 'none'; }
  }
}

export function drawWipe() {
  if (phase === 'none') return;

  let scale;
  if      (phase === 'closing')  scale = easeInOut(t);
  else if (phase === 'hold_in')  scale = 1;
  else if (phase === 'hold_out') scale = 1;
  else if (phase === 'opening')  scale = 1 - easeInOut(t);

  const size = CFG.WIPE_ICON_SIZE;
  const cols = CFG.WIPE_COLS;
  const rows = CFG.WIPE_ROWS;

  const gridW = cols * size;
  const gridH = rows * size;
  const originX = (VIEW_W - gridW) / 2;
  const originY = (VIEW_H - gridH) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellX = originX + c * size + size / 2;
      const cellY = originY + r * size + size / 2;

      ctx.save();
      ctx.translate(focalX, focalY);
      ctx.scale(scale, scale);
      ctx.translate(cellX - focalX, cellY - focalY);
      drawWipeIcon(size);
      ctx.restore();
    }
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function drawWipeIcon(size) {
  ctx.strokeStyle = COL.atomic;
  ctx.lineWidth = Math.max(1, size * 0.045);

  // Body (trapezoid)
  ctx.beginPath();
  ctx.moveTo(-0.30 * size, -0.28 * size);
  ctx.lineTo( 0.30 * size, -0.28 * size);
  ctx.lineTo( 0.22 * size,  0.32 * size);
  ctx.lineTo(-0.22 * size,  0.32 * size);
  ctx.closePath();
  ctx.stroke();

  // Wringer (small rect, right side of body)
  ctx.beginPath();
  ctx.rect(0.22 * size, -0.10 * size, 0.14 * size, 0.20 * size);
  ctx.closePath();
  ctx.stroke();

  // Handle (arc bowing upward above body)
  ctx.beginPath();
  ctx.arc(0, -0.28 * size, 0.22 * size, Math.PI, 0, true);
  ctx.stroke();

  // Left wheel
  ctx.beginPath();
  ctx.arc(-0.12 * size, 0.38 * size, 0.05 * size, 0, Math.PI * 2);
  ctx.stroke();

  // Right wheel
  ctx.beginPath();
  ctx.arc( 0.12 * size, 0.38 * size, 0.05 * size, 0, Math.PI * 2);
  ctx.stroke();
}
