# Claude Code Handoff — Music Phase 3 (longer tracks + bassoon + arriving choruses)

Fresh session. Read STATUS.md and STATUS-AUDIO.md first, then
MUSIC-PHASE3-SPEC.md in full, then phase3-bars.js (the generated note data).
All three are in the repo (docs/ or wherever the spec files live). Model:
Sonnet, normal effort, thinking off — this is a contained synth tweak plus a
data swap.

Sub-phases are in the spec; do them in order, smoke-test, then stop for manual
listening before considering it done.

## Order of work
1. **3a — extend `tone()` in `src/audio.js`**: add the cached `bassoonWave()`
   helper and the `filt`/`hold`/`type:"bassoon"` handling, exactly as the spec
   shows. The no-`filt`/no-`hold`/standard-`type` path MUST be behaviorally
   unchanged.
2. **3b — `_scheduleBar` in `src/music.js`**: add `filt:n.filt, hold:n.hold`
   to the `tone()` call.
3. **3c — swap the five `bars:[...]` arrays** in `src/music.js` from
   phase3-bars.js. Use a `str_replace` per track (replace each old
   `bars:[ ... ]` block). Leave `id`/`name`/`bpm` and the `BW/RR/SO/CB/OM`
   consts alone. The new chorus bars are intentionally different from the old
   ones — do not try to preserve old chorus bars.
4. **3d — smoke test** in `test-input.js` (in the spec; pure math, no canvas):
   asserts 9 bars/track, notes fit their bars, gains in range, bassoon notes
   carry `hold`. Run headless, confirm the pass message.

## Watch for
- After editing `tone()`, sanity-check that existing **SFX** still sound right
  (they call the same `tone()`); a regression there means the default path
  changed.
- `tone()` is exported from audio.js and imported by music.js — confirm the
  signature change doesn't break that import.
- Don't touch the scheduler loop, duck/unduck, fadeOut, playlists, or
  TRACK_TITLE.

## Manual verification (do before declaring done)
Per the spec: each track runs ~9 bars before repeating; bassoon is audibly
woody on Rampage & Blues verses; each chorus clearly arrives; no clicks/gaps
at bar boundaries or the loop point.

## End of session
Update STATUS.md and STATUS-AUDIO.md: gameplay tracks are now 9 bars
(verse/fill/chorus/return), `tone()` supports `type:"bassoon"` + `filt` + `hold`,
bassoon counter-lines on robot_rampage & conveyor_blues, per-track chorus
arrival treatments. (Paul handles all git add/commit/push.)