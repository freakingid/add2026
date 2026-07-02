# Atomic Dustbin Dan — Build Status & Handoff

What is actually built, the decisions behind it, and where the code lives.
Cross-cutting non-negotiables and the roadmap checklist are in **CLAUDE.md**;
design intent is in **GDD.md**. Behavior described here is the source of truth for
*reality*; where it diverges from the GDD, that divergence is intentional and noted.

## Planned changes

Work these **one at a time, then test**. Once a change is built + tested, fold its
decisions into the relevant "Subsystem decisions" entry and remove the entry here.

- Manager self-damage fix (shooter immunity via `firedBy` / `eid`) — COMPLETE
- Scanner beam render prep + Manager berserk-permanence (sim/config only, no renderer
  yet) — COMPLETE. `alarmHold` 0.25→0.5; `CFG.SCANFX` tunables added for a future
  `render-scanfx.js`; Scanner now tracks `e.seesDan`/`e.alarmTargets` per tick (see
  STATUS-SYSTEMS.md "Scanner"); Manager berserk changed from a decaying `berserDur`
  timer to a permanent-until-death `BERSERK_LOCK` sentinel in `combat.js` (see
  STATUS-SYSTEMS.md "Manager"). Convention note: `test-input.js`'s new smoke tests
  were inserted immediately before the existing `console.log(passed/failed)` +
  `process.exit` tail rather than appended after it — appending after `process.exit`
  would make the new assertions dead code that never runs and never affects the
  pass/fail exit code.
- Scanner beam renderer — COMPLETE. New `render-scanfx.js` (`drawScanFX`, ~2.5KB)
  draws, inside the world transform just before `drawEnemies()`: a translucent
  glowing BLUE beam Dan→Scanner with ">" chevrons flowing toward the Scanner whenever
  `e.seesDan` is true, and translucent glowing RED beams Scanner→each `e.alarmTargets`
  entry with chevrons flowing toward those robots. Pure visual, no LOS logic of its
  own — reads only `e.seesDan`/`e.alarmTargets` (set live in `enemies-ai.js`), so it
  gates correctly every frame with zero duplicated geometry checks. Tunables in
  `CFG.SCANFX` (widths, chevron spacing/speed/font, per-color core/glow/arrow rgba).
  `render.js` gained one import + one `drawScanFX()` call (before `drawEnemies()`,
  so beams sit under sprites) — now 23,527 bytes, still under the 24KB ceiling.
  Verified in-browser via Playwright (no debug level-skip key exists in `input.js`;
  reached L8 by calling `level.buildLevel()` after forcing `G.level = 8` through a
  dynamic import): with real wall-gated LOS (`world.hasLineOfSight`), the beam
  renders correctly across open floor and disappears completely the instant Dan is
  behind a wall tile — confirmed by first naively flipping `seesDan` by hand, which
  the AI tick immediately overwrote back to `true` since the enemies were still in
  open LOS, proving the renderer is reading live per-frame state rather than a stale
  flag. Console clean, no errors, level intro completes normally.
- Resolution rail Phase 0a (`canvas.js` live resolution + `UI_SCALE`) — COMPLETE.
  `canvas.js` now boots the backing store at 1280×720 (was 960×640, set via the
  `<canvas>` tag's `width`/`height` attributes in `atomic-dustbin-dan.html`).
  `VIEW_W`/`VIEW_H` changed from `const` to `let` (still exported under the same
  names — every one of the 12 importing modules only reads them, confirmed by grep,
  so this is a safe widening) plus a new `setResolution(w, h)` function and a
  derived `UI_SCALE` export (`w / 1280`, currently `1` since nothing calls
  `setResolution` yet). Verified in-browser via Playwright: title screen renders,
  `[1] ENDLESS SHIFT` reaches Level 1 with intro complete, Dan moves and the camera
  pans correctly at the larger view, zero console errors. Screen-space UI (HUD text,
  panels, menus) is NOT yet retrofitted to `UI_SCALE` — it renders at its old fixed
  pixel sizes, so it now looks small and off-center against the bigger canvas. That
  retrofit is Phases 2/3 of the resolution-rail work; this is expected mid-migration
  state, not a bug.
- Resolution rail Phase 0b (fullscreen wiring) — COMPLETE. `atomic-dustbin-dan.html`'s
  CSS: `#wrap` width `min(96vw,960px)` → `min(96vw,1280px)`; `aspect-ratio` on
  `canvas` fixed from stale `3/2` (960:640's ratio) to `16/9` (matches the
  1280×720/1920×1080 targets — this was a latent bug from Phase 0a, which only
  touched the `<canvas>` tag attributes, not this CSS rule). New `#wrap:fullscreen`
  + `#wrap:fullscreen canvas` rules center/letterbox the canvas at real screen size
  in fullscreen (canvas keeps `aspect-ratio:16/9`, height-driven, border/radius
  stripped). `toggleFullscreen()` added to `input.js` (calls
  `document.getElementById("wrap").requestFullscreen()` /
  `document.exitFullscreen()`; `#wrap` is the fullscreen target, not the canvas
  alone, so the CSS rule above applies) and bound to key **`G`** (confirmed free —
  checked `CFG.KEYS` + every `keys["..."]` site in `input.js`/`menuedge.js`/
  `pause.js` — against WASD/O;LK/E,F/M/V/arrows/Space/Enter/Escape/Backspace; Paul
  chose `G` over `F` — `F` is already Dustbin special — via AskUserQuestion). A
  `fullscreenchange` listener calls `setResolution(1920,1080)` on entry and
  `setResolution(1280,720)` on exit — standard (unprefixed) Fullscreen API only,
  no Safari `webkit`-prefixed fallback (Paul's call via AskUserQuestion; revisit if
  cross-browser support becomes a priority). Verified in-browser via Playwright:
  page loads at 1280×720 with zero console errors; clicking the canvas (user
  gesture) then pressing `G` actually enters fullscreen (`document.fullscreenElement`
  truthy) and live-resizes the canvas backing store to 1920×1080 via the
  `fullscreenchange`→`setResolution` wiring — not just a CSS stretch; exiting
  fullscreen reverts it to 1280×720. `input.js` is now **23,638 bytes — within
  ~360 bytes of the 24KB soft ceiling; flag before the next edit to this file.**
- Resolution rail Phase 1 (`screens-title.js` split) — COMPLETE. Pure mechanical
  extraction, zero pixel/behavior changes. New `src/screens-title.js` (10,864
  bytes) holds `drawTitle`, `drawTitleBackdrop`, `drawTitleLogo`,
  `drawWeeklyPanel`, `_drawTitleLoadScreen`, `drawTitleModeSelect`,
  `drawTitlePlaylistPicker`, `_drawTitleMenuHighlight` — moved verbatim from
  `screens.js` (now 14,384 bytes, down from 24,695, which was already over the
  24KB ceiling before this split). `GOLD` (`#ffd24a`) is used by both files
  (`drawWeeklyPanel` here, `drawPostLevelModal`/`drawLifetimeModal` in
  `screens.js`), so it stays defined in `screens.js` as `export const GOLD` and
  `screens-title.js` imports it from there — no duplication.
  `drawFireLegend` stays in `screens.js` (confirmed: no title-phase function
  calls it; it's still consumed by `optionsmenu.js`'s keyboard controls pane).
  `screens.js` keeps `drawHUD`, `drawLevelClear`, `drawPostLevelModal`,
  `drawFireLegend`, `drawLifetimeModal`, `drawGameOver`, `GOLD`.
  `render.js`'s import of `drawTitle` now points at `./screens-title.js`
  (the other four screens.js imports — `drawHUD`/`drawLevelClear`/
  `drawGameOver`/`drawLifetimeModal` — are unchanged). No circular import:
  `screens-title.js` → `optionsmenu.js` (for `drawOptions`, one-way, same as
  before the split) and `screens-title.js` → `screens.js` (for `GOLD`);
  `optionsmenu.js` does not import `screens-title.js` at all, confirmed by
  grep before writing any code, so its "must NOT import input.js/pause.js"
  constraint isn't touched. Verified in-browser via Playwright: zero console
  errors across the full flow — title (weekly panel renders), Options
  (`O` key, delegates to `drawOptions` correctly), mode select (`SPACE` then
  reaching `_titlePhase === "mode"`, ENDLESS SHIFT row highlighted), and
  starting a run (`1`) reaches Level 1 with the intro complete, HUD ticking,
  Dan/terminals/exit all rendering — exercising every moved function in one
  pass. `node --check` (works fine on ES module syntax, despite this phase's
  prompt assuming otherwise) passed clean on both files; identifier-vs-import
  cross-check found no unused or missing imports in either file. Both files
  are well clear of the 24KB ceiling. `drawWeeklyPanel`/`drawTitle` still use
  the OLD (pre-`UI_SCALE`) fixed pixel layout, unchanged by this phase — the
  next phase retrofits the layout itself.
- Resolution rail Phase 2 (`screens-title.js` rail rebuild) — COMPLETE. Per
  `SPEC-title-rail.md`'s "Layout" section, `drawWeeklyPanel()` and the
  "input"-phase body of `drawTitle()` rewritten to the two-zone layout: a
  right rail (`RAIL_W = 460*UI_SCALE`, right-anchored via
  `railX = VIEW_W - RAIL_W`, full height) and a left/center zone
  (`VIEW_W - RAIL_W` wide, content centered within *that* zone's midpoint,
  not full-canvas center — the visual change from the old centered-on-full-
  canvas title). Every spec pixel value multiplied by `UI_SCALE` at draw
  time (newly imported from `canvas.js`); no literals left over from the old
  fixed layout. `drawWeeklyPanel(railX, oy, railW, railH)` gained two params
  (`railW`/`railH`) vs. the old `(ox, oy)` two-arg form — full-height panel
  now, not just an achievement-row stack — and draws: translucent bg + 1px
  left hairline border (stays 1px, doesn't scale — per spec), header row
  (`WEEKLY ACHIEVEMENTS` label + `N/target` progress chip reusing the
  `meta_eotw` entry's `progress`/`target` fields, unchanged derivation from
  before), 5 weekly rows + EOTW row vertically centered in remaining rail
  height with per-row dividers, and a footer (`VIEW ALL ACHIEVEMENTS` /
  `[V]` hint). Progress bars render `progress/target` as a fraction-of-width
  fill (per Paul's locked decision in the phase prompt: option 1 from the
  spec's flagged N/5-vs-N/1 mismatch — cosmetically a binary checkbox today
  since `target` is always 1 for weeklies, but written as a true fraction so
  it degrades gracefully for free if any weekly ever gets `target > 1`).
  Description text now word-wraps (`_wrapText` helper) instead of single-
  line truncating, since the new `23*UI_SCALE`px name size needed the extra
  vertical room the old compact rows didn't have. Added two small helpers,
  `_roundRect` (chip/bar rounded-rect paths) and `_weeklyRowHeight`
  (approximate row height for the centering pass only — the actual draw
  loop uses its own absolute `cy` math per row, so the estimate only affects
  vertical centering, not layout correctness). No new input handling
  added — confirmed `pollModals()` (`input.js`) already reads `keys["v"]`
  via `_modalHeld('view', mode)` and is called every frame from
  `update.js`, unchanged by this phase. The stale `GOLD` import (used by the
  old checkmark-style row, no longer needed now the rail uses its own
  chip/fraction/bar styling) was dropped from `screens-title.js` — `GOLD`
  stays defined and used independently in `screens.js`. File is now
  **16,104 bytes** (up from 10,864), still well under the 24KB ceiling.
  Verified in-browser via a scripted headless-Chromium session (no
  Playwright MCP registered in this environment, so the verifying agent
  drove Chromium directly via the `playwright` npm package): zero console
  errors across the full click-through — title screen renders with the
  rail visibly occupying ~36% of canvas width right-anchored (starts
  ~x=818 of 1280) and the left-zone content (logo/tagline/prompts) visibly
  centered around the left zone's own midpoint (~x=422), not full-canvas
  center (~x=640) — confirming the intended "shifted left" layout change;
  Options (`O`), Load Game (`L`), and Mode Select (`SPACE`) all open and
  return to title correctly, unaffected by the layout rewrite. One flow
  (`V` to lifetime modal) did not visibly open during the agent's automated
  keypress — traced by hand afterward to `pollModals()`/`_modalHeld` and
  confirmed the wiring is correct and unchanged (`keys["v"]` read every
  frame via `update.js`'s unconditional `pollModals(dt)` call); most likely
  a headless key-event/focus quirk in the automation itself, not a code
  defect — flagging rather than silently "fixing" code that traces out as
  already correct. Fullscreen (1920x1080) proportional-scaling check not
  automated (`requestFullscreen` needs a real user gesture); the geometry
  is purely `UI_SCALE`-multiplied with no hardcoded absolute pixels left, so
  it should scale correctly by construction, but this is not yet eyeballed
  in-browser at 1920x1080 — flag for a manual check next session before
  calling Phase 2 fully closed on the fullscreen axis specifically.
- **Resolution rail Phase 3 (`screens.js` lifetime + post-level modal
  typography) — COMPLETE.** This closes out the title-rail spec's scope.
  Mechanical retrofit only, per the phase prompt: every fixed `ctx.font =
  "... Npx ..."` and every fixed row-height/padding/offset literal in
  `drawLifetimeModal()` and `drawPostLevelModal()` multiplied by `UI_SCALE`
  (newly imported from `canvas.js` alongside the existing `ctx`/`VIEW_W`/
  `VIEW_H`). Did both functions in one pass (not split into two turns) since
  they're adjacent in the file and share the same mechanical transformation
  plus several constants (`GOLD`, similar row patterns) — no reason to
  separate them. No layout restructuring, no new features, no change to what
  data is shown or how scrolling/grouping works. `drawHUD`, `drawGameOver`,
  `drawLevelClear`'s non-modal branch, and `drawFireLegend` were explicitly
  out of scope for this phase (untouched) — those are `SPEC-resolution-
  system.md` Phase 3 (a broader mechanical pass across the whole codebase),
  a separate, still-open piece of future work, not part of this delivery.
  In `drawLifetimeModal()`, confirmed the scroll-accumulator arithmetic
  (`y`/`lineTop`/`contentH`, feeding `G._lifetimeMaxScroll`) still holds:
  every increment added to `y` inside the loop is now `N * UI_SCALE`
  alongside the draw calls that use it, so `contentH` and `vpH` scale by the
  same factor and the max-scroll fraction is unchanged — verified this
  in-browser rather than just by inspection (see below). File is now
  **15,014 bytes** (up from 14,384), still well under the 24KB ceiling.
  Verified in-browser via a scripted headless-Chromium session (Playwright,
  same approach as Phase 2 — no `chromium-cli`/Playwright MCP registered in
  this environment): drove the real title → lifetime-modal flow (`V` key
  while `_titlePhase === "input"`, i.e. *before* pressing Space/mode-select,
  since `_modalHeld('view', mode)` only opens it from that phase) at both
  1280×720 and 1920×1080 — fonts/rows/badges/progress-bars scale
  proportionally, panel width and position track `UI_SCALE`, nothing
  overlaps or clips at either resolution. Scrolling verified by holding
  ArrowDown and confirming content advances with correctly clipped rows at
  both resolutions. For `drawPostLevelModal()`, real gameplay data wasn't
  practical to trigger headlessly (no exported hook to inject fabricated
  `_levelProgressLog` entries, and scripting a full level-clear via input
  emulation was judged too brittle for this check) — instead drove the
  actual code path directly: a standalone harness page imported `state.js`/
  `events.js`/`achievements.js`, called `initAchievements()`, emitted real
  `level:start` → `worker:rescued` × 5 → `enemy:died` × 10 → `level:end`
  events to populate genuine achievement-progress data (including "NEW!"
  tier-ups), set `G._showAchievementModal = true`, and called the real
  `drawLevelClear()` from `screens.js` at both resolutions. Confirmed
  correct proportional scaling of the panel, header, rows, "NEW!" badges,
  gold progress counts, and footer at both sizes, zero console errors.
  Temp harness files removed after verification; nothing left in the repo.

---

## Current state — what is built

All core systems are complete. The table below is the canonical build status; GDD section references and Subsystem decisions below are the sources of detail.

| System | Status | GDD ref | Key file(s) |
|---|---|---|---|
| Dan — movement, melee, ranged, HP, i-frames | ✅ Built | §2 | `player.js`, `input.js` |
| Power-ups (Rapid / Triple / Bounce) | ✅ Built — pickups expire after `CFG.PICKUP_LIFETIME` (10 s) with strobe/shrink warning in the last `PICKUP_WARN_FRAC`/`PICKUP_WARN_MIN` window | §3 | `player.js`, `config.js`, `level.js`, `render.js` |
| Controls — keyboard+mouse and gamepad | ✅ Built | §4 | `input.js` |
| Atomic Dustbin special | ✅ Built | §5 | `dustbin.js` |
| All 9 enemies + Dispatch Terminal | ✅ Built | `GDD-ENEMIES.md` | `enemies.js`, `projectiles.js` |
| Mixed sandbox level (L10+, all types) | ✅ Built | — | `level.js` |
| Human workers + rescue scoring | ✅ Built | §7 | `workers.js` |
| Vending machines (two variants, single-use) | ✅ Built | §2.5 | `vending.js` |
| Dan status effects (slow, sprayTick) | ✅ Built | — | `player.js` |
| Shared enemy-projectile pool (ebolts) | ✅ Built | — | `projectiles.js` |
| Level Definition format + loader | ✅ Built | §8.1 | `level.js`, `world.js` |
| Hand-authored levels (5 levels) | ✅ Built | §8.1 | `levels/authored-levels.js` |
| Level progression overhaul (MAP_POOL, playlists, mode select) | ✅ Built | — | `level.js`, `state.js`, `input.js`, `screens.js`, `src/playlists.js` |
| Conveyor push mechanic + rendering + hum | ✅ Built | §8.1.2 | `world.js`, `render.js` |
| Screen transition wipe | ✅ Built | — | `wipe.js`, `render.js`, `update.js`, `level.js` |
| Screen flash (last-enemy-cleared VFX) | 🔲 Removed — built then manually reverted; not in current camera-effects scope | — | — |
| Camera effects (shake/zoom/vignettes/flash/desat) | ✅ Built — Phases 0–4 complete and confirmed working in-browser. See "Camera effects — subsystem decisions" below for the full history. | `SPEC-camera-effects.md` | `camerafx.js`, `render-camerafx.js`, `render.js`, `combat.js`, `update.js`, `config.js`, `render-entities.js`, `palette.js`, `effects.js`, `vending.js`, `render-marks.js` |
| Audio — 21 SFX + looping conveyor bed | ✅ Built | §10 | `audio.js` |
| Music — title track + 5 gameplay tracks (9 bars each), scheduler, duck/unduck, bassoon voice, chorus arrival treatments | ✅ Built | §10 | `audio.js` (SFX/buses/re-export; `tone()` + bassoon wave), `music.js` (scheduler + all track data), `level.js`, `update.js`, `input.js`, `pause.js`, `playlists.js` |
| Game states (title / playing / levelclear / dead) | ✅ Built | — | `state.js`, `screens.js` |
| Achievement system | 🔧 In progress — Phase 5 complete | `ACHIEVEMENTS.md`, `ACHIEVEMENT-BLUEPRINT.md` | `events.js`, `achievements.js`, `screens.js`, `render.js`, `audio.js` |
| Pause menu + Save/Load system | ✅ Built | — | `savegame.js`, `pause.js`, `screens.js`, `input.js`, `level.js`, `audio.js`, `update.js`, `render.js` |
| Sprite-art polish | 🔲 Not built | §10 | — |

> Cross-cutting "do not silently change" rules (HP/score persistence, decrement model,
> max-shots formula, bounce, one-type-per-level, global spawn cadence, knockback,
> keyboard mapping) now live in **CLAUDE.md**. The per-subsystem feel decisions below
> stay here, next to the systems they govern.

---

## Subsystem decisions
Decisions are split by concern — open only the file(s) relevant to your task:
- **STATUS-WORLD.md** — controls/input, level loader, conveyors, level progression, wipe, pause, save/load
- **STATUS-SYSTEMS.md** — enemy roster, vending, Atomic Dustbin, workers, mixed level
- **STATUS-AUDIO.md** — SFX, audio buses, music system
- **STATUS-ACHIEVEMENTS.md** — achievement definitions, XP, weekly rotation

---

## Camera effects — subsystem decisions

All of `SPEC-camera-effects.md` (Phases 0–4) is complete and confirmed
working in-browser.

**Phase 2 decay bug.** `updateCameraFx(dt)` was exported from `camerafx.js`
but never called anywhere, so `_elapsed` never advanced and every one-shot
effect (shake/flash/desat) fired once and then stayed at full intensity
forever — including through state transitions (e.g. the death shake
continued behind the "DAN IS DOWN" screen and into the next run). Fixed by
calling `updateCameraFx(dt)` unconditionally at the top of `update(dt)` in
`update.js`, before the paused/state branches — same treatment as
`updateWipe`, and for the same reason: an effect triggered right before a
state flip needs to keep decaying regardless of what state comes next.

**Low-HP vignette.** Two rounds of fixes. First, `lowHpAlpha()` had a bug
re-wrapping `pulse` (already 0..1) into `0.5+0.5*pulse`, which halved and
floored its dynamic range; fixed to use `pulse` directly, and
`lowHpVignetteMaxAlpha` raised 0.30→0.55. That still wasn't visible enough in
practice, because the formula also scaled alpha by `closeness` (proximity to
0 HP) — meaning the vignette was near-invisible right at the moment it first
crossed the threshold and only grew as HP kept falling, which is where most
hits actually land. `closeness` was removed entirely: the vignette is now a
binary threshold trigger at full `lowHpVignetteMaxAlpha` pulse, no ramp.
Threshold itself was also corrected, `lowHpFraction` 0.30→0.25, to actually
match `CFG.DAN_HP: 20` (5/20 HP = 25%, not 6/20 = 30% — the configured
threshold and the stated design intent had drifted apart).

**Powerup punch-zoom.** `powerupPunchZoom` halved (1.045→1.0225, i.e. half
the zoom-in delta above 1.0) — the original read as too strong, making
pickups feel like the main point of the moment rather than a light accent.
The powerup flash (tinted to the pickup's own color, peak alpha 0.18) was
left unchanged — confirmed fine as originally spec'd.

**Cleaner-sick status effect.** Reworked from a screen-space vignette+wobble
(spec'd originally, but never actually visible in-game — worth noting for
anyone reading `SPEC-camera-effects.md`, which still describes the original
design) to a local glow around Dan: `drawCleanerGlow` in
`render-camerafx.js`, called from `render.js` immediately before `drawDan()`
— same "aura drawn behind the sprite" convention as the existing
berserk/alarm auras in `render-entities.js`. `cleanerWobbleOffset`/
`cleanerWobbleMag`/`cleanerWobbleHz` were deleted from `camerafx.js`/
`config.js` entirely; `getShakeOffset()` now returns just
`impactShakeOffset()`. `cleanerSickMaxAlpha` raised 0.16→0.24 to sit in the
same 0.12–0.22 range as the existing auras, for a consistent visual language.
`getCleanerSickAlpha()`/`tickCleanerSick`'s fade-envelope logic is
unchanged — only where it gets drawn moved.

**Manager berserk pulse.** New event `manager:berserk_pulse` (`{ count, x,
y }`) added to `combat.js`, emitted next to the existing berserk-buff loop
that sets `other.berserk` on nearby robots — `camerafx.js` subscribes to
trigger the shake+flash.

**Manager<->Scanner cross-buff exclusion.** Manager on-death pulse
(`combat.js`) and Scanner alarm broadcast (`enemies-ai.js`) now both skip
`other.type === "manager" || other.type === "scanner"` in their buff loops —
neither support type buffs the other's kind anymore. This is a named-type
exclusion (Manager and Scanner specifically), not a general "support types
don't buff support types" category — Scanner<->Scanner alarm stacking and
Manager<->Manager pulse stacking on other bot types (Picker, Forklift, etc.)
is unchanged. Two-line guard each, no new state/render/files; smoke-tested in
`test-input.js` (`testBuffExclusion`).

**Manager berserk enemy visual (Phase 3, DONE).** Buffed robots (`e.berserk >
0`) now get a body-color tint + a subtle shimmy, on top of the existing
orange aura ring (unchanged, still drawn before the per-type dispatch and NOT
wrapped in the shimmy transform — it's already centered on `e.x/e.y` and
shouldn't jitter independently of the sprite). `palette.js` gained
`lerpColor(hexA, hexB, t)`; each of the 9 per-type draw functions in
`render-entities.js` swaps its single dominant chassis `fillStyle` for
`lerpColor(COL.xBody, CFG.CAMERAFX.berserkTintColor, CFG.CAMERAFX.berserkTintAmount)`
when `e.berserk > 0` (only the largest/most visually dominant body fill per
type — accent/trim/panel fills are untouched). The shimmy wraps the existing
per-type dispatch chain in `drawEnemies()` with a `ctx.save()`/
`ctx.translate(jx,jy)`/…`ctx.restore()` using a per-enemy phase offset
(`e.eid * 0.7`) so a mob doesn't shimmy in lockstep; `jx`/`jy` are
render-only and never touch `e.x`/`e.y` — confirmed in-browser (entity
position stays fixed across frames while berserking; only the paint jitters).
Verified in-browser with a spawned 9-type cluster: toggling `e.berserk`
visibly shifts each type's body color toward orange-red and back, with the
manager itself (unbuffed in the test) staying visually unchanged.
`render-entities.js` is now **23,067 bytes** — up from 21,564, and within
~930 bytes of the 24KB soft ceiling; flag before the next edit to this file.

**Vending healing rings (Phase 4, DONE).** `addHealRing(x, y, color)`
(`effects.js`) pushes three `G.marks` entries at staggered starting `life`
(1.00/0.85/0.70, all decaying at the existing 1.6/s rate) so they cascade
rather than pop in sync; each carries a `vy:-22` field, and `updateEffects`
picks that up with one generic `if (m.vy) m.y += m.vy * dt;` line — not
special-cased to `"healRing"`, so any future mark with a `vy` rises the same
way for free. `vending.js`'s `updateVending` calls it right next to the
existing `addFloat`, reusing the same `color` (`COL.vendSmall`/`vendLarge`)
already computed there for the float text — so the ring, the float, and the
machine's own variant all agree visually with no new color logic. Drawn in
`render-marks.js`'s `drawMarks()` as a stroked circle whose radius grows
4→20px and alpha fades with `life`, importing `hexA` from
`render-camerafx.js` rather than duplicating it (both files exist post-Phase
2, so sharing was the cleaner call). This is a pure world-space mark — no
`camerafx.js` involvement, unlike the screen-space effects above.

Confirmed in-browser via a scripted Playwright session (teleporting Dan onto
a vending machine's exact coordinates and reading `G.marks` each frame,
since normal walking would also work but is slower to reproduce
deterministically): three rings visibly cascade outward from Dan's feet and
fully decay within ~500-600ms of contact, tinted green (`#5dff8f`) at the
small machine and cyan (`#5fd2ff`) at the large one, matching the existing
`+N` float color exactly in both cases. Because the ring starts at radius 4
(smaller than Dan's `DAN_RADIUS` 12) and `drawMarks()` runs before `drawDan()`
in the compositor, the ring is initially hidden behind Dan's sprite and only
becomes visible once its growing radius exceeds his — expected layering, not
a bug, and confirmed to read fine once it passes that point; a
Dan-not-glued-to-the-machine screenshot showed a clearly visible cascading
ring.

**Interaction with Cleaner-sick, and a pre-existing duplicate found while
checking it.** Tested rings firing while `G.dan.slow > 0` (Cleaner-sick
active) at the small (also-green) machine — the intended worry per the phase
prompt was two similarly-colored green effects (`cleanerSickColor`
`#9bff7a` vs `COL.vendSmall` `#5dff8f`) overlapping confusingly near Dan.
In practice they're visually distinct enough (glow vs. ring silhouette) not
to read as broken. Separately, and not part of this phase's scope: `drawDan()`
(`render.js` ~line 587) still contains an **older, pre-camera-effects
Cleaner-slow ring** (`COL.spray`/`COL.sprayDark`, a stroked ring + orbiting
droplets) that was apparently never removed when Phase 3's `drawCleanerGlow`
replacement shipped. So a Cleaner-sick Dan currently renders *two*
independent green auras (the old ring in `drawDan` and the new
`drawCleanerGlow` aura), both keyed off the same `G.dan.slow > 0` condition.
Flagging per the "if you break/spot a convention issue, say so" rule rather
than fixing it here — it's in `render.js`, outside this phase's file list,
and predates this session's work.

All of the above is confirmed working in-browser, not just math-checked: the
low-HP vignette, powerup punch/flash, Cleaner glow, dustbin
detonate/bounce/throw shake+flash, worker-died desaturation, death
shake/flash, the Manager berserk tint+shimmy, and the vending healing rings
all decay correctly and don't bleed across state transitions or level
changes.

---

## Architecture map (where things live)

> The game is now **ES modules** under `src/`, loaded by `atomic-dustbin-dan.html`
> (which only imports and runs the delta-timed loop). Run it from a static server
> (e.g. `python3 -m http.server`) — `file://` blocks module loads. All mutable
> run/level state lives on the single `G` object in `state.js`; modules read &
> mutate `G.dan`, `G.shots`, … (ES modules can't reassign an imported binding, so
> whole-value resets like `G.shots = []` happen in `level.js`).

**Module layout** (leaf-first; arrows = imports):

- **`config.js`** — `CFG` (incl. `CFG.KEYS` cardinal assignments + `CFG.GAMEPAD` deadzones/button indices, `CFG.TILES` per-type tile flags, `CFG.GEN_COLS/ROWS` procgen size, `CFG.CONVEYOR_SPEED`, `CFG.PICKUP_LIFETIME`/`PICKUP_WARN_FRAC`/`PICKUP_WARN_MIN` pickup expiry, `CFG.CAMERAFX` — all shake/flash/vignette/desat tuning values, Camera-effects Phase 0), `ENEMY` (per-type stat table + ranged stats), `POWERUPS`/`POWERUP_KEYS`, `LEVEL_PLAN`. `CFG.DUSTBIN.throwSpeed`/`friction` retuned (300→460 / 2.2→1.5, Camera-effects Phase 0) so a thrown dustbin travels ~2.3× farther before settling. Pure data. *No imports.*
- **`palette.js`** — `COL`, `TERMINAL_TINT`. *No imports.*
- **`canvas.js`** — `canvas`, `ctx`, `VIEW_W/H`. *No imports.*
- **`audio.js`** — Web Audio SFX (GDD §10): the `sfx.*` sound library + `tone`/`noise`/`sequence` synth helpers (exported; used by `music.js`), lazy AudioContext + `master`/`sfxBus`/`musicBus` gains (`getCtx()`/`getMusicBus()` accessors for `music.js`), `unlock`/`toggleMute`/`isMuted`, per-sound throttle, re-exports `music` from `music.js`. ← config (`CFG.AUDIO`) only. Called for its side-effects from player/combat/projectiles/enemies/dustbin/level/vending/workers/update; `unlock`+`toggleMute` from input.
- **`music.js`** — Music scheduler + all track data: bar-by-bar look-ahead scheduler (`_tickMusic`/`_scheduleBar`; passes `filt`/`hold` through to `tone()`), `TRACK_TITLE` (8-bar title loop), 5 gameplay tracks (`T_BOUNCY`/`T_RAMPAGE`/`T_SOAP`/`T_BLUES`/`T_MANIA`) each with **9 bars** (3 verse → 1 fill → 4 chorus → 1 return; Phase 3), `TRACKS` array, and the exported `music` object (`playTitle`/`playGameplay`/`stop`/`fadeOut`/`duck`/`unduck`/`isPlaying`). ← audio (`tone`/`noise`/`getCtx`/`getMusicBus`), config. Re-exported by `audio.js` so all call-sites import from `"./audio.js"` unchanged.
- **`state.js`** — `G` (the mutable container: run meta + entities `dan/shots/enemies/terminals/pickups/marks/floats/ebolts/vending/dustbin/dustbinPickups/workers/camera/exit` + `spawnTimer`/`pickupTimer` + `inputMode`) and `levelType()`. ← config.
- **`world.js`** — `map[][]` (exported `let`, char grid, reassigned only by `loadTileGrid`) + the §8.1 loader primitives: **`loadTileGrid`** (grid→`map`, sets `CFG.COLS/ROWS`), **`bakeConveyors`**/**`pushField`**/**`pushAt`** (per-cell push field) + the consume-side helpers **`pushAtWorld`** (push at a body's cell), **`applyBeltPush`** (additive belt move for a ground body; skips fliers), **`clampNet`** (Dan's move+belt net-speed clamp), and `CFG.TILES`-driven `isWall`/`blocksLOS`/`isDestructible`. Plus `randomFloorTile`/`randomFloorTileTC`/`randomFloorTileNearWall` (wall-adjacent tile for flush placement)/`hasLineOfSight`/`destroyShelf` (destructible-only), collision `bodyHitsWall`/`moveBody`, tile helpers `tileFloor`/`tileCenter`/`tileClearRun`/`rectPerimeterClear`, `clamp`, `isBorderTile`. ← config, state. (No longer imports canvas — decoupled from the DOM.)
- **`effects.js`** — `addFloat`, `addHealRing(x, y, color)` (Camera-effects Phase 4: pushes 3 staggered-life `"healRing"` marks for the vending heal cascade), `updateEffects` (marks + floats lifetimes; the marks loop moves any mark with a `vy` field — generic, not `"healRing"`-specific). ← state.
- **`menuedge.js`** — shared menu edge-detection for title + pause Options/Controls navigation: `menuHeld(action, pad, inputMode)` (up/down/left/right/confirm/back; kb+gamepad, routes by `inputMode`) and `makeEdgeTracker()` (returns an instance-scoped `{edge, refresh}` so title and pause each get their own `_prev{}`). Pure leaf — registers its own `_keys{}` via its own listeners (same pattern as `pause.js`'s circular-import workaround) rather than importing from `input.js`/`pause.js`. *No imports.* Not yet wired into title or pause.
- **`combat.js`** — shared damage/death: `hitDanRanged`/`hitDanArea` (i-frame + knockback), `meleeContact` (0-dmg-safe; `berserDmgBonus` when berserk), `damageEnemy` (friendly-fire damage → no-score kill), `killEnemy(index, {score})` (points + score float unless `score:false`; Manager berserk pulse either way — emits `manager:berserk_pulse` with `{count, x, y}` next to the existing berserk-buff loop, Camera-effects Phase 1, for `camerafx.js` to trigger shake+flash), `destroyTerminal`. ← config, palette, state, effects, events.
- **`projectiles.js`** — the `G.ebolts` pool: `fireEnemyBolt/Arc/Drop/Homing` + `updateEbolts` dispatching by `kind` (`bolt`/`arc`/`drop`/`homing`; `updateArc/Drop/Homing` helpers, `detonateHoming` blast). `bolt`/`homing` also friendly-fire ground robots (skip fliers/terminals) via `damageEnemy`. ← config, state, world, combat.
- **`enemies.js`** — `spawnEnemy` (per-type init; assigns unique `e.eid` counter), `updateEnemies` (dispatch + melee contact via `combat`), `buffSpd` (combined Manager-berserk + Scanner-alarm speed mult), Cleaner/Scanner patrol routing (`nearestWaypoint`/`buildCleanerPatrol`/`advancePatrol`) + Cleaner spray helpers (`danInSprayCone`/`coneRayDist`(exported, also clips the rendered cone)/`applySpray`). ← config, state, world, combat, projectiles, **workers** (`killWorker`, for the Inventory Bot), **dustbin** (`vortexHold`, for the attract phase), **enemies-ai**.
- **`enemies-ai.js`** (NEW split from enemies.js) — per-type AI updaters: `updatePicker`/`updateForklift`/`updateSecurity`/`updateSorter`/`updateCleaner`/`updateDrone`/`updateManager`/`updateScanner`/`updateInventory`. ← config, state, world, combat, projectiles, workers, effects, enemies (patrol helpers + `buffSpd` + `danInSprayCone`/`applySpray`).
- **`level.js`** — run lifecycle + the §8.1 **generator** and **loader**. `newGame` (full reset) → `buildLevel` = `loadLevel(generateLevelDef())` → `nextLevel`. `generateLevelDef` emits a Level Definition (tile grid + zones + fixed player/exit + spawn rules; single-type, Manager/Scanner +Picker cluster, or the `"mixed"` all-types branch). `loadLevel` (exported, the ONLY level entry point) validates (`validateLevelDef`), parses tiles, bakes conveyors, resolves placements, and runs spawn rules (`runSpawnRule` + `pickTile`/`pickWallTile` zone placement honoring `avoid`/non-solid). Keeps HP/powerups/score/carried-dustbin. Also spawner-terminal emission `spawnFromTerminal`/`spawnWave`; pickups `spawnPickup`/`updatePickups`. ← config, state, world, enemies, vending, dustbin, effects.
- **`vending.js`** — `spawnVendingMachine(variant, spot)` (builds one flush-against-wall cabinet at a wall-adjacent spot the loader picks) + `updateVending` (contact trigger, maxHp-capped heal, single-use depletion; calls `addHealRing(G.dan.x, G.dan.y + 10, color)` next to the existing `addFloat`, Camera-effects Phase 4). ← config, state, world (`tileCenter`), effects, palette. Called from `level.js` (loader's vending spawn rules) and `update.js` (update); drawn by `render.js`.
- **`dustbin.js`** — the Atomic Dustbin special (GDD §5): `spawnDustbinPickup(pos)` (one floor pickup; the loader's atomicDustbin rule drives count/rarity), `updateDustbin` (collect + deploy E/F + slide→attract→detonate state machine), `vortexHold` (the attract-phase pull, called from `enemies.js`). ← config, state, **input** (`isDeploySpecial`/`getMoveVec`), world (`moveBody`/`isWall`), combat (`killEnemy`), effects, palette. Called from `level.js` (loader) and `update.js` (update); drawn by `render.js`. NB: `dustbin → input → level → dustbin` is an import cycle, but every cross-module use is inside a function (runtime), so module evaluation is safe.
- **`workers.js`** — `updateWorkers` (wander/avoid + rescue-on-contact), `rescueWorker` (escalating points + counter + callout), and `killWorker` (exported; Inventory Bot's no-points worker kill). ← config, palette, state, world, effects.
- **`input.js`** — device-agnostic input layer. Exports `getMoveVec()`/`getFireAngle()`/`isDeploySpecial()` (route by `G.inputMode`), `pollGamepad()` (called from `update.js`; also drives the title's Options screen via `pollTitleOptions()` + `optionsmenu.js`'s `handleOptionsEdge`), `toggleFullscreen()` (Phase 0b: `#wrap.requestFullscreen()`/`document.exitFullscreen()`), and the raw `keys`/`mouse` (mouse aim, `M` mute, debug). Registers key/mouse/touch listeners on import (side-effect), unlocks audio on the first gesture, binds `M` = mute, `G` = fullscreen toggle, "o" opens title Options, and starts/restarts runs via `startRun(mode)`; also registers a `fullscreenchange` listener that calls `setResolution(1920,1080)`/`setResolution(1280,720)` on enter/exit. ← config, canvas (`setResolution`), state, level (`newGame`), audio (`unlock`/`toggleMute`), optionsmenu (`openOptions`/`handleOptionsEdge`/`optionsScreen`). **23,638 bytes — within ~360 bytes of the 24KB ceiling, flag before next edit.**
- **`player.js`** — `updateDan` (slow move-scaling, decays `slow`/`sprayTick`), `fireVolley`/`fireBubble`, `updateShots` (bubble↔enemy↔terminal). ← config, state, input, world, combat.
- **`camerafx.js`** (NEW, Camera-effects Phase 1) — pure math/state leaf for camera & screen feedback effects (`SPEC-camera-effects.md`): shake (`shake`/`tickShake`/`currentShakeMag`/`impactShakeOffset`, "take the stronger, don't stack" semantics), zoom-punch (`punchZoom`/`tickZoom`/`currentZoom`), the sustained low-HP vignette (`lowHpAlpha`/`getLowHpAlpha` — polled live from `G.dan` each frame, not a timer; binary threshold trigger, see "Camera effects — subsystem decisions"), the Cleaner-sick fade envelope (`tickCleanerSick`/`getCleanerSickAlpha` — now drives a local glow drawn in `render-camerafx.js`, not a screen effect here), the one-shot flash queue (`flash`/`tickFlashes`/`getFlashLayers`), and the worker-died desaturation pulse (`pulseDesat`/`tickDesat`/`getDesatAlpha`). `updateCameraFx(dt)` ticks all of the above and is called unconditionally from `update.js` (every state, mirrors `updateWipe`). Subscribes to `events.js` at module-load time (side effect on import) for `player:died`, `dustbin:detonated`, `dustbin:bounced`, `dustbin:thrown`, `manager:berserk_pulse`, `worker:died`, `powerup:collected`. Zero canvas involvement by design — `render-camerafx.js` reads these getters to draw. ← config (`CFG.CAMERAFX`, `POWERUPS`), state, events.
- **`update.js`** — `update(dt)` orchestrator: `updateWipe(dt)` + `updateCameraFx(dt)` first, unconditionally in every state (camera effects must keep decaying through state transitions — see "Camera effects — subsystem decisions"), then `pollGamepad()`, then (when playing) Dan → shots → **dustbin** → spawn → enemies → ebolts → pickups → vending → workers → effects → camera + `updateCamera` + spawn/terminal/exit/death bookkeeping. ← state, config, input (`pollGamepad`), player, enemies, projectiles, workers, vending, dustbin, level, effects, world, canvas, wipe (`updateWipe`), camerafx (`updateCameraFx`).
- **`render-entities.js`** — enemy sprites only: `drawEnemies` (per-type sprites + berserk aura). ← canvas, state, config, palette, enemies (`coneRayDist`).
- **`render-ebolts.js`** (NEW split from render-entities.js) — `drawEbolts` (all projectile kinds: bolt/arc/drop/homing). ← canvas, state, config, palette. Imported by `render.js`.
- **`render-marks.js`** (NEW split from render.js, Camera-effects Phase 0) — `drawMarks` (the `"berserk"`/`"blast"`/`"debris"`/default-soap/`"healRing"` mark kinds; `"healRing"`, Camera-effects Phase 4, added last for the vending heal cascade — a stroked circle growing 4→20px radius, alpha faded via the imported `hexA`). ← canvas, state, config, render-camerafx (`hexA`). Imported by `render.js`.
- **`screens.js`** — `drawHUD` / `drawLevelClear` (+ `drawPostLevelModal`) / `drawFireLegend` (exported for reuse by `optionsmenu.js`) / `drawLifetimeModal` / `drawGameOver` (continue prompt keyed to `G.inputMode`) / `export const GOLD`. Title screens (`drawTitle` and its sub-phases) moved out to **`screens-title.js`** (Resolution rail Phase 1) — this file is now **15,014 bytes** (Resolution rail Phase 3 retrofitted `drawLifetimeModal`/`drawPostLevelModal` typography to `UI_SCALE`; up from 14,384, down from the original 24,695 pre-split). `drawHUD`/`drawGameOver`/`drawLevelClear`'s non-modal splash/`drawFireLegend` still use fixed pixel sizes, out of scope for Phase 3 — that retrofit is `SPEC-resolution-system.md` Phase 3 (separate, still open). ← canvas (incl. `UI_SCALE`), state, config, palette, achievements (`getLevelAchievementSummary`/`getLifetimeAchievements`).
- **`screens-title.js`** (NEW, Resolution rail Phase 1, split from `screens.js`; rail rebuilt Phase 2) — `drawTitle` (device-select screen offers "SPACE — KEYBOARD" / "A / START — GAMEPAD" plus muted "O — OPTIONS" / "X — OPTIONS (GAMEPAD)" hints; `_titlePhase === "options"` delegates to `optionsmenu.js`'s `drawOptions`) + its sub-phase draws `drawTitleBackdrop`/`drawTitleLogo`/`drawWeeklyPanel`/`_drawTitleLoadScreen`/`drawTitleModeSelect`/`drawTitlePlaylistPicker`/`_drawTitleMenuHighlight`. **16,104 bytes.** ← canvas (incl. `UI_SCALE`), state, palette, achievements (`getWeeklyAchievements`/`getXP`), savegame (`listSaves`), optionsmenu (`drawOptions`; one-way — `optionsmenu.js` does not import this file). No longer imports `GOLD` from `screens.js` (dropped, unused post-rail-rebuild). The "input" phase now uses the two-zone `UI_SCALE`-relative layout from `SPEC-title-rail.md` (right rail + left/center zone) — see "Resolution rail Phase 2" above for the full breakdown; the `drawTitleModeSelect`/`drawTitlePlaylistPicker`/`_drawTitleLoadScreen` sub-phases are unchanged, still full-canvas-centered (out of this phase's scope).
- **`optionsmenu.js`** — shared Options + Controls screens: `openOptions`/`openControls`/`optionsScreen`/`defaultPane`/`handleOptionsEdge`/`drawOptions`. Owns the volume sliders + mute row (moved from `pause.js`) plus a 5th "CONTROLS ▸" row, and a Controls sub-screen (keyboard/gamepad pane toggle). Keyboard pane (Phase 5): FIRE grid (via imported `drawFireLegend`) + a matching MOVE 3×3 grid (WASD + arrow glyphs, same cell/stroke style), OTHER (E/F Dustbin, ESC Pause, M Mute, SPACE Start) and MOUSE (aim/fire) label columns below; panel sized 460×460 to fit. Gamepad pane (Phase 6, DONE): static flat-palette controller schematic (body/sticks/d-pad/face buttons/bumpers+triggers/Start pill) with leader lines to MOVE / AIM·FIRE / ATOMIC DUSTBIN / START·PAUSE / BACK labels. `pause.js` delegates nav/draw here instead of owning options state directly; reachable from the title too (see STATUS-WORLD "Pause menu + Save/Load system"). ← canvas, palette, state, audio (volume/mute getters+setters), savegame (`savePrefs`), screens (`drawFireLegend`). Must NOT import `input.js`/`pause.js`/`screens-title.js` (the latter imports `optionsmenu.js`, one-way).
- **`render.js`** — `render()` compositor + world/entity draws (`drawFloor`/`drawWalls`/`drawExit`/`drawExitPointer`/`drawVending`/`drawDustbins`(floor pickups + sliding canister + attract vortex, via `drawDustbinCan`)/`drawTerminals`/`drawShots`/`drawPickups`/`drawWorkers`/`drawFloats`/`drawDan` incl. carried-dustbin cue). `drawMarks` moved to `render-marks.js` (Camera-effects Phase 0, freeing headroom under the 24KB module-split convention). Camera-effects Phase 2 wired in zoom/shake (camera-translate line) + `drawDesaturation()`/`drawVignettes()`/`drawFlashes()` calls (from `render-camerafx.js`), plus `drawCleanerGlow(G.dan.x, G.dan.y)` immediately before `drawDan()` — **now 23,350 bytes, within ~1.2KB of the 24KB ceiling; watch this file on the next edit.** `drawTitle` now imported from `screens-title.js` (Resolution rail Phase 1); the other screens.js imports unchanged. ← canvas, state, config, palette, world, render-entities, render-ebolts (`drawEbolts`), render-marks (`drawMarks`), render-camerafx (`drawVignettes`/`drawFlashes`/`drawDesaturation`/`drawCleanerGlow`), camerafx (`getZoomScale`/`getShakeOffset`), screens, screens-title.
- **`render-camerafx.js`** (NEW, Camera-effects Phase 2) — the `ctx` drawing calls for `camerafx.js`'s getters: `drawVignettes()` (low-HP radial gradient only — Cleaner-sick was reworked to a local Dan-glow, see "Camera effects — subsystem decisions"), `drawFlashes()` (one-shot flash-layer queue), `drawDesaturation()` (worker:died world-space saturation wash), `drawCleanerGlow(x, y)` (Cleaner-sick's replacement: a soft aura around Dan, drawn behind his sprite same as enemy berserk/alarm auras), plus a local `hexA(hex, alpha)` helper. Mirrors the `render-entities.js`/`render-ebolts.js` split-from-`render.js` pattern; no state of its own. ← canvas, camerafx, config.
- **`atomic-dustbin-dan.html`** — entry: imports `update` + `render` (+ `input` for its listeners) and runs the delta-timed `loop`. Nothing else.

---

## Testing scaffolding to replace with real GDD behavior later

- Power-up pickup respawn (`CFG.PICKUP_RESPAWN` / `MAX_PICKUPS`).
- Atomic Dustbin floor placement is L1-guaranteed + `CFG.DUSTBIN.spawnChance` 0.5 elsewhere (now expressed as the generator's `atomicDustbin` rule `count`); real "rare" weighted placement is a generator tuning pass.
- Terminal counts + per-type `spawners`/`preplace`/`interval`/`max` are test tuning; real difficulty mix (multiple types per level, scaling) comes with GDD §8.3. These now live as the generator's terminal **spawn rules** — §8.3 changes the generator, not the loader.
- The generator's geometry is still the simple shelf-row test layout fed through the §8.1 loader; **richer shelf structure / guaranteed-placement procgen** is a generator-side pass (the loader contract is done).

---

See STATUS-ACHIEVEMENTS.md for achievement system decisions.