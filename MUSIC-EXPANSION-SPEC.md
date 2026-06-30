# Music Expansion Spec — Gameplay Tracks 4x Length + Verse/Chorus

## Goal
Extend the 5 gameplay tracks (`bouncy_warehouse`, `robot_rampage`, `soap_opera`,
`conveyor_blues`, `overtime_mania`) from their current 2-bar loops to a
verse/chorus structure with more variety. `TRACK_TITLE` is unchanged (already
8 bars with a key change — it's a menu loop, not gameplay music that needs to
sustain interest across a level).

## Structure decision
Each track becomes: **2 verse bars → 1 fill bar → 2 chorus bars** (the chorus
bars are the *existing* 2 bars, unchanged) = **5 bars total**, looping via the
existing `_barIndex % bars.length` — no scheduler changes needed.

This isn't a flat 4x (8 bars) because forcing every track to exactly 8 bars
would mean padding some with filler. 5 bars at the same tempo is already
~2.5x real-time length per loop, and the verse/chorus *contrast* (sparse →
full) does more for perceived variety than raw duration would. If you want
closer to a literal 4x after hearing this, the easy follow-up is doubling the
chorus (repeat the 2 chorus bars with a melodic variant on the repeat) — flagged
as a Phase 3 option below rather than committed up front.

Verse bars are deliberately thinner (fewer simultaneous notes, no/sparse
percussion, lower gains) so the existing chorus bars read as a genuine
"drop" when they hit — that contrast is the main lever for "more interest"
within the existing synthesis-only constraint (per STATUS-AUDIO.md, no
samples/assets).

## Phase 0 — split audio.js into music.js (do this first)
`audio.js` is currently 816 lines / ~40KB, already over the 24KB convention
threshold. Adding ~3x more bar data makes this worse. Before adding new
content:

- Create `src/music.js` containing: the music data format comment, `LOOKAHEAD`,
  all `_*` scheduler state and functions (`_stopInterval`, `_scheduleBar`,
  `_tickMusic`), `TRACK_TITLE`, all 5 `T_*` track consts, `TRACKS`, and the
  exported `music` object (`playTitle`, `playGameplay`, `stop`, `fadeOut`,
  `duck`, `unduck`).
- `music.js` needs `tone` and `noise` from audio.js (both take a `bus` param
  already) — export them from `audio.js` (they're currently unexported
  module-private functions) and import in `music.js`.
- `music.js` also needs `ctx`, `musicBus` — these are audio.js module state.
  Simplest path: export small accessor functions from audio.js (`getCtx()`,
  `getMusicBus()`) rather than exporting the mutable bindings directly (ES
  modules can't reassign an imported binding, and `ctx`/`musicBus` are
  lazily created in `ensure()`).
- `audio.js` re-exports `music` from `music.js` so every other module's
  `import { music } from "./audio.js"` keeps working unchanged — **zero
  call-site changes** anywhere else in the codebase.
- Smoke test: grep every file importing `{ music }` from `"./audio.js"` and
  confirm the re-export satisfies it; run the game, confirm title music still
  plays on first gesture and a gameplay track still rotates correctly.

## Phase 1 — write the new bars (data only, no logic changes)

For each track below: 2 verse bars + 1 fill bar are **new**; the 2 chorus
bars are **copied verbatim** from the current file (do not edit them — just
relocate into the new array shape). Tempo constants (`BW`, `RR`, `SO`, `CB`,
`OM`) are unchanged and reused.

### 1. `bouncy_warehouse` (150 BPM, C major)
Verse: lead drops to triangle, quarter notes only, perc removed, bass thinned
to root-only on beats 1 & 3.

```js
// Verse bar 1
{ dur:4*BW, notes:[
  {t:0*BW,   freq:261.6, dur:BW*0.85, gain:0.13, type:"triangle"},
  {t:1*BW,   freq:329.6, dur:BW*0.85, gain:0.12, type:"triangle"},
  {t:2*BW,   freq:392.0, dur:BW*0.85, gain:0.12, type:"triangle"},
  {t:3*BW,   freq:329.6, dur:BW*0.85, gain:0.11, type:"triangle"},
  {t:0*BW,   freq:130.8, dur:BW*0.82, gain:0.10, type:"square"},
  {t:2*BW,   freq:130.8, dur:BW*0.82, gain:0.10, type:"square"},
]},
// Verse bar 2 — answers verse bar 1, resolves toward G
{ dur:4*BW, notes:[
  {t:0*BW,   freq:392.0, dur:BW*0.85, gain:0.13, type:"triangle"},
  {t:1*BW,   freq:329.6, dur:BW*0.85, gain:0.12, type:"triangle"},
  {t:2*BW,   freq:261.6, dur:BW*0.85, gain:0.12, type:"triangle"},
  {t:3*BW,   freq:392.0, dur:BW*0.85, gain:0.13, type:"triangle"},
  {t:0*BW,   freq:196.0, dur:BW*0.82, gain:0.10, type:"square"},
  {t:2*BW,   freq:130.8, dur:BW*0.82, gain:0.10, type:"square"},
]},
// Fill — ascending square run back into the chorus
{ dur:4*BW, notes:[
  {t:0*BW,    freq:261.6, dur:BW*0.40, gain:0.16, type:"square"},
  {t:0.5*BW,  freq:329.6, dur:BW*0.40, gain:0.16, type:"square"},
  {t:1*BW,    freq:392.0, dur:BW*0.40, gain:0.16, type:"square"},
  {t:1.5*BW,  freq:523.3, dur:BW*0.40, gain:0.17, type:"square"},
  {t:2*BW,    freq:659.3, dur:BW*0.40, gain:0.17, type:"square"},
  {t:2.5*BW,  freq:523.3, dur:BW*0.40, gain:0.16, type:"square"},
  {t:3*BW,    freq:659.3, dur:BW*0.40, gain:0.17, type:"square"},
  {t:3.5*BW,  freq:783.9, dur:BW*0.40, gain:0.18, type:"square"},
  {t:0*BW,    freq:130.8, dur:BW*1.8,  gain:0.12, type:"triangle"},
  {t:2*BW,    freq:196.0, dur:BW*1.8,  gain:0.12, type:"triangle"},
  {t:0*BW,    noise:true, dur:0.05, gain:0.07, filtFreq:1200, Q:2},
  {t:2*BW,    noise:true, dur:0.05, gain:0.07, filtFreq:1200, Q:2},
]},
// Chorus bars 1-2: COPY existing T_BOUNCY.bars[0] and bars[1] verbatim
```

### 2. `robot_rampage` (160 BPM, A minor)
Verse: triangle countermelody carries alone over sparse bass; sawtooth lead
and perc tacet (held back) for tension before the chorus hits.

```js
// Verse bar 1
{ dur:4*RR, notes:[
  {t:0*RR,   freq:329.6, dur:RR*1.9, gain:0.14, type:"triangle"},
  {t:2*RR,   freq:392.0, dur:RR*1.9, gain:0.13, type:"triangle"},
  {t:0*RR,   freq:110.0, dur:RR*0.9, gain:0.09, type:"square"},
  {t:2*RR,   freq:110.0, dur:RR*0.9, gain:0.09, type:"square"},
]},
// Verse bar 2 — countermelody rises, bass adds a passing tone
{ dur:4*RR, notes:[
  {t:0*RR,   freq:440.0, dur:RR*1.9, gain:0.14, type:"triangle"},
  {t:2*RR,   freq:329.6, dur:RR*1.9, gain:0.13, type:"triangle"},
  {t:0*RR,   freq:98.0,  dur:RR*0.9, gain:0.09, type:"square"},
  {t:2*RR,   freq:110.0, dur:RR*0.9, gain:0.09, type:"square"},
]},
// Fill — rising sawtooth glissando into the chorus
{ dur:4*RR, notes:[
  {t:0*RR,    freq:220.0, dur:RR*0.95, freqEnd:330.0, gain:0.15, type:"sawtooth"},
  {t:1*RR,    freq:330.0, dur:RR*0.95, freqEnd:440.0, gain:0.16, type:"sawtooth"},
  {t:2*RR,    freq:440.0, dur:RR*0.95, freqEnd:587.3, gain:0.17, type:"sawtooth"},
  {t:3*RR,    freq:587.3, dur:RR*0.95, freqEnd:880.0, gain:0.19, type:"sawtooth"},
  {t:0*RR,    freq:110.0, dur:RR*1.9, gain:0.12, type:"square"},
  {t:2*RR,    freq:110.0, dur:RR*1.9, gain:0.13, type:"square"},
  {t:3.5*RR,  noise:true, dur:0.06, gain:0.08, filtFreq:1400, Q:2},
]},
// Chorus bars 1-2: COPY existing T_RAMPAGE.bars[0] and bars[1] verbatim
```

### 3. `soap_opera` (120 BPM, F major)
Already the gentlest track (no percussion). Verse is even sparser — long
sustained notes, bass tacet on beats 1-2. No fill needed; the genre doesn't
want a "drop," it wants more melody, so this just adds a second melodic idea.

```js
// Verse bar 1 — long sustained F-A-C arc, no bass on beats 1-2
{ dur:4*SO, notes:[
  {t:0*SO,   freq:349.2, dur:SO*1.8, gain:0.14, type:"triangle"},
  {t:2*SO,   freq:440.0, dur:SO*1.8, gain:0.13, type:"triangle"},
  {t:2*SO,   freq:87.3,  dur:SO*0.9, gain:0.10, type:"square"},
  {t:3*SO,   freq:130.8, dur:SO*0.9, gain:0.09, type:"square"},
]},
// Verse bar 2 — answers with descending phrase
{ dur:4*SO, notes:[
  {t:0*SO,   freq:523.3, dur:SO*1.8, gain:0.14, type:"triangle"},
  {t:2*SO,   freq:349.2, dur:SO*1.8, gain:0.15, type:"triangle"},
  {t:0*SO,   freq:174.6, dur:SO*0.9, gain:0.10, type:"square"},
  {t:1*SO,   freq:130.8, dur:SO*0.9, gain:0.09, type:"square"},
]},
// Connecting bar — gentle bass walk-up, no abrupt fill needed for this track
{ dur:4*SO, notes:[
  {t:0*SO,   freq:392.0, dur:SO*0.9,  gain:0.14, type:"triangle"},
  {t:1*SO,   freq:349.2, dur:SO*0.9,  gain:0.13, type:"triangle"},
  {t:0*SO,   freq:87.3,  dur:SO*0.38, gain:0.13, type:"square"},
  {t:0.5*SO, freq:98.0,  dur:SO*0.38, gain:0.12, type:"square"},
  {t:1*SO,   freq:110.0, dur:SO*0.38, gain:0.13, type:"square"},
  {t:1.5*SO, freq:130.8, dur:SO*0.38, gain:0.12, type:"square"},
  {t:2*SO,   freq:349.2, dur:SO*1.8,  gain:0.15, type:"triangle"},
]},
// Chorus bars 1-2: COPY existing T_SOAP.bars[0] and bars[1] verbatim
```

### 4. `conveyor_blues` (140 BPM, G blues)
Verse: bass walking line carries alone, no lead, no perc — leaves room for
the chorus's offbeat percussion to land as a clear payoff.

```js
// Verse bar 1
{ dur:4*CB, notes:[
  {t:0*CB,   freq:98.0,  dur:CB*0.82, gain:0.14, type:"triangle"},
  {t:1*CB,   freq:116.5, dur:CB*0.82, gain:0.12, type:"triangle"},
  {t:2*CB,   freq:130.8, dur:CB*0.82, gain:0.14, type:"triangle"},
  {t:3*CB,   freq:116.5, dur:CB*0.82, gain:0.12, type:"triangle"},
]},
// Verse bar 2 — bass climbs, lead enters quietly on the last beat (pickup into fill)
{ dur:4*CB, notes:[
  {t:0*CB,   freq:147.0, dur:CB*0.82, gain:0.14, type:"triangle"},
  {t:1*CB,   freq:174.6, dur:CB*0.82, gain:0.13, type:"triangle"},
  {t:2*CB,   freq:130.8, dur:CB*0.82, gain:0.13, type:"triangle"},
  {t:3*CB,   freq:392.0, dur:CB*0.9,  gain:0.10, type:"square"},
]},
// Fill — blues bend on the lead via freqEnd
{ dur:4*CB, notes:[
  {t:0*CB,    freq:392.0, dur:CB*0.9, freqEnd:466.2, gain:0.16, type:"square"},
  {t:1*CB,    freq:523.3, dur:CB*0.44, gain:0.15, type:"square"},
  {t:1.5*CB,  freq:587.3, dur:CB*0.44, gain:0.15, type:"square"},
  {t:2*CB,    freq:523.3, dur:CB*0.9, freqEnd:392.0, gain:0.16, type:"square"},
  {t:3*CB,    freq:466.2, dur:CB*0.44, gain:0.14, type:"square"},
  {t:0*CB,    freq:98.0,  dur:CB*1.8, gain:0.12, type:"triangle"},
  {t:2*CB,    freq:98.0,  dur:CB*1.8, gain:0.12, type:"triangle"},
  {t:3*CB,    noise:true, dur:0.06, gain:0.07, filtFreq:1200, Q:2},
]},
// Chorus bars 1-2: COPY existing T_BLUES.bars[0] and bars[1] verbatim
```

### 5. `overtime_mania` (175 BPM, D major)
Verse: half-time feel — 8th notes instead of 16ths, perc thinned to beat 1
only, bass sustained instead of punchy. The chorus's 16th-note density then
reads as a genuine intensity jump.

```js
// Verse bar 1 — 8th notes, half the density of the chorus
{ dur:4*OM, notes:[
  {t:0*OM,   freq:293.7, dur:OM*0.42, gain:0.14, type:"square"},
  {t:0.5*OM, freq:370.0, dur:OM*0.42, gain:0.13, type:"square"},
  {t:1*OM,   freq:440.0, dur:OM*0.42, gain:0.13, type:"square"},
  {t:1.5*OM, freq:370.0, dur:OM*0.42, gain:0.12, type:"square"},
  {t:2*OM,   freq:293.7, dur:OM*0.42, gain:0.14, type:"square"},
  {t:2.5*OM, freq:440.0, dur:OM*0.42, gain:0.13, type:"square"},
  {t:3*OM,   freq:370.0, dur:OM*0.42, gain:0.12, type:"square"},
  {t:3.5*OM, freq:293.7, dur:OM*0.42, gain:0.12, type:"square"},
  {t:0*OM,   freq:73.4,  dur:OM*1.8, gain:0.12, type:"sawtooth"},
  {t:2*OM,   freq:73.4,  dur:OM*1.8, gain:0.12, type:"sawtooth"},
  {t:0*OM,   noise:true, dur:0.04, gain:0.07, filtFreq:1400, Q:2},
]},
// Verse bar 2 — shifts to A, still half-time
{ dur:4*OM, notes:[
  {t:0*OM,   freq:440.0, dur:OM*0.42, gain:0.14, type:"square"},
  {t:0.5*OM, freq:370.0, dur:OM*0.42, gain:0.13, type:"square"},
  {t:1*OM,   freq:293.7, dur:OM*0.42, gain:0.13, type:"square"},
  {t:1.5*OM, freq:370.0, dur:OM*0.42, gain:0.12, type:"square"},
  {t:2*OM,   freq:440.0, dur:OM*0.42, gain:0.15, type:"square"},
  {t:2.5*OM, freq:587.3, dur:OM*0.42, gain:0.14, type:"square"},
  {t:3*OM,   freq:440.0, dur:OM*0.42, gain:0.13, type:"square"},
  {t:3.5*OM, freq:370.0, dur:OM*0.42, gain:0.12, type:"square"},
  {t:0*OM,   freq:110.0, dur:OM*1.8, gain:0.12, type:"sawtooth"},
  {t:2*OM,   freq:110.0, dur:OM*1.8, gain:0.13, type:"sawtooth"},
  {t:0*OM,   noise:true, dur:0.04, gain:0.07, filtFreq:1400, Q:2},
]},
// Fill — 16th-note buildup ramping perc back to every-beat, leading into chorus
{ dur:4*OM, notes:[
  {t:0*OM,     freq:293.7, dur:OM*0.22, gain:0.15, type:"square"},
  {t:0.25*OM,  freq:370.0, dur:OM*0.22, gain:0.14, type:"square"},
  {t:0.5*OM,   freq:440.0, dur:OM*0.22, gain:0.14, type:"square"},
  {t:0.75*OM,  freq:587.3, dur:OM*0.22, gain:0.15, type:"square"},
  {t:1*OM,     freq:440.0, dur:OM*0.22, gain:0.15, type:"square"},
  {t:1.25*OM,  freq:587.3, dur:OM*0.22, gain:0.15, type:"square"},
  {t:1.5*OM,   freq:659.3, dur:OM*0.22, gain:0.16, type:"square"},
  {t:1.75*OM,  freq:587.3, dur:OM*0.22, gain:0.15, type:"square"},
  {t:2*OM,     freq:880.0, dur:OM*0.40, gain:0.18, type:"square"},
  {t:2.5*OM,   freq:880.0, dur:OM*0.40, gain:0.18, type:"square"},
  {t:3*OM,     freq:880.0, dur:OM*0.40, gain:0.19, type:"square"},
  {t:3.5*OM,   freq:880.0, dur:OM*0.40, gain:0.20, type:"square"},
  {t:0*OM,     freq:73.4,  dur:OM*1.8, gain:0.13, type:"sawtooth"},
  {t:2*OM,     freq:110.0, dur:OM*1.8, gain:0.14, type:"sawtooth"},
  {t:0*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
  {t:1*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
  {t:2*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
  {t:3*OM,     noise:true, dur:0.04, gain:0.08, filtFreq:1400, Q:2},
]},
// Chorus bars 1-2: COPY existing T_MANIA.bars[0] and bars[1] verbatim
```

## Phase 2 — assemble and smoke test
- Each `T_*.bars` array becomes `[verse1, verse2, fill, chorus1, chorus2]`
  (5 entries, in that order) — `_barIndex % 5` then naturally loops verse →
  fill → chorus → verse...
- Headless smoke test in `test-input.js` (pure math, no canvas import):
  for each of the 5 tracks, assert `bars.length === 5`; assert every note's
  `t + dur <= bar.dur` (no note overruns its bar — would currently still
  "work" via the scheduler's look-ahead but is worth catching); assert every
  `gain` is in `[0.05, 0.25]` (matches existing convention, catches typos).
- Manual verification: play each level, let the track loop fully at least
  twice, confirm verse is audibly quieter/sparser, chorus is recognizable as
  the original track, no clicks/silence gaps at bar boundaries, loop point
  (end of chorus2 → verse1) doesn't pop.
- Things to watch for: copy-paste of the existing chorus bars must be
  byte-exact (same gains/freqs) — if Claude Code "helpfully" tweaks them
  while moving, the chorus stops matching what players already associate
  with each track. Do a diff against the original 2 bars per track to confirm.

## Phase 3 — optional follow-up (do NOT build unless requested after listening)
- If 5 bars still feels short in practice: repeat chorus1/chorus2 with a
  melodic variant on the repeat (octave-up lead, or swap lead/counter roles)
  to reach 7 bars, closer to a literal 4x.
- Per-track second verse variant for tracks that loop a lot in one play
  session (auto-rotation visits all 5, but a single long level stays on one
  track) — lower priority, only if repetition becomes noticeable in
  playtesting.

## Non-goals / explicitly out of scope
- No changes to `_tickMusic`, `_scheduleBar`, look-ahead timing, duck/unduck,
  or the unlock/autoplay sequencing — all of that is working and documented
  in STATUS-AUDIO.md as fragile; this spec touches data only.
- No new instrumentation types or effects beyond what `tone`/`noise` already
  support (no reverb, no new oscillator types) — stays within the existing
  Web Audio synthesis approach, no external assets.
- `TRACK_TITLE` is unchanged.