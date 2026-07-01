# SPEC — Options-from-Title, Mode-Select fixes, Controls screens

Covers three TODOs. One shared idea runs through all of them: a **single Options
surface** (volume + a CONTROLS entry) that is reachable from **both** the title
screen and the pause menu, plus **two Controls panes** (keyboard+mouse, gamepad)
with tab-switching and consistent ESC/B back-navigation.

The existing Options screen lives *inside* `pause.js`. Because both `pause.js`
(23.6 KB) and `screens.js` (23.1 KB) are already at the project's 24 KB split
line, and both TODO 1 and TODO 3 need Options/Controls from *two* entry points,
the clean move is to **extract Options into a new shared leaf module and add the
Controls panes there too**. That relieves size pressure on both files instead of
adding to it.

New module: **`src/optionsmenu.js`**. It owns the Options screen, the two Controls
panes, and a tiny internal navigation stack. It does **no input detection of its
own** — the caller forwards already-detected edge actions. This keeps it free of
the circular-import / duplicate-listener tangle (`pause.js` and `input.js` each
already run their own key listeners; we do NOT add a third set).

---

## Contract: `optionsmenu.js`

Module-local state (none on `G`):
```
let _screen = "options";        // "options" | "controls"
let _pane   = "keyboard";       // "keyboard" | "gamepad"  (controls only)
let _optCursor = 0;             // 0=master 1=music 2=sfx 3=mute 4=CONTROLS
```

Exports:
- `openOptions()` — reset `_screen="options"`, `_optCursor=0`, pull current
  volumes from audio getters (moved verbatim from pause's OPTIONS case).
- `openControls(startPane)` — set `_screen="controls"`, `_pane=startPane`.
- `optionsScreen()` — returns `_screen` (so the caller knows nav depth).
- `handleOptionsEdge(action, heldLeft, heldRight)` — the entire nav+adjust logic.
  `action` ∈ `{up,down,left,right,confirm,back}` (edge-triggered by caller);
  `heldLeft/heldRight` are booleans for continuous slider drag. **Returns**:
  - `"exit"` when the user backs out of the top-level Options screen (caller
    should return to its own context — pause menu, or title input phase),
  - `null` otherwise.
- `drawOptions()` — draws whichever of the two screens is active
  (`_screen==="options"` → volume panel + CONTROLS row; `"controls"` →
  `_drawControlsPane(_pane)`).

### `handleOptionsEdge` behavior

**When `_screen === "options"`:**
- `up`/`down`: move `_optCursor` over **5 rows** (0-3 as today + row 4 = CONTROLS).
- `left`/`right` (edge) and `heldLeft`/`heldRight` (continuous): adjust the focused
  slider for rows 0-2 exactly as pause.js does today (0.005 step, clamp 0..1, call
  the matching `setMasterVolume`/`setMusicVolume`/`setSfxVolume`, then `savePrefs`).
- `confirm` on row 3 → `toggleMute()`.
- `confirm` on row 4 (CONTROLS) → `openControls(defaultPane())` where
  `defaultPane()` returns `G.inputMode === "gamepad" ? "gamepad" : "keyboard"`
  (falls back to `"keyboard"` when `inputMode` is null on the title).
- `back` → return `"exit"`.

**When `_screen === "controls"`:**
- `confirm` (or `left`/`right`) on the "SWITCH TO … CONTROLS" tab button toggles
  `_pane` between `"keyboard"` and `"gamepad"`.
- `back` → set `_screen="options"` (pop one level), return `null`.

> This is the "ESC/B backs out one level" rule from the TODO, centralized.

### Drawing

- `drawOptions()` when `_screen==="options"`: reuse the existing pause `_drawOptions`
  panel (sliders + mute), and ADD a 5th selectable row **"CONTROLS ▸"**. Cursor
  highlight extends to row 4.
- `drawOptions()` when `_screen==="controls"`: draw the active pane, a header
  ("KEYBOARD & MOUSE" / "GAMEPAD"), a footer tab button ("▸ GAMEPAD CONTROLS" /
  "▸ KEYBOARD CONTROLS"), and a back hint ("ESC / B — BACK").
- `_drawKeyboardPane()`:
  - **Fire grid** — reuse the existing `drawFireLegend` visual (move it here, or
    keep it exported from screens.js and import it; see Phase 4 note).
  - **Movement grid** — a second 3×3 grid in the same style: `W+A W W+D / A · D /
    S+A S S+D` with arrow glyphs, header "MOVE".
  - **Other keys** (list rows): `E / F — ATOMIC DUSTBIN`, `ESC — PAUSE`,
    `M — MUTE`, `SPACE — START` (context-appropriate).
  - **Mouse** row: "MOUSE — AIM · LEFT-CLICK — FIRE".
- `_drawGamepadPane()`: static schematic (Phase 5) — rounded body, left stick,
  d-pad, right stick, 4 face buttons, LB/RB/LT/RT, Start — with leader lines to
  labels: LEFT STICK→MOVE, RIGHT STICK→AIM/FIRE, BUMPERS/TRIGGERS→ATOMIC DUSTBIN,
  START/A→PAUSE-START, B→BACK. Style: same flat rect+stroke palette as the fire
  legend (`COL.soap` strokes, `#232a34` fills, `COL.amber` accents). No gradients.

---

## TODO 1 — Options reachable from the Title screen

Today `openPause()` is gated to `G.state === "playing"` in both `input.js` keydown
and `pollGamepad`. There is no title→options path at all.

Add a new title phase **`G._titlePhase = "options"`** (parallel to `"load"`):
- **Enter:** on the title *input* phase, `O` key (keyboard) or **BTN_VIEW (X, btn 2)**
  on gamepad → `optionsMenu.openOptions(); G._titlePhase = "options";`.
  (X is already the "view" affordance on the title per `CFG.GAMEPAD.BTN_VIEW`; the
  title hint text should show it — see TODO 3.)
- **Drive:** while `_titlePhase === "options"`, route edges from *both* devices into
  `optionsMenu.handleOptionsEdge(...)`. When it returns `"exit"`, set
  `_titlePhase = "input"`.
- **Draw:** `screens.js drawTitle()` gains
  `if (_titlePhase === "options"){ drawOptions(); return; }` at the top (alongside
  the existing load/mode/playlist guards).

Input plumbing (see Phase 2 for the shared edge helper): title-phase options needs
the same edge model pause uses. Rather than duplicate `_edge`, expose a tiny
**shared menu-edge helper** so title-options and pause both feed `handleOptionsEdge`.

---

## TODO 2 — Mode-select (Level Plan / Hand Authored) fixes

### 2a. First-game-with-gamepad skips the modal — ROOT CAUSE

In `pollGamepad()` (input.js ~78-95): pressing START on the title *input* phase
calls `advanceTitleToMode("gamepad")`, which sets `_titlePhase="mode"` **on the same
frame**. Execution then falls through to the `if (_titlePhase==="mode") pollTitleMenu()`
block lower in the SAME function call. `pollTitleMenu` tracks its own `_prevConfirm`
(module-local, separate from `pollGamepad`'s `prevStart`) which is still `false`, so
`confirm && !_prevConfirm` reads the STILL-HELD Start as a fresh press and immediately
runs `titleMenuSelect(1)` → `startRun(levelPlan)` before the modal ever renders. It
"fixes itself" after one run because `_prevConfirm` has since been through a real
held/idle cycle. Keyboard is immune (discrete keydown events, no shared-frame poll).

**Fix:** when advancing input→mode, seed `pollTitleMenu`'s prev-state so the
still-held button can't re-trigger on the same or next frame. Concretely: give
`pollTitleMenu` a one-frame guard. Simplest robust version — in `advanceTitleToMode`,
set a module flag `_modeJustEntered = true`; in `pollTitleMenu`, if `_modeJustEntered`,
seed `_prevConfirm/_prevUp/_prevDown` from the current pad reads and clear the flag
WITHOUT acting this frame. Also reset `_menuCursor = 0` there. Include an explicit
comment naming the same-frame-double-edge hazard.

### 2b. Gamepad doesn't work ON the mode/playlist screen

Same root as 2a in the steady state: `pollTitleMenu` DOES run for mode/playlist
(input.js line 93-95), but before the fix the phantom-edge consumes the entry and
after `startRun` you're no longer on the screen. Once 2a's seeding is correct,
verify D-pad up/down + A actually navigate. Also confirm `pollTitleMenu`'s `maxOpts`
handles the mode screen (2 options when playlists exist, else 1). No structural
change expected beyond 2a; just re-verify after the seed fix.

### 2c. ESC / B backs out of mode/playlist → title input

Neither `pollTitleMenu` nor the keydown handler currently has a back path from
mode/playlist. Add:
- Gamepad: in `pollTitleMenu`, read `BTN_BACK` (btn 1); on its rising edge, if
  `_titlePhase==="playlist"` → `"mode"`, else `"mode"`→`"input"`. Track `_prevBack`.
- Keyboard: in the keydown handler, when `_titlePhase` is `"mode"`/`"playlist"` and
  key is `escape` → step back one level the same way. (There's already a
  `_titlePhase!=="input"` keydown block around line 384 — hook the ESC there.)

### 2d. Descriptions + better labels on the mode screen

In `drawTitleModeSelect` (screens.js ~332):
- Keep numbered selectors but improve labels + add a one-line description under each.
  Suggested copy (Paul: tweak freely in the prompt):
  - **`[1] ENDLESS SHIFT`**  — "Randomized levels, one enemy type at a time. Endless."
    *(was "LEVEL PLAN")*
  - **`[2] STORY ROUTE`**  — "Hand-built levels in a fixed order." *(was "HAND
    AUTHORED"; keep "(unavailable)" suffix when no playlists)*
- Add a back hint line: "ESC / B — BACK".
- These are copy changes only; the internal mode ids (`"levelPlan"`/`"handAuthored"`)
  stay the same so nothing downstream breaks.

> NOTE: label strings are a design choice — Paul confirms/edits the two names and
> the two descriptions in the Phase 3 prompt before Claude Code runs it.

---

## TODO 3 — Move control hints off the title; add mouse + gamepad

- **Remove** `drawFireLegend(28, VIEW_H-150)` from the title `drawTitle()` (screens.js
  ~275). The title keeps: logo, THE ROBOTS HAVE TURNED, device-select blink lines,
  L—LOAD, high score, XP, weekly panel.
- **Add** a title hint line advertising Options: "O — OPTIONS" (keyboard) and, on the
  device-select screen, note "X — OPTIONS" for gamepad (mirrors the X=view affordance).
- **The full control reference now lives in Options → CONTROLS** (the two panes from
  the `optionsmenu.js` contract): keyboard fire grid + movement grid + other keys +
  mouse on the KEYBOARD pane; the gamepad schematic on the GAMEPAD pane. This satisfies
  TODO 3 items 5.1-5.4 and 6.

---

## File-size discipline

- Extracting Options + adding Controls into `optionsmenu.js` **reduces** pause.js
  (remove `_pollOptions`, `_drawOptions`, options vars) — target pause.js back under
  ~21 KB. `optionsmenu.js` will land ~9-12 KB (two panes + nav). screens.js loses
  `drawFireLegend`'s title call but the function itself may move to optionsmenu.js
  (Phase 4 decides move-vs-import). Flag in STATUS if any file still > 22 KB after.

## Module-split safety (mandatory, per project rules)

After Phase 4 (the extraction) AND after any later phase that edits imports:
1. `node --input-type=module -e "import('./src/optionsmenu.js').then(()=>console.log('ok'))"`
   (stub any canvas-only imports if needed, or run the existing headless harness).
2. grep cross-check: every identifier used in `optionsmenu.js` that isn't declared
   locally must have a matching `import`. Same check on `pause.js`/`screens.js`/`input.js`.
3. Browser smoke: title loads, O opens Options, CONTROLS shows the current-device
   pane, tab switch works, ESC steps back one level then to title; start a gamepad
   game from a COLD title and confirm the mode modal appears (TODO 2a canary).

## Circular-import notes (warn in each prompt)

- `optionsmenu.js` imports audio getters/setters + `savePrefs` (leaf-safe) and `COL`,
  `ctx`, `VIEW_W/H`. It must NOT import `input.js` or `pause.js`. Callers import IT.
- `pause.js` will import `openOptions`, `handleOptionsEdge`, `drawOptions`,
  `optionsScreen` from `optionsmenu.js`.
- `input.js` (title path) imports the same. `input.js` already imports from `pause.js`;
  adding an `optionsmenu.js` import is fine (optionsmenu imports neither).
- If `drawFireLegend` moves to optionsmenu.js and screens.js no longer references it,
  delete its screens.js copy; if screens still needs it elsewhere, EXPORT it and import
  into optionsmenu.js instead of copying (no duplicate legend code).