# Claude Code Handoff — Music Expansion (3 phases)

Read STATUS.md and STATUS-AUDIO.md first, then MUSIC-EXPANSION-SPEC.md in full
before starting Phase 1. Run each phase, smoke test, then stop for manual
verification before continuing to the next phase. Model: Sonnet, normal
effort, thinking off — this is data/structural work, not novel logic.

---

## Phase 1 — Split audio.js into music.js

Implement "Phase 0" from MUSIC-EXPANSION-SPEC.md exactly as described:
create `src/music.js`, move all music-related code into it, export `tone`
and `noise` from `audio.js`, add `getCtx()`/`getMusicBus()` accessors to
`audio.js`, and have `audio.js` re-export `music` from `music.js` so every
existing `import { music } from "./audio.js"` call site is untouched.

**Watch for:** `ctx` and `musicBus` are created lazily inside `ensure()` in
audio.js — don't try to export the raw bindings (ES modules can't reassign
an imported binding), use accessor functions instead. Grep for every file
that imports `music` from `audio.js` before you start, and re-grep after the
split to confirm none of those import lines needed to change.

**Smoke test:** Run the game, confirm:
- Title screen still plays music after first click/keypress.
- Starting a run plays a gameplay track.
- `node -e` or browser console: no import errors in either file.
- `wc -c src/audio.js src/music.js` — confirm audio.js dropped well under
  24KB and report both new sizes.

Stop here. Report file sizes and confirm the manual checks above before
I review.

---

## Phase 2 — Add verse/chorus bars to all 5 tracks

In `music.js`, for each of the 5 `T_*` track consts, replace the current
2-bar `bars:[...]` array with the 5-bar version: **verse1, verse2, fill,
chorus1, chorus2** — using the exact note data given in
MUSIC-EXPANSION-SPEC.md Phase 1 section for each track.

**Critical: the chorus1/chorus2 bars in the new array must be byte-identical
to the current bars[0]/bars[1] in the existing file** — copy them verbatim,
do not regenerate or "clean up" the numbers. Diff against the pre-Phase-2
version of music.js to confirm the chorus bars didn't change.

Do not touch `TRACK_TITLE`, the scheduler (`_tickMusic`/`_scheduleBar`),
`LOOKAHEAD`, or anything in `audio.js`.

**Watch for:** five tracks × five bars each is a lot of array literal to get
exactly right — paste carefully, and don't let auto-formatting collapse or
reorder the `notes:[...]` entries in a way that changes which notes belong
to which bar.

**Smoke test** (add to `test-input.js`, pure math, no canvas import):
```js
import { TRACKS } from "./music.js"; // adjust path/export as Phase 1 landed it

for (const track of TRACKS) {
  console.assert(track.bars.length === 5, `${track.id}: expected 5 bars, got ${track.bars.length}`);
  for (const [i, bar] of track.bars.entries()) {
    for (const n of bar.notes) {
      const end = n.t + n.dur;
      console.assert(end <= bar.dur + 0.02, `${track.id} bar ${i}: note overruns bar (t=${n.t} dur=${n.dur} bar.dur=${bar.dur})`);
      console.assert(n.gain >= 0.05 && n.gain <= 0.25, `${track.id} bar ${i}: gain ${n.gain} out of range`);
    }
  }
}
console.log("Music bar validation passed.");
```
Run this headless (no browser) and confirm it logs the pass message with no
assertion failures.

**Manual verification:** Run the game, let each of the 5 gameplay tracks
loop through fully at least twice (auto-rotation changes track each level,
or trigger manually if there's a debug hook). For each track confirm: verse
is audibly sparser/quieter than chorus, chorus is recognizable as the
original loop, no clicks or dead air at the verse→fill→chorus or
chorus→verse (loop) boundaries.

Stop here and report the smoke test output plus your listening notes before
I review. Do not proceed to Phase 3 unless asked — it's optional and only
worth doing after hearing Phase 2 in the actual game.

---

## Phase 3 — optional, only if explicitly requested after Phase 2 review

Not specified yet. If Phase 2 sounds good but still feels short, the spec's
"Phase 3" section sketches extending to 7 bars via a chorus repeat-with-variant.
Don't build this speculatively — come back for a fresh prompt once we've
listened to Phase 2.

---

## End of session
Update STATUS.md and STATUS-AUDIO.md: bump the music system entry to reflect
the new file split (`audio.js`, `music.js`) and the 5-bar verse/chorus
structure per track, replacing the "Phase 3 — scheduler + 6 tracks" heading
in STATUS-AUDIO.md with accurate current state (5 gameplay tracks, not 6).