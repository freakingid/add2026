/* =========================================================================
   wipe.js — iris wipe screen transition.

   A single 5-point star scales up (closing) to cover the screen or scales
   down (opening) to reveal it, centered on Dan's screen-space position at
   trigger time.

   All state is module-local; nothing goes on G. Wire-in:
     update.js  — updateWipe(dt) each frame; startWipeClose on exit collision
                  startWipeOpen deferred to first playing frame (G._wipeOpenPending)
     render.js  — drawWipe() as the absolute last draw call
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from './canvas.js';
import { CFG } from './config.js';

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

let _offscreen = null;
let _octx = null;

function getOffscreen() {
  if (!_offscreen) {
    _offscreen = document.createElement('canvas');
    _offscreen.width = VIEW_W;
    _offscreen.height = VIEW_H;
    _octx = _offscreen.getContext('2d');
  }
  return { oc: _offscreen, octx: _octx };
}

function drawStar(octx, cx, cy, R) {
  const r = R * 0.38;
  const points = 5;
  octx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI / points) - Math.PI / 2;
    const radius = i % 2 === 0 ? R : r;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) octx.moveTo(x, y);
    else octx.lineTo(x, y);
  }
  octx.closePath();
  octx.fill();
}

export function drawWipe() {
  if (phase === 'none') return;

  let scale;
  if      (phase === 'closing')  scale = easeInOut(t);
  else if (phase === 'hold_in')  scale = 1;
  else if (phase === 'hold_out') scale = 1;
  else if (phase === 'opening')  scale = 1 - easeInOut(t);

  const { oc, octx } = getOffscreen();

  octx.clearRect(0, 0, VIEW_W, VIEW_H);
  octx.globalCompositeOperation = 'source-over';
  octx.fillStyle = 'rgba(28,31,38,0.80)';
  octx.fillRect(0, 0, VIEW_W, VIEW_H);

  octx.globalCompositeOperation = 'destination-out';
  const MAX_R = Math.hypot(VIEW_W, VIEW_H) * 0.75;
  const R = MAX_R * (1 - scale);
  drawStar(octx, focalX, focalY, R);

  octx.globalCompositeOperation = 'source-over';
  ctx.drawImage(oc, 0, 0);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
