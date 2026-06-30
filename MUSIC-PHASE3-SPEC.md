# Music Phase 3 Spec — Longer Tracks, Bassoon Voice, Arriving Choruses

## Goal (from playtesting feedback)
The Phase 2 tracks (5 bars: verse-verse-fill-chorus-chorus) still felt
repetitive too soon, and the chorus "blended in" rather than announcing
itself. Phase 3 fixes both, and adds a new woody "bassoon" voice to the two
moody tracks. All five arrangements below were auditioned and approved.

Three changes:
1. **~1.8x length.** Each gameplay track goes from 5 bars to **9 bars**:
   3 verse → 1 fill → **4-bar chorus section** → 1 return. The chorus is now a
   real section, not a 2-bar blip.
2. **Choruses that arrive.** Each chorus gets a *texture* lever (not a volume
   lift) so you clearly notice entering it — see per-track assignment below.
3. **Bassoon voice** on the two moody tracks (`robot_rampage`,
   `conveyor_blues`): a custom-waveform woody counter-line under the verses.

`TRACK_TITLE` is unchanged. The scheduler (`_tickMusic`, look-ahead,
`_barIndex % bars.length`) needs **no changes** — it already loops any bar
count. Auto-rotation, ducking, fade-out, playlists: all untouched.

## Chorus-arrival assignment (one treatment per track)
- `robot_rampage` → **pad swell** (sustained low lowpass-sawtooth under the arp)
- `conveyor_blues` → **pad swell**
- `soap_opera` → **bright counter** (high triangle sparkle line, no perc — it's gentle)
- `bouncy_warehouse` → **the works** (octave-jumped lead + pad + bright counter + perc)
- `overtime_mania` → **the works**

## Files
- Track data + scheduler live in `src/music.js` (confirmed: the Phase 1 split
  landed; tempo consts `BW/RR/SO/CB/OM` are there; `tone`/`noise` are imported
  from `audio.js`).
- The synthesis primitive `tone()` lives in `src/audio.js` and is exported.

---

## Phase 3a — extend `tone()` in `src/audio.js`

Two new optional capabilities are needed, both used by the new note data:
a **bassoon** voice (custom `PeriodicWave`) and an optional **per-note filter**
(for the chorus pad) plus an optional **`hold`** (sustain fraction, so pads and
bassoon notes hold instead of decaying immediately). All three are **opt-in**;
notes without them render exactly as today.

Add a cached bassoon wave near the top of `audio.js` (after `ensure()` is fine):

```js
let _bassoonWave = null;
// Reedy/woody PeriodicWave: weak fundamental, strong 2nd–4th harmonics.
function bassoonWave(){
  if (_bassoonWave) return _bassoonWave;
  const imag = new Float32Array([0,0.30,1.00,0.85,0.62,0.45,0.30,0.20,0.13,0.09,0.06]);
  const real = new Float32Array(imag.length);
  _bassoonWave = ctx.createPeriodicWave(real, imag, { disableNormalization:false });
  return _bassoonWave;
}
```

Then extend `tone()` (current signature ends `..., delay = 0, bus }`):

```js
export function tone({ type = "sine", freq, freqEnd, dur, gain = 0.5,
                       attack = 0.005, delay = 0, bus, filt, hold }){
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  if (type === "bassoon") osc.setPeriodicWave(bassoonWave());
  else osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined && freqEnd !== freq){
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  if (hold !== undefined){                       // sustain at full before release
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur * hold));
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // Optional per-note biquad (pad lowpass); bassoon gets a default lowpass.
  const fspec = filt || (type === "bassoon" ? { type:"lowpass", freq:2600, Q:0.6 } : null);
  let bq = null;
  if (fspec){
    bq = ctx.createBiquadFilter();
    bq.type = fspec.type; bq.frequency.value = fspec.freq;
    if (fspec.Q != null) bq.Q.value = fspec.Q;
    osc.connect(bq).connect(g);
  } else {
    osc.connect(g);
  }
  g.connect(bus || sfxBus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => { osc.disconnect(); if (bq) bq.disconnect(); g.disconnect(); };
}
```

**Watch for:** the default-behavior path must be unchanged — a note with no
`filt`/`hold` and a standard `type` connects `osc -> g -> bus` and decays
exactly as before. Verify by ear that existing SFX (which call `tone()`) are
unaffected.

## Phase 3b — pass new fields through `_scheduleBar` in `src/music.js`

The bar scheduler currently forwards `type/freq/freqEnd/dur/gain`. Add `filt`
and `hold` to the `tone()` call (the `noise()` branch is unchanged):

```js
tone({ type:n.type || "square", freq:n.freq, freqEnd:n.freqEnd,
       dur:n.dur, gain:n.gain, delay, bus:musicBus,
       filt:n.filt, hold:n.hold });
```

## Phase 3c — replace all five track `bars:[...]` arrays in `src/music.js`

Replace the `bars:[...]` array of each of `T_BOUNCY`, `T_RAMPAGE`, `T_SOAP`,
`T_BLUES`, `T_MANIA` with the 9-bar versions in **`phase3-bars.js`** (same
folder as this spec). The `id`/`name`/`bpm` lines and the tempo consts
(`BW/RR/SO/CB/OM`) are unchanged — only the bars change.

> Note: unlike Phase 2, the chorus bars here are **intentionally new** (rebuilt
> with the arrival treatment) — do NOT try to preserve the old chorus bars
> byte-for-byte. The whole point of Phase 3 is that the chorus changed.

## Phase 3d — smoke test (`test-input.js`, pure math, no canvas)

```js
import { TRACKS } from "./music.js";
for (const t of TRACKS) {
  console.assert(t.bars.length === 9, `${t.id}: expected 9 bars, got ${t.bars.length}`);
  for (const [i, bar] of t.bars.entries()) {
    for (const n of bar.notes) {
      const end = n.t + n.dur;
      console.assert(end <= bar.dur + 0.02, `${t.id} bar ${i+1}: note overruns bar`);
      console.assert(n.gain >= 0.04 && n.gain <= 0.25, `${t.id} bar ${i+1}: gain ${n.gain} out of range`);
      if (n.type === "bassoon") console.assert(n.hold !== undefined, `${t.id}: bassoon note missing hold`);
    }
  }
}
console.log("Phase 3 music validation passed.");
```

## Manual verification
Play each level (auto-rotation cycles all five, or trigger manually). For each:
- It runs ~9 bars before repeating — noticeably longer than before.
- Rampage & Blues: the bassoon counter is audibly woody/distinct under the verses.
- The chorus *arrives* — you can tell the moment it starts (pad swell / sparkle /
  the works, depending on track).
- No clicks or dead air at bar boundaries or the loop point (end of bar 9 → bar 1).

## Non-goals
- No scheduler/duck/fade/playlist/autoplay changes.
- No new files; data goes into existing `music.js`, the helper into `audio.js`.
- `TRACK_TITLE` unchanged.