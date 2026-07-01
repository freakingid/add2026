/* =========================================================================
   camerafx.js — pure math/state leaf for camera & screen feedback effects
   (SPEC-camera-effects.md). Shake, zoom-punch, sustained vignettes (low HP,
   Cleaner-sick), the flash queue, and the desaturation pulse. Zero canvas
   involvement — render-camerafx.js reads these getters to draw.

   Subscribes to events.js at module-load time (side effect on import), same
   idiom as update.js's `on('level:all_enemies_dead', ...)`.
   ========================================================================= */
import { CFG, POWERUPS } from "./config.js";
import { G } from "./state.js";
import { on } from "./events.js";

// --- Shake: "take the stronger, don't stack" ---
let _mag = 0, _dur = 0, _elapsed = 0;
export function shake(mag, dur){
  const remaining = _dur > 0 ? _mag * Math.max(0, 1 - _elapsed/_dur) : 0;
  if (mag >= remaining){ _mag = mag; _dur = dur; _elapsed = 0; }
}
export function tickShake(dt){ if (_elapsed < _dur) _elapsed += dt; }
export function currentShakeMag(){
  return (_dur > 0 && _elapsed < _dur) ? _mag * (1 - _elapsed/_dur) : 0;
}
export function impactShakeOffset(){
  const m = currentShakeMag();
  if (m <= 0) return { x:0, y:0 };
  const t = performance.now()/1000;
  return {
    x: (Math.sin(t*53.7) + Math.sin(t*39.1)) * 0.5 * m,
    y: (Math.cos(t*47.3) + Math.cos(t*31.7)) * 0.5 * m,
  };
}

// --- Cleaner-sick sustained wobble+fade ---
let _cleanerAlpha = 0;
export function tickCleanerSick(dt){
  const C = CFG.CAMERAFX;
  const target = (G.dan && G.dan.slow > 0) ? C.cleanerSickMaxAlpha : 0;
  _cleanerAlpha += (target - _cleanerAlpha) * Math.min(1, dt * C.cleanerFadeRate);
}
export function getCleanerSickAlpha(){ return _cleanerAlpha; }

export function getShakeOffset(){
  return impactShakeOffset();
}

// --- Zoom punch ---
let _zoomPeak = 1, _zoomDur = 0, _zoomElapsed = 0;
export function punchZoom(peak, dur){ _zoomPeak = peak; _zoomDur = dur; _zoomElapsed = 0; }
export function tickZoom(dt){ if (_zoomElapsed < _zoomDur) _zoomElapsed += dt; }
export function currentZoom(){
  if (_zoomDur <= 0 || _zoomElapsed >= _zoomDur) return 1;
  const t = _zoomElapsed / _zoomDur;
  const p = t < 0.35 ? t/0.35 : 1 - (t-0.35)/0.65;
  return 1 + (_zoomPeak - 1) * p;
}
export function getZoomScale(){ return currentZoom(); }

// --- Flash queue ---
let _flashes = [];   // { color, peak, dur, elapsed }
export function flash(color, peak, dur){ _flashes.push({ color, peak, dur, elapsed:0 }); }
export function tickFlashes(dt){
  for (let i = _flashes.length-1; i >= 0; i--){
    const f = _flashes[i]; f.elapsed += dt;
    if (f.elapsed >= f.dur) _flashes.splice(i, 1);
  }
}
export function getFlashLayers(){
  return _flashes.map(f => ({ color: f.color, alpha: f.peak * (1 - f.elapsed/f.dur) }));
}

// --- Desaturation pulse (worker:died) ---
let _desatMag = 0, _desatDur = 0, _desatElapsed = 0;
export function pulseDesat(peak, dur){ _desatMag = peak; _desatDur = dur; _desatElapsed = 0; }
export function tickDesat(dt){ if (_desatElapsed < _desatDur) _desatElapsed += dt; }
export function currentDesat(){
  return (_desatDur > 0 && _desatElapsed < _desatDur) ? _desatMag * (1 - _desatElapsed/_desatDur) : 0;
}
export function getDesatAlpha(){ return currentDesat(); }

// --- Low HP sustained vignette (polled live from G, not a timer) ---
export function lowHpAlpha(){
  if (!G.dan || G.dan.hp <= 0) return 0;
  const frac = G.dan.hp / G.dan.maxHp;
  const C = CFG.CAMERAFX;
  if (frac > C.lowHpFraction) return 0;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now()/1000 * Math.PI*2 * C.lowHpPulseHz);
  return C.lowHpVignetteMaxAlpha * pulse;
}
export function getLowHpAlpha(){ return lowHpAlpha(); }

// --- Master per-frame tick ---
export function updateCameraFx(dt){
  tickShake(dt);
  tickCleanerSick(dt);
  tickZoom(dt);
  tickFlashes(dt);
  tickDesat(dt);
}

// --- Event wiring (side effect on import) ---
on('player:died', () => {
  const C = CFG.CAMERAFX;
  shake(C.playerDiedShakeMag, C.playerDiedShakeDur);
  flash(C.playerDiedFlashColor, C.playerDiedFlashPeak, C.playerDiedFlashDur);
});

on('dustbin:detonated', ({ killCount }) => {
  const C = CFG.CAMERAFX;
  const mag = Math.min(C.dustbinDetonateShakeMax, C.dustbinDetonateShakeBase + killCount * C.dustbinDetonateShakePerKill);
  shake(mag, C.dustbinDetonateShakeDur);
  const peak = Math.min(C.dustbinDetonateFlashPeakMax, C.dustbinDetonateFlashPeakBase + killCount * C.dustbinDetonateFlashPeakPerKill);
  flash(C.dustbinDetonateFlashColor, peak, C.dustbinDetonateFlashDur);
});

on('dustbin:bounced', () => shake(CFG.CAMERAFX.dustbinBounceShakeMag, CFG.CAMERAFX.dustbinBounceShakeDur));
on('dustbin:thrown', () => shake(CFG.CAMERAFX.dustbinThrowKickMag, CFG.CAMERAFX.dustbinThrowKickDur));

on('manager:berserk_pulse', () => {
  const C = CFG.CAMERAFX;
  shake(C.managerPulseShakeMag, C.managerPulseShakeDur);
  flash(C.managerPulseFlashColor, C.managerPulseFlashPeak, C.managerPulseFlashDur);
});

on('worker:died', () => pulseDesat(CFG.CAMERAFX.workerDiedDesatPeak, CFG.CAMERAFX.workerDiedDesatDur));

on('powerup:collected', ({ kind }) => {
  const C = CFG.CAMERAFX;
  punchZoom(C.powerupPunchZoom, C.powerupPunchDur);
  flash(POWERUPS[kind].color, 0.18, C.powerupPunchDur);
});
