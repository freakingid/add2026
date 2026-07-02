# SPEC — Title Screen Weekly Achievements Rail

Builds on `SPEC-resolution-system.md` (Phases 1–2 must land first — this
spec's numbers are `base × UI_SCALE`, not absolute pixels). Baseline design
resolution is **1280×720** (`UI_SCALE = 1`); at 1920×1080 every value below
multiplies by 1.5 automatically via the convention, not via a second
hand-tuned layout.

## Source material
- Design reference: `Title Screen.standalone.html` (Claude Design mockup,
  built at 1200×750 — a different aspect ratio/scale than the game's 16:9
  target, so values below are re-derived proportionally, not copied 1:1).
- `README.md` (design spec accompanying the mockup) — colors, copy, and
  interaction behavior are taken as final from there; only geometry is
  re-scaled for 1280×720.
- Current implementation: `screens.js`'s `drawTitle()` ("input" phase) and
  `drawWeeklyPanel()` — this spec replaces both, at the new baseline.

## What's already built and unchanged by this spec
Confirmed by source read — **no work needed here**:
- **Lifetime Achievements modal** (`drawLifetimeModal()` in `screens.js`) is
  fully built: scrollable, grouped by the 13 `CATEGORIES` in
  `achievements.js` (`getLifetimeAchievements()`), tier badges, progress
  bars, descriptions. This already exceeds the mockup's simpler
  unlocked/locked/note list.
- **Open/close wiring** for the modal — `V` key, gamepad `X`/`B`, backdrop
  semantics — already exists in `input.js`'s `pollModals()`, keyed off
  `G._showLifetimeModal` / `G._lifetimeModalFrom` / `G._lifetimeScrollY` /
  `G._lifetimeMaxScroll`, all already on `G` (`state.js`).
- This spec's only functional addition to the modal is a typography pass
  (Phase 3, below) so its scale matches the new rail — no new state, no new
  interaction logic.

## File split (screens.js is already over the 24KB convention)
`screens.js` is 24,695 bytes today — already past the 24KB soft ceiling
before this work starts. Rather than growing it further:
- New file **`screens-title.js`**: `drawTitle()` (all `_titlePhase`
  branches — input/mode/playlist/load/options are already dispatched from
  one function), `drawTitleBackdrop()`, `drawTitleLogo()`,
  `drawWeeklyPanel()` (rewritten per this spec), `_drawTitleLoadScreen()`,
  `drawTitleModeSelect()`, `drawTitlePlaylistPicker()`,
  `_drawTitleMenuHighlight()`.
- `screens.js` keeps `drawHUD`, `drawLevelClear`, `drawPostLevelModal`,
  `drawFireLegend`, `drawLifetimeModal`, `drawGameOver` — imports
  `drawTitle` from `screens-title.js` and re-exports it (or callers import
  directly from the new file; decide at implementation time based on which
  keeps `render.js`'s import list cleanest).
- `drawFireLegend` is used by both `optionsmenu.js` and (today) `screens.js`
  — confirm at split time whether the new title layout still calls it
  directly or drops the on-title legend now that the rail owns the
  right-hand space (the mockup's rail doesn't include a fire-legend grid;
  see "Left/center zone" below — legend is cut from the title, still
  reachable via Options as today).

## Layout — Title "input" phase at 1280×720 (`UI_SCALE = 1`)

Two zones, matching the mockup's "1c" rail concept:

### Right rail — Weekly Achievements
- **Width:** `460 * UI_SCALE` px, full height, pinned to the right edge.
  (Mockup's 440/1200 fraction ≈ 469px at 1280 width; rounded to 460 for
  clean math and a touch more breathing room on the left zone.)
- **Background:** `rgba(9,13,18,0.55)`, 1px left border
  `rgba(255,255,255,0.09)` (mockup values — colors/opacity untouched by
  resolution, only geometry scales; a 1px hairline border does not scale
  with `UI_SCALE`, stays 1px at both resolutions for crispness).
- **Padding:** `28*UI_SCALE 28*UI_SCALE 22*UI_SCALE` (top/right-left/bottom
  shorthand per mockup).
- **Header row:** `WEEKLY ACHIEVEMENTS` label, `13*UI_SCALE` px, ls 2px,
  `#7c8590`, left; progress chip right — `N / 5` pill, `12*UI_SCALE` px
  bold, `#f6a821` on `rgba(246,168,33,0.13)`, padding
  `3*UI_SCALE 9*UI_SCALE`, radius `5*UI_SCALE`. Value = count of weekly
  achievements with `progress>=1` — already computed today as
  `getWeeklyAchievements()`'s appended `meta_eotw` entry's `progress`
  field; reuse directly, no new derivation needed.
- **Achievement rows** (5 weekly + Employee-of-the-Week), vertically
  centered in remaining rail height, `15*UI_SCALE` px gap, 1px top divider
  `rgba(255,255,255,0.06)`, `14*UI_SCALE` px divider-to-content padding.
  - Name: `23*UI_SCALE` px bold, `#eef2f6`. EOTW row: `#f6a821` name +
    orange divider `rgba(246,168,33,0.25)`.
  - Fraction (right-aligned on name baseline): `14*UI_SCALE` px bold,
    `#4ee06a` (green); `#f6a821` for EOTW. Format `N / target` — reuse
    `getWeeklyAchievements()`'s existing `{progress, target}` per entry
    (target is always `1` for weeklies in the current data model, per
    `achievements.js`; note this differs from the mockup's `N / 5`
    phrasing, which assumed a 5-completions-per-week model the actual
    REGISTRY doesn't use — **flagging this mismatch for Paul**, see below).
  - Description: `13*UI_SCALE` px, `#88919b` (`#b79256` for EOTW),
    line-height 1.25, `4*UI_SCALE` px top margin.
  - Progress bar (weekly rows only, not EOTW): `5*UI_SCALE` px tall,
    track `rgba(255,255,255,0.08)`, radius `3*UI_SCALE`, fill `#4ee06a`,
    width = `progress/target` as %, `8*UI_SCALE` px top margin.
- **Footer row:** 1px top divider, `15*UI_SCALE` px top padding.
  `▸ VIEW ALL ACHIEVEMENTS` link, `14*UI_SCALE` px, ls 1px, `#35b6f2`;
  `[V]` keybind hint, `12*UI_SCALE` px, `#576069`, right-aligned.

**Data-model mismatch to resolve before implementation (not a geometry
question):** the mockup's copy/design assumes weekly achievements are
"complete at least 5 times this week" (`N / 5` fractions, `done: 4` sample
data). The actual game's `getWeeklyAchievements()` returns `target: 1`
always — "completed at least once this week" per
`STATUS-ACHIEVEMENTS.md` Phase 5 decisions. **This spec follows the real
data model** (fractions render as the true `progress/target`, which for a
`target:1` weekly is either `0/1` or `1/1` — i.e., visually it's really a
checkbox, not a 5-step bar). Two options for Paul to pick between:
  1. Keep it a checkbox-style row for weeklies (no progress bar, or a
     binary-fill bar) — cheapest, matches real data exactly.
  2. Change the progress bar to reflect something else meaningful (e.g. if
     any weekly ever gets a >1 target in the future, the bar already works
     correctly without changes) — no work needed now, bar code handles
     `target>1` for free via `progress/target`.
  Recommend **option 1** cosmetically (row still shows a bar, it's just
  either empty or full) since it requires zero achievement-system changes
  and doesn't misrepresent progress. Flagging rather than silently
  reinterpreting the mockup's `N/5` as something the game doesn't track.

### Left/center zone — title, prompts, XP
Occupies `0` to `VIEW_W - railWidth`, centered horizontally within that
zone, vertically weighted toward the middle (mirrors mockup). Vertical
stack, `20*UI_SCALE` px gap between items:
1. **Title** — 3 lines, `Archivo Black` (fallback: keep
   `'Arial Black', sans-serif` per current game convention if the font
   isn't already loaded — flag as an open question, see Fonts below),
   `65*UI_SCALE` px, line-height 0.9, ls 1px: `ATOMIC` green
   (`COL.atomic` = `#5dff8f`, close to mockup's `#4ee06a` — **use the
   existing `COL.atomic` token**, don't introduce a near-duplicate hex),
   `DUSTBIN` orange (`COL.amber` = `#ffb627` vs mockup `#f6a821` — same
   call, reuse `COL.amber`), `DAN` blue (`COL.soap` = `#5fd2ff` vs mockup
   `#35b6f2` — reuse `COL.soap`). **Reusing the game's existing 3-color
   token set instead of the mockup's near-identical-but-different hexes**
   keeps one source of truth for the game's palette; visually
   indistinguishable at a glance, and avoids `palette.js` accumulating
   near-duplicate colors.
2. **Tagline** — `THE ROBOTS HAVE TURNED. GRAB YOUR MOP.`, `15*UI_SCALE` px,
   ls 2px, `#aeb7c1`, uppercase, monospace (`'Courier New', monospace` per
   existing game convention — mockup's JetBrains Mono is a webfont the game
   doesn't currently load; see Fonts below), `13*UI_SCALE` px top margin.
3. `SPACE — KEYBOARD` — `19*UI_SCALE` px, bold, ls 3px, `COL.soap`.
4. `A / START — GAMEPAD` — `19*UI_SCALE` px, bold, ls 3px, `COL.atomic`.
   (Items 3–4 currently blink together as one unit in the existing code —
   **keep that blink behavior**, the mockup is a static reference and
   doesn't show blink state; don't drop the existing affordance.)
5. `L — LOAD GAME` — `14*UI_SCALE` px, ls 2px, `#7c8590`.
6. `O — OPTIONS` / `X — OPTIONS (GAMEPAD)` — two items, `30*UI_SCALE` px
   gap, `12*UI_SCALE` px, ls 2px, `#5c6670`.
- `XP  N` — pinned `29*UI_SCALE` px from the zone's bottom, centered,
  `14*UI_SCALE` px bold, ls 2px, `COL.amber`. Only shown when `xp > 0`
  (existing behavior via `getXP()`, unchanged).
- **High score** — existing code shows `HIGH SCORE nnnnnn` near the
  bottom when `G.high > 0`; the mockup doesn't include this element at
  all. **Keep it** — real functionality the mockup reference simply didn't
  model since it wasn't the focus of that design pass. Place it above the
  XP line at `47*UI_SCALE` px from bottom, matching current relative
  ordering.

### Background
Base `#171d24` (mockup) vs. current game's `#15181f` — close enough that
this is a judgment call, not a hard requirement. **Recommend keeping the
existing `#15181f`/`#1c2129` checker** (already implemented, already at the
right scale via the existing 48px tile size — mockup's 86px checker was
tuned for its own 1200×750 canvas) rather than introducing a second
near-identical checker implementation. Purely visual, low-stakes — flag,
don't block on it.

## Fonts — open question for Paul
The mockup specifies **Archivo Black** (display) + **JetBrains Mono**
(UI/body), loaded from Google Fonts. The current game uses **`'Arial
Black', sans-serif`** and **`'Courier New', monospace`** — system fonts,
zero load time, zero external dependency, consistent with a game that
otherwise has no network asset loading (all audio is synthesized, no image
assets per `STATUS.md`).

Switching to Google Fonts means:
- A `<link>`/`@font-face` addition to `atomic-dustbin-dan.html` (or a
  self-hosted woff2, avoiding the external request — the mockup's own
  bundle embeds the woff2 files directly, which is the safer pattern for
  an offline-capable game).
- A brief flash-of-fallback-font window on first load unless
  self-hosted+preloaded.
- This is a **cosmetic upgrade with a real cost/tradeoff**, not something
  this spec should silently decide. **Recommend keeping system fonts**
  (Arial Black / Courier New) for this pass — they're visually close
  enough to Archivo Black / JetBrains Mono for a warehouse-arcade aesthetic,
  and the font swap can be its own small follow-up if Paul wants it later,
  decoupled from the rail layout work. All font sizes above are specified
  in a way that works with either font choice.

## Behavior (unchanged from what already exists)
- `▸ VIEW ALL ACHIEVEMENTS` / `V` key → opens `G._showLifetimeModal = true`,
  `_lifetimeModalFrom = 'title'` — **already wired** in
  `pollModals()` (`input.js`), confirmed reading the source; this spec's
  rail just needs to render the link and hint text, not add new input
  handling.
- No new state fields needed on `G` — everything the rail reads
  (`getWeeklyAchievements()`, `getXP()`, `G.high`) already exists and is
  already imported by `screens.js` today.

## Phased Claude Code implementation

**Phase 0 (prerequisite, separate spec):** `SPEC-resolution-system.md`
Phases 1–2 — `UI_SCALE` must exist before this phase's numbers mean
anything. If Paul wants the rail sooner and is willing to hardcode 1280×720
temporarily (no `UI_SCALE` multiplication, values as literal px), that's a
valid interim path — flag explicitly in the Phase 1 prompt below which mode
Claude Code should build in, since the code differs (literals vs.
`base*UI_SCALE` everywhere).

**Phase 1 — File split.** Create `screens-title.js`, move the listed
functions verbatim (no layout changes yet — this phase is pure mechanical
extraction, verified by no visual diff). Update `render.js`'s import list.
**Risk:** `drawFireLegend` is imported by `optionsmenu.js` from
`screens.js` today — moving it to `screens-title.js` means updating that
import too; confirm no circular import results (optionsmenu.js already has
a documented "must NOT import input.js/pause.js" constraint — check
screens-title.js doesn't end up on the wrong side of a similar cycle before
finalizing which file owns `drawFireLegend`). Verify via
`node --input-type=module -e "import('./src/screens-title.js")"` plus a
grep cross-check per the module-split-safety convention in memory, then an
in-browser load confirming the title screen still renders (old layout) and
level-intro animation still completes (canary).

**Phase 2 — Rail rebuild.** Rewrite `drawWeeklyPanel()` and the left/center
zone layout in `drawTitle()`'s "input" branch per the geometry above.
Resolve the `N/5` vs `N/1` data-model question with Paul before writing
code (flagged above) — this is a design decision, not an implementation
detail, and shouldn't be silently decided mid-phase. Verify in-browser at
both 1280×720 and 1920×1080 (toggle fullscreen) — confirm proportional
scaling, not just "looks fine at one size."

**Phase 3 — Lifetime modal typography pass.** Scale `drawLifetimeModal()`'s
existing fonts/row-heights by `UI_SCALE` for visual consistency with the
new rail. No layout restructuring, no new features — purely the mechanical
`UI_SCALE` retrofit described in `SPEC-resolution-system.md` Phase 3,
scoped to this one function since it's the highest-visibility screen to
retrofit first. Can happen in the same Claude Code session as Phase 2 or
its own — low risk either way.

Each phase should be its own Claude Code prompt per the existing "phased
implementation" convention, with STATUS.md updated at the end of each.