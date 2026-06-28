# Iris Wipe Transition — Corrected Implementation Spec

Screen transition effect for level start and level end.
This is a CORRECTION of the previous spec. Read it fully before touching any code.

---

## What the effect actually is

A single large **star shape** acts as a window into the game world.
- Inside the star = game visible.
- Outside the star = dark overlay (floor color, 80% opaque).
- The star scales up (reveals) or down (covers) centered on Dan's screen position.

This is NOT a grid of icons. It is ONE shape that scales.

---

## Render approach — compositing

`drawWipe()` uses a two-layer compositing technique:

1. Draw a full-screen dark rectangle (`rgba(28,31,38,0.80)`) — covers everything.
2. Use `ctx.globalCompositeOperation = 'destination-out'` to punch the star shape
   out of that rectangle, revealing the game underneath.

The star path must be drawn AFTER the dark rect, with destination-out active,
then compositing must be reset to `'source-over'` immediately after.

Because destination-out punches through whatever is on the canvas at that pixel,
the entire sequence must be isolated in a `ctx.save()` / `ctx.restore()` block.
Actually, destination-out on the main canvas will punch through ALL previously
drawn content — to avoid this, use an **offscreen canvas** as a compositing buffer:

```
1. Draw dark rect onto offscreen canvas (fill entire offscreen surface)
2. Set offscreen ctx compositeOperation to 'destination-out'
3. Draw star path onto offscreen canvas (punches hole in the dark rect)
4. Reset offscreen ctx compositeOperation to 'source-over'
5. Draw offscreen canvas onto main canvas with ctx.drawImage()
```

The offscreen canvas is created once at module load (same size as the game canvas).
This is the correct pattern — it avoids punching holes in the game world itself.

---

## Star geometry

A standard 5-point star, centered at (0, 0), drawn with two radii:
- Outer radius (`R`): tip of each point
- Inner radius (`r`): valley between points, = `R * 0.38` (classic star proportion)

```js
function drawStar(octx, cx, cy, R) {
  const r = R * 0.38;
  const points = 5;
  octx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI / points) - Math.PI / 2;
    const radius = i % 2 === 0 ? R : r;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) octx.moveTo(x, y);
    else octx.lineTo(x, y);
  }
  octx.closePath();
  octx.fill();   // fill, not stroke — destination-out needs a filled shape
}
```

`- Math.PI / 2` rotates so one point faces straight up (classic star orientation).

**Radius at full scale:** must be large enough that the star covers the entire
viewport even when focalX/focalY is near an edge. Use:

```js
const MAX_R = Math.hypot(VIEW_W, VIEW_H) * 0.75;
```

`Math.hypot(960, 640) ≈ 1155`, so `MAX_R ≈ 866`. A star of that outer radius
centered anywhere on the viewport will fully cover it. The `* 0.75` accounts for
the fact that the star's points extend to R but the valleys only reach `0.38 * R`,
so a modest oversize ensures solid coverage between the points too. If testing
reveals gaps at corners when focal is at an edge, increase to `* 0.85`.

**Radius at current animation time:**

```js
const R = MAX_R * currentScale;
```

where `currentScale` is the eased 0..1 value (same scale formula as before).

---

## Full `drawWipe()` implementation

```js
// Module-level: create offscreen canvas once
let _offscreen = null;
let _octx = null;

function getOffscreen() {
  if (!_offscreen) {
    _offscreen = document.createElement('canvas');
    _offscreen.width = VIEW_W;
    _offscreen.height = VIEW_H;
    _octx = _offscreen.getContext('2d');
  }
  return { oc: _offscreen, octx: _octx };
}

export function drawWipe() {
  if (phase === 'none') return;

  let scale;
  if      (phase === 'closing')  scale = easeInOut(t);
  else if (phase === 'hold_in')  scale = 1;
  else if (phase === 'hold_out') scale = 1;
  else if (phase === 'opening')  scale = 1 - easeInOut(t);

  const { oc, octx } = getOffscreen();

  // 1. Fill offscreen with the dark overlay color
  octx.clearRect(0, 0, VIEW_W, VIEW_H);
  octx.globalCompositeOperation = 'source-over';
  octx.fillStyle = 'rgba(28,31,38,0.80)';
  octx.fillRect(0, 0, VIEW_W, VIEW_H);

  // 2. Punch the star hole
  octx.globalCompositeOperation = 'destination-out';
  const MAX_R = Math.hypot(VIEW_W, VIEW_H) * 0.75;
  const R = MAX_R * scale;
  drawStar(octx, focalX, focalY, R);

  // 3. Reset and blit to main canvas
  octx.globalCompositeOperation = 'source-over';
  ctx.drawImage(oc, 0, 0);
}
```

---

## Focal point bug fix — level start

**The problem:** `startWipeOpen` is called inside `loadLevel()`, which sets
`G.camera = {x:0, y:0}` and places Dan at world center. At that moment
`sx = G.dan.x - 0 = G.dan.x` (world x), which is correct for the camera-at-origin
case. BUT `updateCamera()` runs on the first frame of `playing` and snaps the
camera to follow Dan — after that snap, Dan's world position no longer equals his
screen position.

**The real issue:** the focal point is computed correctly at loadLevel time, but the
camera hasn't been applied to the render yet. The wipe draws in SCREEN space, and
the first rendered frame has the camera already applied, so the focal point is off.

**The fix:** defer `startWipeOpen` to the first frame of `playing` state, AFTER
`updateCamera()` has run. Use a pending flag on G:

### In `level.js` — replace the current startWipeOpen call

Remove:
```js
// Iris Out: camera is {0,0} here so screen-space == world-space.
const sx = G.dan.x - G.camera.x;
const sy = G.dan.y - G.camera.y;
startWipeOpen(sx, sy);
```

Replace with:
```js
G._wipeOpenPending = true;
```

Also add `G._wipeOpenPending = false` to the `G` initial state in `state.js`
(add it near the other underscore-prefixed flags like `_levelEndEmitted`).

### In `update.js` — consume the flag after updateCamera()

`updateCamera()` is called at line ~94, near the top of the `playing` branch.
Add this immediately after the `updateCamera()` call:

```js
if (G._wipeOpenPending) {
  G._wipeOpenPending = false;
  const sx = G.dan.x - G.camera.x;
  const sy = G.dan.y - G.camera.y;
  startWipeOpen(sx, sy);
}
```

At this point the camera reflects the actual rendered frame, so the screen-space
focal point is correct.

Also add `startWipeOpen` to the import line in `update.js`:
```js
import { updateWipe, startWipeClose, startWipeOpen } from './wipe.js';
```

And remove `startWipeOpen` from the import in `level.js` since it no longer calls it:
```js
// level.js: remove startWipeOpen from the wipe.js import
```

---

## What does NOT change

- `startWipeClose`, `startWipeOpen`, `updateWipe` function signatures — unchanged.
- All phase logic in `updateWipe()` — unchanged.
- `easeInOut()` — unchanged.
- All wire-in points in `render.js` and `update.js` (the `updateWipe` call and
  `startWipeClose` trigger) — unchanged.
- Config constants — unchanged (WIPE_COLS, WIPE_ROWS, WIPE_ICON_SIZE are now unused
  but harmless to leave in CFG).

---

## Files to change

1. `src/wipe.js` — replace `drawWipe()` entirely; add `getOffscreen()` and
   `drawStar()`; remove `drawWipeIcon()` (no longer used).
2. `src/level.js` — replace `startWipeOpen(sx, sy)` call with
   `G._wipeOpenPending = true`; remove `startWipeOpen` from import.
3. `src/state.js` — add `_wipeOpenPending: false` to the G object.
4. `src/update.js` — add `startWipeOpen` to the wipe.js import; add the
   pending-flag consumption block after `updateCamera()`.

---

## Smoke test update

The existing `test-wipe.js` tests phase transitions — those still pass unchanged.
Add one new assertion: after `startWipeOpen` is called, `drawWipe()` at
`phase === 'hold_out'` should call `octx.fillRect` (dark overlay) and then
`octx.fill` (star punch). Mock the offscreen canvas in the test.

---

## STATUS.md update after implementation

Update the subsystem decisions entry for "Iris wipe transition":
```
- Single star shape (5-point, outer radius = hypot(VIEW_W,VIEW_H)*0.75 at full scale)
  used as a compositing mask. Drawn on an offscreen canvas with destination-out to
  punch a hole in the dark overlay, then blitted to the main canvas. NOT a grid of icons.
- Level-start focal point deferred to first playing frame (G._wipeOpenPending flag)
  so camera is settled before screen-space coords are computed.
```