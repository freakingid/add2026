/* =========================================================================
   audio.js — retro arcade SFX, synthesized live via the Web Audio API (GDD §10).

   A cross-cutting leaf (like effects.js): no game state, no game imports beyond
   CFG. Every gameplay event calls one of the named `sfx.*` methods; each method
   builds its own oscillator/noise + gain-envelope graph and is fire-and-forget
   (nodes stop themselves and disconnect on `ended`).

   Browser autoplay policy starts the AudioContext suspended, so `unlock()` is
   called from the first user gesture in input.js. `toggleMute()` is bound to the
   M key. A small per-sound throttle keeps high-frequency events (shoot, pop)
   from stacking into clipping.
   ========================================================================= */
import { CFG } from "./config.js";

let ctx = null;        // created lazily on first sound / first unlock gesture
let master = null;     // global gain node -> destination (volume + mute)
let muted = !CFG.AUDIO.enabled;

// Per-sound min interval (sec) so rapid events don't pile up into noise.
const THROTTLE = { shoot: 0.05, pop: 0.04, enemyFire: 0.05, hurt: 0.12 };
const lastAt = {};

// Lazily build the context + master bus. Returns null if Web Audio is missing.
function ensure(){
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : CFG.AUDIO.master;
  master.connect(ctx.destination);
  return ctx;
}

// Resume a suspended context from inside a user gesture (autoplay policy).
export function unlock(){
  const c = ensure();
  if (c && c.state === "suspended") c.resume();
}

export function toggleMute(){
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : CFG.AUDIO.master;
  return muted;
}
export function isMuted(){ return muted; }

// Gate a named sound by its throttle window. Returns false if it fired too
// recently. Sounds without a THROTTLE entry are never gated.
function allow(name){
  const min = THROTTLE[name];
  if (!min) return true;
  const t = ctx.currentTime;
  if (lastAt[name] !== undefined && t - lastAt[name] < min) return false;
  lastAt[name] = t;
  return true;
}

/* ---- Synthesis helpers --------------------------------------------------- */

// One oscillator voice with an attack/decay gain envelope and an optional pitch
// sweep (freq -> freqEnd). All times are seconds; gain is the peak level.
function tone({ type = "sine", freq, freqEnd, dur, gain = 0.5, attack = 0.005, delay = 0 }){
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined && freqEnd !== freq){
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

// A burst of white noise through a biquad filter, with a decay envelope and an
// optional filter-cutoff sweep (filtFreq -> filtEnd). Used for pops/explosions.
function noise({ dur, gain = 0.5, filterType = "bandpass", filtFreq = 1200, filtEnd, Q = 1, delay = 0 }){
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.setValueAtTime(filtFreq, t0);
  filt.Q.value = Q;
  if (filtEnd !== undefined && filtEnd !== filtFreq){
    filt.frequency.exponentialRampToValueAtTime(Math.max(1, filtEnd), t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  src.onended = () => { src.disconnect(); filt.disconnect(); g.disconnect(); };
}

// A sequence of tones (a little jingle). notes = [{freq,dur,gain,type}], played
// back to back from `now`.
function sequence(notes, { type = "sine", gain = 0.5, gap = 0 } = {}){
  let delay = 0;
  for (const n of notes){
    tone({ type: n.type || type, freq: n.freq, freqEnd: n.freqEnd, dur: n.dur, gain: n.gain || gain, delay });
    delay += n.dur + gap;
  }
}

/* ---- Looping conveyor hum (managed voice) -------------------------------- */
// Unlike the one-shot sounds above, the conveyor belt is a SUSTAINED ambience: a
// single persistent voice (looping filtered noise rumble + a low mechanical hum)
// built once and left running, with only its gain fading in/out as Dan steps on /
// off a belt. It connects through `master`, so the M mute still silences it.
let conv = null;          // { g } persistent nodes, or null until first built
let convOn = false;       // current target state (so we only ramp on a change)
const CONV_GAIN = 0.10;   // hum level when fully on (kept low — it's a background bed)

function buildConveyor(){
  // Looping low-frequency noise bed for the belt rumble.
  const dur = 1.0;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass"; filt.frequency.value = 360; filt.Q.value = 0.7;
  // A low sawtooth gives the rumble a mechanical, motorised edge.
  const hum = ctx.createOscillator();
  hum.type = "sawtooth"; hum.frequency.value = 56;
  const humFilt = ctx.createBiquadFilter();
  humFilt.type = "lowpass"; humFilt.frequency.value = 180;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(filt).connect(g);
  hum.connect(humFilt).connect(g);
  g.connect(master);
  src.start(); hum.start();
  conv = { g };
}

/* ---- Sound library ------------------------------------------------------- */
/* Each method is a one-call event sound. Synthesis notes inline. All guard on a
   live context and (where listed) a throttle window. */
export const sfx = {
  // Dan fires a soap volley — soft triangle "bloop", quick down-sweep, low gain
  // (fires constantly). One call per trigger, not per pellet.
  shoot(){ if (!ensure() || !allow("shoot")) return;
    tone({ type:"triangle", freq:300, freqEnd:170, dur:0.09, gain:0.18 }); },

  // Soap bubble pops on a robot — wet bandpass noise burst + a tiny pitch blip.
  pop(){ if (!ensure() || !allow("pop")) return;
    noise({ dur:0.09, gain:0.3, filterType:"bandpass", filtFreq:1800, filtEnd:600, Q:1.2 });
    tone({ type:"sine", freq:520, freqEnd:240, dur:0.08, gain:0.16 }); },

  // Soap hits a Dispatch Terminal — duller metallic tick (lower bandpass + thunk).
  terminalHit(){ if (!ensure()) return;
    noise({ dur:0.07, gain:0.22, filterType:"bandpass", filtFreq:900, filtEnd:400, Q:1.5 });
    tone({ type:"square", freq:180, freqEnd:120, dur:0.07, gain:0.14 }); },

  // A robot is destroyed — descending square "power-down" + a noise tick.
  enemyDie(){ if (!ensure()) return;
    tone({ type:"square", freq:400, freqEnd:110, dur:0.22, gain:0.2 });
    noise({ dur:0.12, gain:0.15, filterType:"lowpass", filtFreq:1400, filtEnd:300 }); },

  // A terminal is destroyed — bigger mid explosion: lowpassed noise + low boom.
  terminalDie(){ if (!ensure()) return;
    noise({ dur:0.3, gain:0.32, filterType:"lowpass", filtFreq:1600, filtEnd:200, Q:0.7 });
    tone({ type:"sine", freq:140, freqEnd:55, dur:0.32, gain:0.26 });
    tone({ type:"square", freq:220, freqEnd:80, dur:0.2, gain:0.1 }); },

  // Dan takes damage — harsh sawtooth down-buzz "ow".
  hurt(){ if (!ensure() || !allow("hurt")) return;
    tone({ type:"sawtooth", freq:200, freqEnd:70, dur:0.16, gain:0.28 }); },

  // A robot fires a ranged attack — thin, dry sawtooth "zap".
  enemyFire(){ if (!ensure() || !allow("enemyFire")) return;
    tone({ type:"sawtooth", freq:620, freqEnd:430, dur:0.07, gain:0.14 }); },

  // Scanner begins broadcasting its alarm — two-tone square klaxon (edge-fired).
  alarm(){ if (!ensure()) return;
    tone({ type:"square", freq:660, dur:0.16, gain:0.2, delay:0 });
    tone({ type:"square", freq:440, dur:0.16, gain:0.2, delay:0.16 });
    tone({ type:"square", freq:660, dur:0.16, gain:0.2, delay:0.32 }); },

  // Atomic Dustbin detonation — long lowpassed noise blast + a low sine boom.
  detonate(){ if (!ensure()) return;
    noise({ dur:0.6, gain:0.4, filterType:"lowpass", filtFreq:1800, filtEnd:120, Q:0.6 });
    tone({ type:"sine", freq:80, freqEnd:38, dur:0.6, gain:0.4 });
    tone({ type:"square", freq:160, freqEnd:50, dur:0.4, gain:0.14 }); },

  // Dustbin deployed/thrown — short rising whoosh (filtered noise sweep up).
  deploy(){ if (!ensure()) return;
    noise({ dur:0.2, gain:0.22, filterType:"bandpass", filtFreq:300, filtEnd:1600, Q:0.8 });
    tone({ type:"sine", freq:200, freqEnd:520, dur:0.2, gain:0.12 }); },

  // Power-up collected — bright 3-note ascending arpeggio.
  powerup(){ if (!ensure()) return;
    sequence([{freq:523,dur:0.08},{freq:659,dur:0.08},{freq:880,dur:0.12}], { type:"square", gain:0.18 }); },

  // Vending heal — warm 2-note ascending chime (softer than the power-up).
  heal(){ if (!ensure()) return;
    sequence([{freq:440,dur:0.1},{freq:660,dur:0.16}], { type:"sine", gain:0.22 }); },

  // Worker rescued — happy up-blip; pitch rises with each rescue this level
  // (step = G.rescued count, 0-based), reinforcing the escalating score.
  rescue(step = 0){ if (!ensure()) return;
    const base = 523 * Math.pow(2, Math.min(step, 5) / 12 * 2);  // ~whole-step climb
    sequence([{freq:base,dur:0.07},{freq:base*1.5,dur:0.12}], { type:"triangle", gain:0.2 }); },

  // Worker lost to an Inventory Bot — a dramatic, alarming death sting, much
  // bigger than a generic hit so the loss is unmistakable. A heavy low-thud
  // impact, an alarming two-tone descending klaxon (sawtooth, falling in pitch),
  // and a sustained low sub-boom underneath. Rare one-shot — NOT throttled, so it
  // always plays in full (no THROTTLE entry; the long tail won't clip rapid fire).
  workerLost(){ if (!ensure()) return;
    // Impact: a dull, filtered noise thud the moment the worker drops.
    noise({ dur:0.35, gain:0.34, filterType:"lowpass", filtFreq:1200, filtEnd:120, Q:0.7 });
    // Descending klaxon — two harsh sawtooth wails sweeping downward.
    tone({ type:"sawtooth", freq:330, freqEnd:120, dur:0.45, gain:0.30, delay:0.04 });
    tone({ type:"sawtooth", freq:247, freqEnd:90,  dur:0.55, gain:0.26, delay:0.30 });
    // Low sub-boom under it all for weight and menace.
    tone({ type:"sine", freq:130, freqEnd:48, dur:0.85, gain:0.30, delay:0.04 }); },

  // The LAST human worker has left the level (rescued or killed) — a hollow,
  // final descending motif: there's no one left to save. Sparse, somber sine
  // line over a low drone; deliberately distinct from the bright `rescue` blip,
  // the dramatic `workerLost` death sting, and the sawtooth `gameOver`. One-shot,
  // never throttled.
  noWorkers(){ if (!ensure()) return;
    sequence([{freq:330,dur:0.18},{freq:262,dur:0.18},{freq:196,dur:0.5}],
      { type:"sine", gain:0.22, gap:0.06 });
    tone({ type:"triangle", freq:110, freqEnd:55, dur:0.95, gain:0.15 }); },

  // Level cleared — 4-note ascending victory jingle.
  levelClear(){ if (!ensure()) return;
    sequence([{freq:523,dur:0.11},{freq:659,dur:0.11},{freq:784,dur:0.11},{freq:1047,dur:0.2}],
      { type:"square", gain:0.2 }); },

  // Game over — slow descending minor-ish motif.
  gameOver(){ if (!ensure()) return;
    sequence([{freq:440,dur:0.18},{freq:349,dur:0.18},{freq:262,dur:0.34}],
      { type:"sawtooth", gain:0.2 }); },

  // Conveyor belt hum — a SUSTAINED looping voice, not a one-shot. Call every frame
  // with whether Dan is on a belt; it fades the hum in when he steps on and out when
  // he steps off. Idempotent: re-ramps only on a state change, so per-frame calls are
  // cheap. Built lazily on the first call (after a user gesture has unlocked audio).
  conveyor(active){ if (!ensure()) return;
    if (!conv) buildConveyor();
    if (active === convOn) return;                 // no change -> don't reschedule
    convOn = active;
    const t = ctx.currentTime;
    conv.g.gain.cancelScheduledValues(t);
    // setTargetAtTime smoothly approaches the target without needing the live value.
    conv.g.gain.setTargetAtTime(active ? CONV_GAIN : 0, t, active ? 0.05 : 0.12);
  },
};
