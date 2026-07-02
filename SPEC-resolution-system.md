# SPEC — Multi-resolution rendering (1280×720 windowed → 1920×1080 fullscreen)

## Goal
Replace the fixed 960×640 canvas with a live backing store that runs at
**1280×720 windowed** and **1920×1080 fullscreen**, where 1080p shows *more
world* (larger camera viewport, same tile size) rather than a stretched
picture of the same view. Screen-space UI (HUD, title, modals) scales its
type/spacing with resolution instead of floating in extra empty margin.

## Current state (confirmed by source read)
- `canvas.js` sets `VIEW_W`/`VIEW_H` once, as `export const`, from
  `canvas.width`/`canvas.height` — which are set once via HTML attributes
  (`width="960" height="640"`) and never touched again. No resize path
  exists today.
- CSS (`atomic-dustbin-dan.html`) stretches that fixed backing store to fit
  the viewport (`width:min(96vw,960px); height:auto; aspect-ratio:3/2`) —
  today's "scaling" is pure CSS upscale of a fixed-resolution bitmap.
- **World/camera layer is already resolution-agnostic.** `render.js` and
  `update.js` compute camera clamps and tile-culling bounds from live
  `VIEW_W`/`VIEW_H` imports, not literals. `CFG.TILE` (32px/tile) and
  `CFG.COLS/ROWS` (level grid) are independent of screen size — the world is
  larger than one screen and scrolls, so a bigger viewport just reveals more
  of it. This is exactly the "more world, not a bigger picture" behavior
  wanted, and it requires no changes.
- **Centering/anchoring math is already correct.** Every screen-space file
  (`screens.js`, `pause.js`, `optionsmenu.js`, `wipe.js`, `render.js`) uses
  live `VIEW_W`/`VIEW_H` for centering (`(VIEW_W - w)/2`, `VIEW_W/2`, etc.) —
  nobody hardcodes `960`/`640` as raw literals. Confirmed via grep across
  every file that imports `VIEW_W`/`VIEW_H` (15 files).
- **Not resolution-agnostic:** absolute pixel *sizes* — panel widths, row
  heights, gaps, and every `ctx.font = "…px …"` call — are fixed values
  tuned for 960×640. Raising `VIEW_W/VIEW_H` alone would center these same
  fixed-size panels in a bigger frame, producing more empty margin rather
  than a bigger, more legible UI. This is the gap the spec closes.
- `wipe.js` already sizes its offscreen canvas from `VIEW_W`/`VIEW_H` *at
  call time*, not at module load — useful precedent for anything that must
  react to a live resolution change rather than a load-time constant.

## Design decision: two fixed resolutions, not continuous scaling
Given the two concrete targets (1280×720 windowed, 1920×1080 fullscreen),
this spec treats resolution as a **discrete toggle between two known
backing-store sizes**, not an arbitrary-viewport responsive system. That
keeps world/UI layout math simple (two known ratios, both exactly 16:9) and
avoids designing for arbitrary aspect ratios the game doesn't target yet.
1920×1080 is exactly 1.5× 1280×720, which will matter below.

## Architecture

### 1. `canvas.js` — live resolution instead of load-time constants
- `VIEW_W`/`VIEW_H` become a **live-read accessor pair**, not `const`.
  Concretely: keep them as `export let VIEW_W`, `export let VIEW_H`,
  updated by a new `setResolution(w, h)` function that also sets
  `canvas.width`/`canvas.height` and recalculates anything cached from
  them (see UI scale factor, below).
- **Risk flag for Claude Code:** `export let` bindings still can't be
  reassigned from importing modules (same ES-module constraint noted for
  `G.shots` in STATUS.md) — every module already does `import { VIEW_W,
  VIEW_H } from "./canvas.js"` and only *reads* them, never reassigns, so
  this is safe. Confirmed via the grep audit above (all 15 usages are
  reads).
- `setResolution(w, h)` is called once at boot (windowed default,
  1280×720) and again whenever the player toggles fullscreen or a future
  windowed-size option changes. This is a new user-facing settings surface
  (see "Where this hooks into Options," below) — out of scope for the
  title-rail work itself, but the rail must be built against the mechanism
  this introduces, not against a hardcoded 1280×720.

### 2. UI scale factor — the piece that makes fonts/panels resize
Add one derived constant, recalculated inside `setResolution`:
```js
export let UI_SCALE = 1;   // 1 at 1280×720 (design baseline), 1.5 at 1920×1080
```
`UI_SCALE = VIEW_W / 1280` (equivalently `VIEW_H / 720`, since both targets
share the 16:9 ratio — this is why locking to two known resolutions instead
of arbitrary continuous scaling keeps this a one-line formula instead of a
letterbox/aspect-fit calculation).

Every screen-space UI file (`screens.js`, `pause.js`, `optionsmenu.js`, HUD
draws in `screens.js`) is updated to multiply its previously-fixed pixel
values — font sizes, panel widths/heights, row heights, gaps, padding — by
`UI_SCALE`. World/camera/entity rendering does **not** use `UI_SCALE` at
all; it stays driven by `CFG.TILE` and live `VIEW_W/VIEW_H`, unchanged from
today, because "more world visible" means the world must NOT scale with the
UI.

This is the one new convention every future screen-space UI addition must
follow: **font sizes and fixed layout dimensions are written as a base
value × `UI_SCALE`, never as a bare literal**, the same way `VIEW_W/2` is
already the convention for centering today.

### 3. Design baseline: build at 1280×720, `UI_SCALE` handles 1080p
The title rail (and any other new screen-space UI) is spec'd and tuned by
eye at the 1280×720 baseline (`UI_SCALE = 1`). At 1920×1080, every
font/panel/gap value multiplies by exactly 1.5 — verified proportional
scaling, not a second hand-tuned layout. This is the direct answer to "does
the rail spec depend on the resolution system": yes, and this convention is
what unblocks writing the rail spec next, since the rail's pixel values are
now `base × UI_SCALE` by construction rather than absolute.

### 4. Fullscreen mechanics (Fullscreen API)
Toggling fullscreen calls the Fullscreen API on `#wrap` (or `canvas`) and,
on the `fullscreenchange` event, calls `setResolution(1920, 1080)` /
`setResolution(1280, 720)` to match. The CSS `width:min(96vw,960px)` rule
in `atomic-dustbin-dan.html` needs updating regardless (it's hardcoded to
the old 960 baseline) — becomes `width:min(96vw, 1280px)` with a
`:fullscreen canvas { width:100vw; height:100vh }` (or similar) override.
Exact CSS is an implementation detail for the Claude Code phase, not
architecture — flagging so it isn't dropped, not specifying it here.

### 5. Where this hooks into Options (future work, not this phase)
`optionsmenu.js` already owns volume sliders + a mute row; a
windowed/fullscreen toggle is a natural addition there later. **Not
building that now** — this spec only lands the `setResolution`/`UI_SCALE`
mechanism and wires it to boot-time default (1280×720) + a fullscreen
toggle trigger point, so the title rail has something real to scale
against. The Options-menu UI for switching resolution is a separate,
later piece of work Paul can slot in whenever.

## What this spec deliberately does NOT change
- World generation, tile size (`CFG.TILE`), camera clamp logic, entity
  rendering — all already correct, confirmed above, zero changes.
- Existing fixed pixel values *inside* screen-space files are not
  hand-retuned in this pass beyond wrapping them in `* UI_SCALE` — no
  aesthetic redesign of pause/options screens here. That's how this stays
  scoped as a rendering-infrastructure change rather than a UI redesign of
  every existing screen. (The *new* title rail is designed fresh against
  `UI_SCALE` from the start, since it's being built anyway — see the
  upcoming rail spec.)

## Phased Claude Code implementation

**Phase 1 — `canvas.js`: live resolution + `UI_SCALE`.**
Convert `VIEW_W`/`VIEW_H` to `export let`; add `setResolution(w,h)` and
`export let UI_SCALE`. Update the HTML canvas attributes to boot at
1280×720. Verify via `node --input-type=module -e "import('./src/canvas.js')"`
— but note this file touches `document.getElementById`, so the real
smoke test is loading the page in-browser and confirming no console errors,
plus checking `VIEW_W`/`VIEW_H`/`UI_SCALE` values at the console.
**Risk:** any file doing `import { VIEW_W } from "./canvas.js"` and
expecting a `const` (e.g. destructuring in a way that snapshots the value)
needs auditing — the grep above shows plain re-exports/reads only, but
Claude Code should re-grep at implementation time in case anything shipped
between now and then.

**Phase 2 — CSS + fullscreen wiring.**
Update `atomic-dustbin-dan.html` CSS for the new 1280 baseline; add
Fullscreen API toggle + `fullscreenchange` listener calling
`setResolution`. Manual browser test: enter/exit fullscreen, confirm canvas
backing store actually changes size (not just CSS stretch) — check via
`canvas.width`/`canvas.height` in devtools, not visual size alone.

**Phase 3 — Retrofit `UI_SCALE` into existing screen-space files.**
`screens.js` (HUD + all title/modal draws), `pause.js`, `optionsmenu.js`,
`wipe.js` (icon size). Mechanical pass: wrap existing literal font
sizes/panel dims in `* UI_SCALE`. This is the highest file-count phase;
should be its own Claude Code session per STATUS.md's "phased, one
change then test" convention, likely split further by file since several
of these (`screens.js` especially) are already near the 24KB ceiling and
this touches nearly every line with a `ctx.font` or panel dimension.

Phases 1–2 are prerequisites for the title rail. Phase 3 (retrofitting
*existing* screens) can happen in parallel with or after the rail work —
it doesn't block it, since the rail is new code built against `UI_SCALE`
from day one regardless of whether old screens have been retrofitted yet.