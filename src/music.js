/* =========================================================================
   music.js — scheduled bar-by-bar music playback through musicBus.

   Extracted from audio.js to keep both files under the 24 KB convention.
   Imports tone/noise synthesis helpers and getCtx/getMusicBus accessors
   from audio.js (which is itself a leaf — no game state imports).

   Track data format:
     { id, name, bpm, bars: [ { dur, notes: [{t, freq, dur, gain, type,
       freqEnd?, noise?, filtFreq?, Q?}] } ] }
   t = beat offset (seconds) within the bar; noise:true uses noise() not tone().
   All gains are modest (0.07–0.25) — scaled by musicBus.gain * master.gain.
   ========================================================================= */
import { tone, noise, getCtx, getMusicBus } from "./audio.js";
import { CFG } from "./config.js";

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
  const ctx = getCtx();
  const musicBus = getMusicBus();
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
  const ctx = getCtx();
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
export const TRACKS = [T_BOUNCY, T_RAMPAGE, T_SOAP, T_BLUES, T_MANIA];

/* ---- music export -------------------------------------------------------- */

export const music = {

  TRACKS,   // exported so playlists.js can validate "music" field track ids

  playTitle(){
    const ctx = getCtx();
    const musicBus = getMusicBus();
    if (!ctx || !musicBus) return;
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
    const ctx = getCtx();
    const musicBus = getMusicBus();
    if (!ctx || !musicBus) return;
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
    const ctx = getCtx();
    const musicBus = getMusicBus();
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
    const ctx = getCtx();
    const musicBus = getMusicBus();
    if (!ctx || !musicBus) return;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(0, t + secs);
    _musicFadeEnd = t + secs;
  },

  duck(){
    const ctx = getCtx();
    const musicBus = getMusicBus();
    if (!ctx || !musicBus || _isDucked) return;
    _isDucked = true;
    _preDuckGain = CFG.AUDIO.musicVolume;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(_preDuckGain * 0.4, t, 0.05);
  },

  unduck(){
    const ctx = getCtx();
    const musicBus = getMusicBus();
    if (!ctx || !musicBus || !_isDucked) return;
    _isDucked = false;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(_preDuckGain, t, 0.05);
  },

  isPlaying(){ return _currentBars !== null; },
};
