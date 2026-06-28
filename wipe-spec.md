# Iris Wipe Transition — Implementation Spec

Screen transition effect for level start and level end.
This file is the sole implementation brief — read it fully before writing any code.

---

## What it is

A grid of mop-bucket icons that simultaneously scale up (Iris In, covers screen)
or scale down (Iris Out, reveals screen). Every icon scales around the same focal
point — Dan's screen-space position at the moment of the trigger — so the effect
reads as the world collapsing onto or expanding from Dan.

## Phases

### Level end — Iris In

Triggered the instant Dan touches the exit (currently in `update.js` lines ~104–111).

```
world visible → icons grow 0→1 (WIPE_CLOSE_DUR) → hold full (WIPE_HOLD_IN) → nextLevel()
```

### Level start — Iris Out

Triggered from `loadLevel()` in `level.js`, after Dan's position and camera are set.

```
icons at full scale (WIPE_HOLD_OUT) → icons shrink 1→0 (WIPE_OPEN_DUR) → none
```

During the Iris Out, `G.state` is already `"playing"` — the wipe just overlays the
live game world while it opens. No state freezing needed.

---

## New file: `src/wipe.js`

Self-contained module. No imports from `state.js` — keep all wipe state
**module-local**. Import `ctx`, `VIEW_W`, `VIEW_H` from `canvas.js`; `CFG` from
`config.js`; `COL` from `palette.js`.

### Module-local state

```js
let phase = 'none';   // 'none' | 'opening' | 'hold_out' | 'closing' | 'hold_in'
let t = 0;            // normalized 0..1 within the current animated phase
let holdTimer = 0;    // counts down during hold phases
let focalX = 0;       // screen-space X when wipe was triggered (held fixed)
let focalY = 0;       // screen-space Y when wipe was triggered (held fixed)
```

### Exports

```js
export function startWipeClose(sx, sy)   // Iris In  — call when Dan hits exit
export function startWipeOpen(sx, sy)    // Iris Out — call from loadLevel
export function updateWipe(dt)           // advance t; handle phase transitions
export function drawWipe()               // draw grid; no-op when phase === 'none'
```

### `startWipeClose(sx, sy)`

```js
phase = 'closing';
t = 0;
focalX = sx;
focalY = sy;
```

### `startWipeOpen(sx, sy)`

```js
phase = 'hold_out';
t = 0;
holdTimer = CFG.WIPE_HOLD_OUT;
focalX = sx;
focalY = sy;
```

Starting in `hold_out` (not `opening`) means the screen is covered for a beat before
it starts to open. This gives the player a moment after `nextLevel()` fires before
the world is revealed.

### `updateWipe(dt)`

```js
if (phase === 'none') return;

if (phase === 'closing') {
  t += dt / CFG.WIPE_CLOSE_DUR;
  if (t >= 1) { t = 1; phase = 'hold_in'; holdTimer = CFG.WIPE_HOLD_IN; }

} else if (phase === 'hold_in') {
  holdTimer -= dt;
  // Do NOT call nextLevel() here — update.js's G.transition countdown does that.
  // This phase just keeps the screen covered until that fires.
  if (holdTimer <= 0) phase = 'none';   // safety fallback

} else if (phase === 'hold_out') {
  holdTimer -= dt;
  if (holdTimer <= 0) { phase = 'opening'; t = 0; }

} else if (phase === 'opening') {
  t += dt / CFG.WIPE_OPEN_DUR;
  if (t >= 1) { t = 1; phase = 'none'; }
}
```

### `drawWipe()`

```js
export function drawWipe() {
  if (phase === 'none') return;

  // Compute per-icon scale from phase + t.
  let scale;
  if      (phase === 'closing')  scale = easeInOut(t);
  else if (phase === 'hold_in')  scale = 1;
  else if (phase === 'hold_out') scale = 1;
  else if (phase === 'opening')  scale = 1 - easeInOut(t);

  const size = CFG.WIPE_ICON_SIZE;
  const cols = CFG.WIPE_COLS;
  const rows = CFG.WIPE_ROWS;

  // Center the grid on the viewport; let it bleed off edges slightly.
  const gridW = cols * size;
  const gridH = rows * size;
  const originX = (VIEW_W - gridW) / 2;
  const originY = (VIEW_H - gridH) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellX = originX + c * size + size / 2;  // cell center X
      const cellY = originY + r * size + size / 2;  // cell center Y

      ctx.save();
      ctx.translate(focalX, focalY);
      ctx.scale(scale, scale);
      ctx.translate(cellX - focalX, cellY - focalY);
      drawWipeIcon(size);   // draws centered at (0, 0)
      ctx.restore();
    }
  }
}
```

The `translate → scale → translate` pattern is what makes every icon scale
from the same focal point. Do not change this ordering.

### `easeInOut(t)` — cubic, no dependencies

```js
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
```

### `drawWipeIcon(size)` — mop bucket silhouette

Draws centered at `(0, 0)`, scaled to `size`. Caller handles position via ctx transform.
All stroked in `COL.atomic`, no fill. Line width ~`size * 0.045` (scales with icon).

Geometry (all values as fractions of `size`, centered at origin):

```
Body (trapezoid):
  top-left:     (-0.30 * size, -0.28 * size)
  top-right:    ( 0.30 * size, -0.28 * size)
  bottom-right: ( 0.22 * size,  0.32 * size)
  bottom-left:  (-0.22 * size,  0.32 * size)

Wringer (small rect, right side of body, vertically centered):
  left:   0.22 * size
  top:   -0.10 * size
  width:  0.14 * size
  height: 0.20 * size

Handle (arc, sits above body top edge):
  Center: (0, -0.28 * size)
  Radius: 0.22 * size
  startAngle: Math.PI (left side)
  endAngle:   0       (right side)
  anticlockwise: true  → arc bows upward

Wheels (two small circles, bottom of body):
  left wheel:  (-0.12 * size, 0.38 * size) r = 0.05 * size
  right wheel: ( 0.12 * size, 0.38 * size) r = 0.05 * size
```

Use `ctx.beginPath()` / `ctx.closePath()` / `ctx.stroke()` for the trapezoid and
wringer. Use `ctx.arc()` for the handle and wheels. Set `ctx.strokeStyle = COL.atomic`
and `ctx.lineWidth = Math.max(1, size * 0.045)` once before drawing.

---

## Config additions — `src/config.js`

Add to the `CFG` object (alongside the existing constants):

```js
// Iris wipe transition (screens.js / wipe.js)
WIPE_ICON_SIZE: 80,    // px per icon at scale 1.0
WIPE_COLS: 14,         // columns — intentionally > VIEW_W / ICON_SIZE for edge bleed
WIPE_ROWS: 10,         // rows    — intentionally > VIEW_H / ICON_SIZE for edge bleed
WIPE_HOLD_OUT: 0.30,   // s: hold fully-covered at level start before opening
WIPE_HOLD_IN:  0.30,   // s: hold fully-covered at level end (safety; nextLevel fires first)
WIPE_CLOSE_DUR: 0.80,  // s: Iris In animation (world → covered)
WIPE_OPEN_DUR:  0.80,  // s: Iris Out animation (covered → world)
```

`14 × 80 = 1120 > 960 (VIEW_W)` and `10 × 80 = 800 > 640 (VIEW_H)` — icons bleed
off all four edges by half an icon width, guaranteeing no gaps at corners.

---

## Wire-in: `src/update.js`

### 1. Import at top

```js
import { updateWipe, startWipeClose } from './wipe.js';
```

### 2. Call `updateWipe(dt)` — first line of `update(dt)`, before `pollGamepad()`

```js
export function update(dt) {
  updateWipe(dt);    // ← ADD: runs in all states including levelclear
  pollGamepad();
  pollModals(dt);
  // ... rest unchanged
```

Must run before state branching so the opening wipe advances during `'playing'`.

### 3. Trigger Iris In — in the exit collision block (~line 104)

Replace the existing block:
```js
// BEFORE:
if (Math.hypot(G.exit.x - G.dan.x, G.exit.y - G.dan.y) <= G.exit.r + G.dan.r){
  G.high = Math.max(G.high, G.score);
  G.state = "levelclear";
  G.transition = 1.6;
  sfx.levelClear();
  return;
}
```

With:
```js
// AFTER:
if (Math.hypot(G.exit.x - G.dan.x, G.exit.y - G.dan.y) <= G.exit.r + G.dan.r){
  G.high = Math.max(G.high, G.score);
  G.state = "levelclear";
  G.transition = CFG.WIPE_CLOSE_DUR + CFG.WIPE_HOLD_IN + 0.05;  // tiny buffer
  const sx = G.dan.x - G.camera.x;
  const sy = G.dan.y - G.camera.y;
  startWipeClose(sx, sy);
  sfx.levelClear();
  return;
}
```

`G.transition` now matches the wipe duration so `nextLevel()` fires precisely when
the screen is fully covered.

---

## Wire-in: `src/level.js`

### 1. Import at top

```js
import { startWipeOpen } from './wipe.js';
```

### 2. Trigger Iris Out — end of `loadLevel()`

`loadLevel()` already sets `G.camera = { x:0, y:0 }` (line ~259). The camera is
reset to origin here, so screen-space = world-space at the moment of this call.
Dan's spawn is at the world center (`CFG.COLS/2 × CFG.TILE`), so the focal point
can be computed directly:

```js
// At the very end of loadLevel(), after all entities are seeded:
const sx = G.dan.x - G.camera.x;   // camera is {0,0} here, so sx = G.dan.x
const sy = G.dan.y - G.camera.y;   // sy = G.dan.y
startWipeOpen(sx, sy);
```

The camera will snap to follow Dan on the first `updateCamera()` call (first frame
of `'playing'`). Since `startWipeOpen` enters `hold_out` first (not `opening`),
the camera has one full frame to settle before the icon grid starts shrinking —
so the focal point will be off by at most 1 frame of camera movement, which is
imperceptible.

---

## Wire-in: `src/render.js`

### 1. Import at top

```js
import { drawWipe } from './wipe.js';
```

### 2. Call `drawWipe()` — absolute last line of `render()`

```js
  // ... existing end of render():
  if (G._showLifetimeModal) drawLifetimeModal();
  drawWipe();    // ← ADD: always last; no-op when phase === 'none'
}
```

`drawWipe()` must be last so it renders on top of the HUD, achievement banners,
and all state screens.

---

## Achievement modal interaction

The existing `G._showAchievementModal` check in `update.js` (levelclear branch)
pauses `G.transition` while the modal is up. This interacts with the wipe:

- If the modal shows, `G.transition` stops counting down → `nextLevel()` is delayed.
- The wipe's `closing` phase still completes normally (it runs on its own timer).
- After closing completes, the screen is covered and stays covered (`hold_in`)
  while the player reads the modal.
- When the player dismisses the modal, `G.transition` resumes and soon fires
  `nextLevel()`.

This is the correct behavior — the screen goes dark, the modal appears over it,
the player dismisses, and then the next level loads. No extra code needed.

One thing to verify: `drawLevelClear()` and `drawPostLevelModal()` (in `screens.js`)
draw before `drawWipe()` in the render order, so the wipe will correctly cover
those screens during the closing phase. Confirmed by the render order above.

---

## Smoke test: `test-wipe.js`

Write a headless Node.js smoke test (same pattern as existing tests):

```js
// Mock canvas context (wipe.js imports ctx from canvas.js)
// Test sequence:
// 1. startWipeClose(480, 320)
// 2. run updateWipe in a loop at dt=0.016 for 1.5 s simulated time
// 3. assert phase transitions: 'closing' → 'hold_in' at ~0.80 s
// 4. startWipeOpen(480, 320)
// 5. run updateWipe for 1.5 s
// 6. assert: 'hold_out' for first 0.30 s, 'opening' next 0.80 s, 'none' after
// 7. assert drawWipe() returns early when phase === 'none'
```

The test must mock `ctx` (stub `save/restore/translate/scale/beginPath/
closePath/arc/stroke/strokeStyle/lineWidth` as no-ops), `VIEW_W`/`VIEW_H` as
960/640, and `CFG` with the wipe constants above.

---

## STATUS.md update (after implementation)

Add to the build status table:
```
| Screen transition wipe | ✅ Built | — | `wipe.js`, `render.js`, `update.js`, `level.js` |
```

Add a subsystem decisions entry:
```
### Iris wipe transition
- Focal point is screen-space Dan position captured at trigger time, held fixed for
  the animation duration. Camera is at {0,0} during loadLevel so focal = world pos.
- Wipe state is module-local in wipe.js (not on G) — ephemeral render state.
- G.transition is set to WIPE_CLOSE_DUR + WIPE_HOLD_IN + 0.05 so nextLevel fires
  when the screen is fully covered. Achievement modal pauses G.transition naturally,
  keeping the screen covered while the modal is displayed.
- Opening wipe starts in hold_out (not opening) so the camera has one frame to
  snap to Dan before the grid begins shrinking.
```