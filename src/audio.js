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
let sfxBus = null;     // SFX sub-bus -> master
let musicBus = null;   // music sub-bus -> master (playback wired in Phase 3)
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
  sfxBus = ctx.createGain();   sfxBus.gain.value  = CFG.AUDIO.sfxVolume;
  musicBus = ctx.createGain(); musicBus.gain.value = CFG.AUDIO.musicVolume;
  sfxBus.connect(master);
  musicBus.connect(master);
  return ctx;
}

// Resume a suspended context from inside a user gesture (autoplay policy).
let _unlocked = false;
export function unlock(){
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") c.resume();
  if (!_unlocked){
    _unlocked = true;
    // Start title music on first gesture if nothing is already playing.
    // 50ms delay lets the context resume() settle before scheduling notes.
    if (!_currentBars){
      setTimeout(() => {
        if (!_currentBars) music.playTitle();
      }, 50);
    }
  }
}

export function toggleMute(){
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : CFG.AUDIO.master;
  return muted;
}
export function isMuted(){ return muted; }

// Set master volume (0..1). If muted, the stored value is updated so unmute
// restores to the new level.
export function setMasterVolume(v){
  v = Math.max(0, Math.min(1, v));
  CFG.AUDIO.master = v;
  if (master && !muted) master.gain.value = v;
}

export function getMasterVolume(){
  return CFG.AUDIO.master;
}

export function setMusicVolume(v){
  v = Math.max(0, Math.min(1, v));
  CFG.AUDIO.musicVolume = v;
  if (musicBus && !muted) musicBus.gain.value = v;
}
export function getMusicVolume(){ return CFG.AUDIO.musicVolume; }

export function setSfxVolume(v){
  v = Math.max(0, Math.min(1, v));
  CFG.AUDIO.sfxVolume = v;
  if (sfxBus && !muted) sfxBus.gain.value = v;
}
export function getSfxVolume(){ return CFG.AUDIO.sfxVolume; }

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
// bus defaults to sfxBus; music scheduler passes musicBus.
function tone({ type = "sine", freq, freqEnd, dur, gain = 0.5, attack = 0.005, delay = 0, bus }){
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
  osc.connect(g).connect(bus || sfxBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

// A burst of white noise through a biquad filter, with a decay envelope and an
// optional filter-cutoff sweep (filtFreq -> filtEnd). Used for pops/explosions.
// bus defaults to sfxBus; music scheduler passes musicBus.
function noise({ dur, gain = 0.5, filterType = "bandpass", filtFreq = 1200, filtEnd, Q = 1, delay = 0, bus }){
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
  src.connect(filt).connect(g).connect(bus || sfxBus);
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
  g.connect(sfxBus);
  src.start(); hum.start();
  conv = { g };
}

/* =========================================================================
   Music system — scheduled bar-by-bar playback through musicBus.

   Track data format:
     { id, name, bpm, bars: [ { dur, notes: [{t, freq, dur, gain, type,
       freqEnd?, noise?, filtFreq?, Q?}] } ] }
   t = beat offset (seconds) within the bar; noise:true uses noise() not tone().
   All gains are modest (0.1–0.25) — they're scaled by musicBus.gain * master.gain.
   ========================================================================= */

const LOOKAHEAD = 0.5;   // seconds ahead to schedule notes
let _interval   = null;  // setInterval handle (100 ms tick)
let _nextBarAt  = 0;     // AudioContext time of the next bar's beat 1
let _currentBars = null; // bars array for the playing track, or null
let _barIndex   = 0;     // which bar index to schedule next
let _musicFadeEnd = 0;   // ctx.currentTime when a fade-out completes (0 = not fading)
let _isDucked   = false;
let _preDuckGain = 1.0;  // musicBus gain level before ducking

function _stopInterval(){
  if (_interval !== null){ clearInterval(_interval); _interval = null; }
}

function _scheduleBar(bar){
  for (const n of bar.notes){
    const delay = (_nextBarAt - ctx.currentTime) + n.t;
    if (delay < -0.01) continue;  // already past — skip
    if (n.noise){
      noise({ dur:n.dur, gain:n.gain, filterType:"bandpass",
              filtFreq:n.filtFreq || 1200, Q:n.Q || 1, delay, bus:musicBus });
    } else {
      tone({ type:n.type || "square", freq:n.freq, freqEnd:n.freqEnd,
             dur:n.dur, gain:n.gain, delay, bus:musicBus });
    }
  }
  _nextBarAt += bar.dur;
  _barIndex++;
}

function _tickMusic(){
  if (!ctx || !_currentBars) return;
  if (_musicFadeEnd > 0 && ctx.currentTime >= _musicFadeEnd){
    _stopInterval();
    _currentBars = null;
    return;
  }
  while (_nextBarAt < ctx.currentTime + LOOKAHEAD){
    const bar = _currentBars[_barIndex % _currentBars.length];
    _scheduleBar(bar);
  }
}

/* ---- Track definitions --------------------------------------------------- */
// BPM helpers: beat duration = 60/bpm; bar (4/4) = 4*60/bpm
// 140 BPM → bar = 1.714 s   150 BPM → 1.6 s   160 BPM → 1.5 s
// 120 BPM → 2.0 s           175 BPM → 1.371 s

// Title: "Atomic Dustbin Dan (Theme)" — 140 BPM, C major, 8-bar loop
// Square lead arpeggio + triangle bass + noise perc on beats 1 & 3.
// Bars 5-6 shift to A minor; bars 7-8 return to C major.
const BD = 60/140;  // beat dur (~0.4286 s)
const TRACK_TITLE = { id:"title", name:"Atomic Dustbin Dan (Theme)", bpm:140, bars:[
  // Bar 1 — C major: C4 E4 G4 C5 arpeggio (8th notes, 2 per beat)
  { dur:4*BD, notes:[
    {t:0*BD,    freq:261.6, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:329.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2*BD,    freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2.5*BD,  freq:329.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:261.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3.5*BD,  freq:329.6, dur:BD*0.45, gain:0.13, type:"square"},
    // Bass: C3 G3 quarter notes
    {t:0*BD,    freq:130.8, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:1*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:2*BD,    freq:130.8, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    // Perc beats 1 & 3
    {t:0*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  // Bar 2 — C major variant: starts C5 descending
  { dur:4*BD, notes:[
    {t:0*BD,    freq:523.3, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:329.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:261.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2*BD,    freq:329.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2.5*BD,  freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:523.3, dur:BD*0.45, gain:0.16, type:"square"},
    {t:3.5*BD,  freq:392.0, dur:BD*0.45, gain:0.13, type:"square"},
    {t:0*BD,    freq:130.8, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:1*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:2*BD,    freq:130.8, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:0*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  // Bar 3 — G major feel (G4 B4 D5 G4 pattern)
  { dur:4*BD, notes:[
    {t:0*BD,    freq:392.0, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:493.9, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:587.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2*BD,    freq:493.9, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2.5*BD,  freq:587.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3.5*BD,  freq:493.9, dur:BD*0.45, gain:0.13, type:"square"},
    {t:0*BD,    freq:196.0, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:1*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:2*BD,    freq:196.0, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:246.9, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:0*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  // Bar 4 — F major bridge (F4 A4 C5 F4)
  { dur:4*BD, notes:[
    {t:0*BD,    freq:349.2, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:440.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:349.2, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2*BD,    freq:440.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2.5*BD,  freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:440.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3.5*BD,  freq:392.0, dur:BD*0.45, gain:0.13, type:"square"},
    {t:0*BD,    freq:174.6, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:1*BD,    freq:130.8, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:2*BD,    freq:174.6, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:0*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  // Bar 5 — A minor B section: A4 C5 E5 A5
  { dur:4*BD, notes:[
    {t:0*BD,    freq:440.0, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:659.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:880.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2*BD,    freq:659.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2.5*BD,  freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:440.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3.5*BD,  freq:523.3, dur:BD*0.45, gain:0.13, type:"square"},
    // Bass A2 E3
    {t:0*BD,    freq:110.0, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:1*BD,    freq:165.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:2*BD,    freq:110.0, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:165.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:0*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  // Bar 6 — A minor continued: descending
  { dur:4*BD, notes:[
    {t:0*BD,    freq:880.0, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:659.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:440.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2*BD,    freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2.5*BD,  freq:440.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3.5*BD,  freq:440.0, dur:BD*0.45, gain:0.13, type:"square"},
    {t:0*BD,    freq:110.0, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:1*BD,    freq:165.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:2*BD,    freq:110.0, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:165.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:0*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  // Bar 7 — return to C major
  { dur:4*BD, notes:[
    {t:0*BD,    freq:261.6, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:329.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:523.3, dur:BD*0.45, gain:0.16, type:"square"},
    {t:2*BD,    freq:659.3, dur:BD*0.45, gain:0.17, type:"square"},
    {t:2.5*BD,  freq:523.3, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3.5*BD,  freq:329.6, dur:BD*0.45, gain:0.13, type:"square"},
    {t:0*BD,    freq:130.8, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:1*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:2*BD,    freq:130.8, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:196.0, dur:BD*0.85, gain:0.12, type:"triangle"},
    {t:0*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  // Bar 8 — C major resolution (leads back to bar 1)
  { dur:4*BD, notes:[
    {t:0*BD,    freq:523.3, dur:BD*0.45, gain:0.18, type:"square"},
    {t:0.5*BD,  freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1*BD,    freq:329.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:1.5*BD,  freq:261.6, dur:BD*0.60, gain:0.17, type:"square"},
    {t:2*BD,    freq:329.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:2.5*BD,  freq:261.6, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3*BD,    freq:392.0, dur:BD*0.45, gain:0.15, type:"square"},
    {t:3.5*BD,  freq:523.3, dur:BD*0.50, gain:0.18, type:"square"},
    {t:0*BD,    freq:130.8, dur:BD*1.85, gain:0.16, type:"triangle"},
    {t:2*BD,    freq:196.0, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:3*BD,    freq:130.8, dur:BD*0.85, gain:0.14, type:"triangle"},
    {t:0*BD,    noise:true, dur:0.06, gain:0.10, filtFreq:1200, Q:2},
    {t:2*BD,    noise:true, dur:0.06, gain:0.10, filtFreq:1200, Q:2},
  ]},
]};

// Gameplay track 1: "Bouncy Warehouse" — 150 BPM, C major, zippy
const BW = 60/150;
const T_BOUNCY = { id:"bouncy_warehouse", name:"Bouncy Warehouse", bpm:150, bars:[
  { dur:4*BW, notes:[
    {t:0*BW,    freq:261.6, dur:BW*0.42, gain:0.18, type:"square"},
    {t:0.5*BW,  freq:329.6, dur:BW*0.42, gain:0.15, type:"square"},
    {t:1*BW,    freq:392.0, dur:BW*0.42, gain:0.15, type:"square"},
    {t:1.5*BW,  freq:523.3, dur:BW*0.42, gain:0.15, type:"square"},
    {t:2*BW,    freq:392.0, dur:BW*0.42, gain:0.15, type:"square"},
    {t:2.5*BW,  freq:329.6, dur:BW*0.42, gain:0.15, type:"square"},
    {t:3*BW,    freq:261.6, dur:BW*0.42, gain:0.15, type:"square"},
    {t:3.5*BW,  freq:392.0, dur:BW*0.42, gain:0.13, type:"square"},
    {t:0*BW,    freq:130.8, dur:BW*0.82, gain:0.14, type:"triangle"},
    {t:1*BW,    freq:196.0, dur:BW*0.82, gain:0.12, type:"triangle"},
    {t:2*BW,    freq:130.8, dur:BW*0.82, gain:0.14, type:"triangle"},
    {t:3*BW,    freq:196.0, dur:BW*0.82, gain:0.12, type:"triangle"},
    {t:0*BW,    noise:true, dur:0.05, gain:0.07, filtFreq:1200, Q:2},
  ]},
  { dur:4*BW, notes:[
    {t:0*BW,    freq:523.3, dur:BW*0.42, gain:0.18, type:"square"},
    {t:0.5*BW,  freq:392.0, dur:BW*0.42, gain:0.15, type:"square"},
    {t:1*BW,    freq:329.6, dur:BW*0.42, gain:0.15, type:"square"},
    {t:1.5*BW,  freq:261.6, dur:BW*0.42, gain:0.15, type:"square"},
    {t:2*BW,    freq:329.6, dur:BW*0.42, gain:0.15, type:"square"},
    {t:2.5*BW,  freq:392.0, dur:BW*0.42, gain:0.15, type:"square"},
    {t:3*BW,    freq:261.6, dur:BW*0.42, gain:0.15, type:"square"},
    {t:3.5*BW,  freq:329.6, dur:BW*0.42, gain:0.13, type:"square"},
    {t:0*BW,    freq:196.0, dur:BW*0.82, gain:0.14, type:"triangle"},
    {t:1*BW,    freq:196.0, dur:BW*0.82, gain:0.12, type:"triangle"},
    {t:2*BW,    freq:130.8, dur:BW*0.82, gain:0.14, type:"triangle"},
    {t:3*BW,    freq:196.0, dur:BW*0.82, gain:0.12, type:"triangle"},
    {t:0*BW,    noise:true, dur:0.05, gain:0.07, filtFreq:1200, Q:2},
  ]},
]};

// Gameplay track 2: "Robot Rampage" — 160 BPM, A minor, urgent
const RR = 60/160;
const T_RAMPAGE = { id:"robot_rampage", name:"Robot Rampage", bpm:160, bars:[
  { dur:4*RR, notes:[
    // Lead sawtooth A4 C5 E5 arpeggio, beat 1 has accent
    {t:0*RR,    freq:440.0, dur:RR*0.44, gain:0.20, type:"sawtooth"},
    {t:0.5*RR,  freq:523.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:1*RR,    freq:659.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:1.5*RR,  freq:523.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:2*RR,    freq:440.0, dur:RR*0.44, gain:0.18, type:"sawtooth"},
    {t:2.5*RR,  freq:659.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:3*RR,    freq:523.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:3.5*RR,  freq:440.0, dur:RR*0.40, gain:0.13, type:"sawtooth"},
    // Countermelody triangle E4 A4 half-note alternation
    {t:0*RR,    freq:329.6, dur:RR*1.80, gain:0.10, type:"triangle"},
    {t:2*RR,    freq:440.0, dur:RR*1.80, gain:0.10, type:"triangle"},
    // Bass square A2 with G2 passing
    {t:0*RR,    freq:110.0, dur:RR*0.82, gain:0.13, type:"square"},
    {t:1*RR,    freq:98.0,  dur:RR*0.82, gain:0.11, type:"square"},
    {t:2*RR,    freq:110.0, dur:RR*0.82, gain:0.13, type:"square"},
    {t:3*RR,    freq:98.0,  dur:RR*0.82, gain:0.11, type:"square"},
    // Perc beats 1 & 3
    {t:0*RR,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*RR,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
  { dur:4*RR, notes:[
    {t:0*RR,    freq:659.3, dur:RR*0.44, gain:0.20, type:"sawtooth"},
    {t:0.5*RR,  freq:523.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:1*RR,    freq:440.0, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:1.5*RR,  freq:392.0, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:2*RR,    freq:440.0, dur:RR*0.44, gain:0.18, type:"sawtooth"},
    {t:2.5*RR,  freq:523.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:3*RR,    freq:659.3, dur:RR*0.40, gain:0.14, type:"sawtooth"},
    {t:3.5*RR,  freq:523.3, dur:RR*0.40, gain:0.13, type:"sawtooth"},
    {t:0*RR,    freq:440.0, dur:RR*1.80, gain:0.10, type:"triangle"},
    {t:2*RR,    freq:329.6, dur:RR*1.80, gain:0.10, type:"triangle"},
    {t:0*RR,    freq:110.0, dur:RR*0.82, gain:0.13, type:"square"},
    {t:1*RR,    freq:110.0, dur:RR*0.82, gain:0.11, type:"square"},
    {t:2*RR,    freq:98.0,  dur:RR*0.82, gain:0.13, type:"square"},
    {t:3*RR,    freq:110.0, dur:RR*0.82, gain:0.11, type:"square"},
    {t:0*RR,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
    {t:2*RR,    noise:true, dur:0.06, gain:0.08, filtFreq:1200, Q:2},
  ]},
]};

// Gameplay track 3: "Soap Opera" — 120 BPM, F major, slower & melodic
const SO = 60/120;
const T_SOAP = { id:"soap_opera", name:"Soap Opera", bpm:120, bars:[
  { dur:4*SO, notes:[
    // Lead triangle longer notes F4 A4 C5
    {t:0*SO,    freq:349.2, dur:SO*0.88, gain:0.16, type:"triangle"},
    {t:1*SO,    freq:440.0, dur:SO*0.88, gain:0.14, type:"triangle"},
    {t:2*SO,    freq:523.3, dur:SO*0.88, gain:0.14, type:"triangle"},
    {t:3*SO,    freq:440.0, dur:SO*0.88, gain:0.13, type:"triangle"},
    // Bass square staccato F2 C3 eighth-note bounce
    {t:0*SO,    freq:87.3,  dur:SO*0.38, gain:0.15, type:"square"},
    {t:0.5*SO,  freq:130.8, dur:SO*0.38, gain:0.13, type:"square"},
    {t:1*SO,    freq:87.3,  dur:SO*0.38, gain:0.15, type:"square"},
    {t:1.5*SO,  freq:130.8, dur:SO*0.38, gain:0.13, type:"square"},
    {t:2*SO,    freq:87.3,  dur:SO*0.38, gain:0.15, type:"square"},
    {t:2.5*SO,  freq:130.8, dur:SO*0.38, gain:0.13, type:"square"},
    {t:3*SO,    freq:87.3,  dur:SO*0.38, gain:0.15, type:"square"},
    {t:3.5*SO,  freq:130.8, dur:SO*0.38, gain:0.13, type:"square"},
  ]},
  { dur:4*SO, notes:[
    {t:0*SO,    freq:523.3, dur:SO*0.88, gain:0.16, type:"triangle"},
    {t:1*SO,    freq:440.0, dur:SO*0.88, gain:0.14, type:"triangle"},
    {t:2*SO,    freq:349.2, dur:SO*1.80, gain:0.16, type:"triangle"},
    {t:0*SO,    freq:130.8, dur:SO*0.38, gain:0.15, type:"square"},
    {t:0.5*SO,  freq:87.3,  dur:SO*0.38, gain:0.13, type:"square"},
    {t:1*SO,    freq:130.8, dur:SO*0.38, gain:0.15, type:"square"},
    {t:1.5*SO,  freq:87.3,  dur:SO*0.38, gain:0.13, type:"square"},
    {t:2*SO,    freq:174.6, dur:SO*0.38, gain:0.15, type:"square"},
    {t:2.5*SO,  freq:130.8, dur:SO*0.38, gain:0.13, type:"square"},
    {t:3*SO,    freq:87.3,  dur:SO*0.38, gain:0.15, type:"square"},
    {t:3.5*SO,  freq:130.8, dur:SO*0.38, gain:0.13, type:"square"},
  ]},
]};

// Gameplay track 4: "Conveyor Blues" — 140 BPM, G major/blues, offbeat perc
const CB = 60/140;
const T_BLUES = { id:"conveyor_blues", name:"Conveyor Blues", bpm:140, bars:[
  { dur:4*CB, notes:[
    // Lead: G4 Bb4 C5 D5 bluesy figure
    {t:0*CB,    freq:392.0, dur:CB*0.44, gain:0.17, type:"square"},
    {t:0.5*CB,  freq:466.2, dur:CB*0.44, gain:0.15, type:"square"},
    {t:1*CB,    freq:523.3, dur:CB*0.44, gain:0.15, type:"square"},
    {t:1.5*CB,  freq:587.3, dur:CB*0.44, gain:0.15, type:"square"},
    {t:2*CB,    freq:523.3, dur:CB*0.44, gain:0.15, type:"square"},
    {t:2.5*CB,  freq:466.2, dur:CB*0.44, gain:0.14, type:"square"},
    {t:3*CB,    freq:392.0, dur:CB*0.44, gain:0.15, type:"square"},
    {t:3.5*CB,  freq:466.2, dur:CB*0.44, gain:0.13, type:"square"},
    // Bass triangle walking G2 D3 F3
    {t:0*CB,    freq:98.0,  dur:CB*0.82, gain:0.13, type:"triangle"},
    {t:1*CB,    freq:147.0, dur:CB*0.82, gain:0.11, type:"triangle"},
    {t:2*CB,    freq:174.6, dur:CB*0.82, gain:0.12, type:"triangle"},
    {t:3*CB,    freq:147.0, dur:CB*0.82, gain:0.11, type:"triangle"},
    // Offbeat perc beats 2 & 4
    {t:1*CB,    noise:true, dur:0.06, gain:0.07, filtFreq:1200, Q:2},
    {t:3*CB,    noise:true, dur:0.06, gain:0.07, filtFreq:1200, Q:2},
  ]},
  { dur:4*CB, notes:[
    {t:0*CB,    freq:587.3, dur:CB*0.44, gain:0.17, type:"square"},
    {t:0.5*CB,  freq:523.3, dur:CB*0.44, gain:0.15, type:"square"},
    {t:1*CB,    freq:466.2, dur:CB*0.44, gain:0.15, type:"square"},
    {t:1.5*CB,  freq:392.0, dur:CB*0.60, gain:0.16, type:"square"},
    {t:2.5*CB,  freq:466.2, dur:CB*0.44, gain:0.14, type:"square"},
    {t:3*CB,    freq:523.3, dur:CB*0.44, gain:0.15, type:"square"},
    {t:3.5*CB,  freq:392.0, dur:CB*0.44, gain:0.13, type:"square"},
    {t:0*CB,    freq:98.0,  dur:CB*0.82, gain:0.13, type:"triangle"},
    {t:1*CB,    freq:98.0,  dur:CB*0.82, gain:0.11, type:"triangle"},
    {t:2*CB,    freq:147.0, dur:CB*0.82, gain:0.12, type:"triangle"},
    {t:3*CB,    freq:98.0,  dur:CB*0.82, gain:0.11, type:"triangle"},
    {t:1*CB,    noise:true, dur:0.06, gain:0.07, filtFreq:1200, Q:2},
    {t:3*CB,    noise:true, dur:0.06, gain:0.07, filtFreq:1200, Q:2},
  ]},
]};

// Gameplay track 5: "Overtime Mania" — 175 BPM, D major, densest
const OM = 60/175;
const T_MANIA = { id:"overtime_mania", name:"Overtime Mania", bpm:175, bars:[
  { dur:4*OM, notes:[
    // 16th-note D4 F#4 A4 D5 arpeggios (4 per beat)
    {t:0*OM,     freq:293.7, dur:OM*0.22, gain:0.17, type:"square"},
    {t:0.25*OM,  freq:370.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:0.5*OM,   freq:440.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:0.75*OM,  freq:587.3, dur:OM*0.22, gain:0.14, type:"square"},
    {t:1*OM,     freq:440.0, dur:OM*0.22, gain:0.15, type:"square"},
    {t:1.25*OM,  freq:370.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:1.5*OM,   freq:293.7, dur:OM*0.22, gain:0.14, type:"square"},
    {t:1.75*OM,  freq:370.0, dur:OM*0.22, gain:0.13, type:"square"},
    {t:2*OM,     freq:440.0, dur:OM*0.22, gain:0.17, type:"square"},
    {t:2.25*OM,  freq:587.3, dur:OM*0.22, gain:0.14, type:"square"},
    {t:2.5*OM,   freq:440.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:2.75*OM,  freq:370.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:3*OM,     freq:293.7, dur:OM*0.22, gain:0.15, type:"square"},
    {t:3.25*OM,  freq:440.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:3.5*OM,   freq:587.3, dur:OM*0.22, gain:0.14, type:"square"},
    {t:3.75*OM,  freq:440.0, dur:OM*0.22, gain:0.13, type:"square"},
    // Bass sawtooth D2 beat 1, A2 beat 3
    {t:0*OM,     freq:73.4,  dur:OM*0.82, gain:0.14, type:"sawtooth"},
    {t:1*OM,     freq:73.4,  dur:OM*0.82, gain:0.12, type:"sawtooth"},
    {t:2*OM,     freq:110.0, dur:OM*0.82, gain:0.14, type:"sawtooth"},
    {t:3*OM,     freq:110.0, dur:OM*0.82, gain:0.12, type:"sawtooth"},
    // Tight perc every beat
    {t:0*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
    {t:1*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
    {t:2*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
    {t:3*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
  ]},
  { dur:4*OM, notes:[
    {t:0*OM,     freq:587.3, dur:OM*0.22, gain:0.17, type:"square"},
    {t:0.25*OM,  freq:440.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:0.5*OM,   freq:370.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:0.75*OM,  freq:293.7, dur:OM*0.22, gain:0.14, type:"square"},
    {t:1*OM,     freq:370.0, dur:OM*0.22, gain:0.15, type:"square"},
    {t:1.25*OM,  freq:440.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:1.5*OM,   freq:587.3, dur:OM*0.22, gain:0.14, type:"square"},
    {t:1.75*OM,  freq:440.0, dur:OM*0.22, gain:0.13, type:"square"},
    {t:2*OM,     freq:293.7, dur:OM*0.22, gain:0.17, type:"square"},
    {t:2.25*OM,  freq:370.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:2.5*OM,   freq:440.0, dur:OM*0.22, gain:0.14, type:"square"},
    {t:2.75*OM,  freq:587.3, dur:OM*0.22, gain:0.14, type:"square"},
    {t:3*OM,     freq:440.0, dur:OM*0.22, gain:0.15, type:"square"},
    {t:3.25*OM,  freq:587.3, dur:OM*0.22, gain:0.14, type:"square"},
    {t:3.5*OM,   freq:293.7, dur:OM*0.22, gain:0.14, type:"square"},
    {t:3.75*OM,  freq:587.3, dur:OM*0.22, gain:0.13, type:"square"},
    {t:0*OM,     freq:73.4,  dur:OM*0.82, gain:0.14, type:"sawtooth"},
    {t:1*OM,     freq:110.0, dur:OM*0.82, gain:0.12, type:"sawtooth"},
    {t:2*OM,     freq:73.4,  dur:OM*0.82, gain:0.14, type:"sawtooth"},
    {t:3*OM,     freq:110.0, dur:OM*0.82, gain:0.12, type:"sawtooth"},
    {t:0*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
    {t:1*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
    {t:2*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
    {t:3*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
  ]},
]};

// Ordered gameplay track list (rotation order: index 0..4 cycling)
const TRACKS = [T_BOUNCY, T_RAMPAGE, T_SOAP, T_BLUES, T_MANIA];

/* ---- music export -------------------------------------------------------- */

export const music = {

  TRACKS,   // exported so playlists.js can validate "music" field track ids

  playTitle(){
    if (!ensure()) return;
    _stopInterval();
    _currentBars = TRACK_TITLE.bars;
    _barIndex = 0;
    _nextBarAt = ctx.currentTime + 0.05;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.value = CFG.AUDIO.musicVolume;
    _musicFadeEnd = 0;
    _isDucked = false;
    _interval = setInterval(_tickMusic, 100);
    _tickMusic();
  },

  // id = track id string or null; fallbackIndex used when id is null
  playGameplay(id, fallbackIndex = 0){
    if (!ensure()) return;
    _stopInterval();
    const track = (id ? TRACKS.find(t => t.id === id) : null)
                  || TRACKS[fallbackIndex % TRACKS.length];
    _currentBars = track.bars;
    _barIndex = 0;
    _nextBarAt = ctx.currentTime + 0.05;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.value = CFG.AUDIO.musicVolume;
    _musicFadeEnd = 0;
    _isDucked = false;
    _interval = setInterval(_tickMusic, 100);
    // No synchronous _tickMusic() here — context may still be suspended
    // (currentTime=0), so let the interval handle the first tick 100ms later.
  },

  stop(){
    _stopInterval();
    _currentBars = null;
    if (musicBus && ctx){
      const t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.value = CFG.AUDIO.musicVolume;
    }
    _musicFadeEnd = 0;
    _isDucked = false;
  },

  fadeOut(secs){
    if (!ctx || !musicBus) return;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(0, t + secs);
    _musicFadeEnd = t + secs;
  },

  duck(){
    if (!ctx || !musicBus || _isDucked) return;
    _isDucked = true;
    _preDuckGain = CFG.AUDIO.musicVolume;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(_preDuckGain * 0.4, t, 0.05);
  },

  unduck(){
    if (!ctx || !musicBus || !_isDucked) return;
    _isDucked = false;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(_preDuckGain, t, 0.05);
  },
};

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

  // Achievement unlocked / weekly progress — a short, bright ascending two-tone
  // blip. Deliberately distinct from `rescue` (triangle up-blip): this is a
  // crisper square pair climbing a perfect fifth, signalling a meta reward
  // rather than an in-world rescue.
  achievement(){ if (!ensure()) return;
    sequence([{freq:784,dur:0.07},{freq:1175,dur:0.13}], { type:"square", gain:0.18, gap:0.02 }); },

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
