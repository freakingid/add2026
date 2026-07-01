# Camera & Screen Effects — Implementation Spec

Canonical implementation reference. Read this fully before touching any code.
Claude Code: read `STATUS.md` (+ `STATUS-WORLD.md`/`STATUS-SYSTEMS.md` as
relevant) first, then this file in full, then `CLAUDE-CODE-PROMPTS-camera-effects.md`
for the copy-paste phase prompts.

---

## Overview

Decided in the design session (2026-07-01). Approved effects:

| # | Trigger | Effect |
|---|---|---|
| 1 | `player:hp_changed` (sustained, low HP) | Pulsing red vignette while HP stays low |
| 2 | `player:died` | Larger shake + flash that "fades into" the existing DAN IS DOWN screen |
| 3 | `dustbin:detonated` | Radial shake + flash, scaled by `killCount` |
| 4 | `dustbin:bounced` / `dustbin:thrown` | Tiny shake per bounce / tiny kick on throw. **Aside:** dustbin throw momentum increased (travels further before settling) |
| 5 | Manager Bot berserk pulse (new event) | Shake + flash, **plus** buffed enemies get a meaner color tint + shimmy while berserk |
| 6 | Cleaner spray slow status (`G.dan.slow`) | Sustained "disoriented/sick" tint + gentle wobble while active, clears when it ends |
| 7 | `worker:died` | Brief desaturation pulse (somber, distinct from combat feedback) |
| 8 | `powerup:collected` | Tiny camera punch-zoom, tinted to the powerup's own color |
| 9 | `vending:used` | Rings rising from Dan's feet, delivering the heal visually |

**Explicitly NOT in this pass** (from the design session):
- `player:hit` — no change.
- `bolt:hit` chain shake — no piercing bubble exists yet; revisit if one is ever added.
- `enemy:died` — no per-kill shake.
- `level:all_enemies_dead` flash — deferred. (See STATUS correction below — this
  was previously built as `flash.js`, then manually removed. Not being rebuilt
  in this pass.)
- `worker:rescued` — deferred.
- Achievement banner punch-in — no.
- `conveyor:push_tick` — no. (It fires every frame Dan stands on a belt tile —
  continuous, not a discrete event. Shake here would be constant and nauseating
  over a sustained ride. Explained here for the record; no work.)
- Scanner alarm — **undecided**, not scoped. For reference: Scanner patrols a
  fixed route and, while it has line-of-sight to Dan, broadcasts a continuous
  buff (+40% speed, +1 melee dmg) to nearby robots, refreshed every frame in
  range and decaying almost instantly (`alarmGrace: 0.8s`) once LOS breaks or
  the Scanner dies. It's the "lighter, continuous" cousin of the Manager's
  berserk pulse (`config.js` → `ENEMY.scanner`). If/when this gets a screen
  treatment, the natural fit is the same sustained-vignette machinery this spec
  builds for the low-HP and Cleaner-slow states — a low, continuous cyan tint
  while `e.alarmed` is active on any enemy near Dan. Not built now.

### STATUS.md correction (do this regardless of which phase you start on)

Line in the systems table currently reads:

```
| Screen flash (last-enemy-cleared VFX) | ✅ Built | — | `flash.js`, `render.js`, `update.js` |
```

`flash.js` does not exist in the repo and nothing calls `startFlash`/`updateFlash`
— it was built, then manually removed, and STATUS.md never caught up. Replace
with:

```
| Screen flash (last-enemy-cleared VFX) | 🔲 Removed — built then manually reverted; not in current camera-effects scope | — | — |
```

---

## Architecture

Five new/changed files, sized to stay clear of the 24KB convention. `render.js`
is currently at **24,561 bytes** (right at the ceiling) and `level.js` at
**25,755 bytes** (already over) — **do not add code to either beyond the
minimal wiring described below.**

### New files

- **`src/camerafx.js`** — pure state/math leaf. Owns shake, zoom-punch, the
  sustained-vignette computations (low HP, Cleaner-sick), one-shot flashes, and
  the desaturation pulse. **No canvas import** — everything here is numbers in,
  numbers out, so it can get a headless smoke test (pure math, no canvas
  imports, matching the `test-input.js` convention). Subscribes to `events.js`
  on import, same idiom as `update.js`'s `on('level:all_enemies_dead', ...)`.
  Imports: `state.js` (`G`, for the low-HP/Cleaner-slow polling), `events.js`
  (`on`), `config.js` (`CFG.CAMERAFX`).

  This deliberately does **not** follow `wipe.js`'s pattern of co-locating
  state and drawing in one file. Two reasons: (1) `render.js` has no headroom
  left for more drawing code, and (2) this module covers six distinct effect
  channels rather than wipe's one, so keeping the math canvas-free buys a real
  smoke test instead of only manual verification.

- **`src/render-camerafx.js`** — the actual `ctx` drawing calls, reading
  `camerafx.js`'s getters. Exports `drawVignettes()`, `drawFlashes()`,
  `drawDesaturation()`. Mirrors the existing `render-entities.js` /
  `render-ebolts.js` split-from-`render.js` pattern. Imports: `canvas.js`
  (`ctx`, `VIEW_W`, `VIEW_H`), `camerafx.js` (getters).

- **`src/render-marks.js`** — `drawMarks()` moved out of `render.js` verbatim
  (the `"berserk"` / `"blast"` / `"debris"` / default-soap kinds, unchanged),
  **plus** the new `"healRing"` kind for the vending effect. This is the prep
  step that gives `render.js` back the ~1.5KB of headroom needed for the
  wiring below. Imports: `canvas.js`, `state.js`, `config.js`.

### Edited files (small, targeted edits only)

| File | Change | Est. size impact |
|---|---|---|
| `src/render.js` | Remove `drawMarks()` body (moved out); import it from `render-marks.js` instead. Import `drawVignettes`/`drawFlashes`/`drawDesaturation` from `render-camerafx.js`. Apply zoom + shake in the existing camera-translate block. Call `drawDesaturation()` inside the world block (before its `ctx.restore()`), `drawVignettes()`/`drawFlashes()` after it. | net **negative** (removing drawMarks) − wiring add ≈ still under 24KB |
| `src/update.js` | Import + call `updateCameraFx(dt)`. Call it at the very top, alongside `updateWipe(dt)`, **unconditionally every frame** (before the `paused` early-return) — see "Why update at the top" below. | +2 lines |
| `src/combat.js` | One new `emit('manager:berserk_pulse', { count, x, y })` next to the existing berserk-buff loop and `G.marks.push(...berserk...)`. | +4 lines |
| `src/effects.js` | Add `addHealRing(x, y, color)`; extend `updateEffects` to move any mark with a `vy` field. | +10 lines |
| `src/vending.js` | Call `addHealRing(G.dan.x, G.dan.y, color)` next to the existing `addFloat` call in `updateVending`. | +1 line |
| `src/config.js` | Add `CFG.CAMERAFX` block (see below). Tune `CFG.DUSTBIN.throwSpeed`/`friction` for more throw distance. | +~40 lines (~1.1KB) |
| `src/palette.js` | Add `lerpColor(hexA, hexB, t)` utility. | +~10 lines |
| `src/render-entities.js` | Shared "shimmy" wrap around the per-type dispatch in `drawEnemies()`; per-type dominant-body-color tint via `lerpColor` when `e.berserk > 0`. Currently 21,564 bytes — watch this one, it has the least headroom of the edited files (~3KB to the ceiling). | +~700–900 bytes |

### Why `updateCameraFx(dt)` runs at the top, unconditionally

`update.js` early-returns before simulating anything once `G.state !== "playing"`
(e.g. right after `player:died` flips state to `"dead"`). If `updateCameraFx`
only ran inside the `"playing"` branch, a shake or flash triggered by
`player:died` would freeze mid-decay the instant death registers — a stuck
camera offset on the game-over screen. Ticking it at the top (same treatment
as `updateWipe`, which has the identical problem and the identical fix) lets
every triggered effect finish decaying regardless of what state the game moves
into next. Guard the G-state-polling parts (`lowHpAlpha`, Cleaner-sick) with
`if (!G.dan) return 0;` since `G.dan` is `null` on the title screen.

---

## `CFG.CAMERAFX` config block

Insert after the `DUSTBIN: { ... }` block in `config.js`, before the `// Power-ups`
comment. All values below are **starting points** — tune by feel, same as
every other `config.js` table (see `flash.js`'s old decay-rate comment for the
precedent: "was 5.5/s — slower fade after playtesting").

```js
// Camera/screen feedback effects (SPEC-camera-effects.md). Shake/flash values
// are peak magnitude + duration; overlapping shakes/flashes of the same kind
// take the STRONGER one rather than stacking additively (see camerafx.js) —
// avoids a runaway camera when several triggers land on the same frame.
CAMERAFX: {
  // player:died
  playerDiedShakeMag: 9, playerDiedShakeDur: 0.6,
  playerDiedFlashColor: '#ff5b4d', playerDiedFlashPeak: 0.55, playerDiedFlashDur: 1.0,

  // dustbin:detonated — scales with killCount, capped
  dustbinDetonateShakeBase: 5, dustbinDetonateShakePerKill: 1.2, dustbinDetonateShakeMax: 14, dustbinDetonateShakeDur: 0.5,
  dustbinDetonateFlashColor: '#5dff8f', dustbinDetonateFlashPeakBase: 0.35, dustbinDetonateFlashPeakPerKill: 0.03, dustbinDetonateFlashPeakMax: 0.7, dustbinDetonateFlashDur: 0.45,

  // dustbin:bounced / dustbin:thrown
  dustbinBounceShakeMag: 2, dustbinBounceShakeDur: 0.15,
  dustbinThrowKickMag: 3, dustbinThrowKickDur: 0.12,

  // manager:berserk_pulse (new event, emitted from combat.js)
  managerPulseShakeMag: 7, managerPulseShakeDur: 0.35,
  managerPulseFlashColor: '#ff6414', managerPulseFlashPeak: 0.28, managerPulseFlashDur: 0.4,

  // powerup:collected — punch-zoom, no shake
  powerupPunchZoom: 1.045, powerupPunchDur: 0.14,

  // player:hp_changed — sustained, recomputed live from G.dan each frame (NOT a timer)
  lowHpFraction: 0.30,          // HP/maxHp at/below this = vignette active
  lowHpVignetteColor: '#ff5b4d',
  lowHpVignetteMaxAlpha: 0.30,
  lowHpPulseHz: 1.6,

  // Cleaner spray slow status — sustained, polls G.dan.slow > 0, smooth fade
  cleanerSickColor: '#9bff7a',   // reuses the Cleaner's own spray color (thematic tie)
  cleanerSickMaxAlpha: 0.16,
  cleanerFadeRate: 4.0,          // per-second lerp rate toward target alpha (~250ms crossfade)
  cleanerWobbleMag: 1.4, cleanerWobbleHz: 2.2,   // continuous low-amplitude camera wobble

  // worker:died — one-shot desaturation, distinct visual language from combat (loss, not hit)
  workerDiedDesatPeak: 0.6, workerDiedDesatDur: 0.5,

  // Manager berserk enemy visual (consumed by render-entities.js, not camerafx.js)
  berserkTintAmount: 0.45,        // 0..1 lerp toward berserkTintColor on the enemy's main body fill
  berserkTintColor: '#ff5b1f',
  berserkShimmyMag: 1.5, berserkShimmyHzA: 40, berserkShimmyHzB: 33,
},
```

### Dustbin throw momentum (the "aside")

Current: `throwSpeed: 300`, `friction: 2.2` → settles after ≈123px (≈3.8 tiles)
in a straight line. Proposed:

```js
throwSpeed: 460,   // was 300
friction: 1.5,     // was 2.2
```

→ settles after ≈287px (≈9 tiles, roughly a third of the 960px view width) —
about 2.3× the current distance. `bounce: 0.7` unchanged (an easy further knob
if it still feels short after bounces eat into a corner throw). This is a
config-only change; `dustbin.js` itself needs no edits since it already reads
these values.

---

## Effect-by-effect design

### 1 & 6 — Sustained vignettes (low HP, Cleaner-sick)

Both are **polled live from `G` every frame**, not event-driven timers — HP can
recover (vending, natural top-ups) without a corresponding "hp recovered"
event existing, and `G.dan.slow` already decays on its own in `player.js`. So
`camerafx.js` just reads current state each tick:

```js
function lowHpAlpha(){
  if (!G.dan || G.dan.hp <= 0) return 0;
  const frac = G.dan.hp / G.dan.maxHp;
  const C = CFG.CAMERAFX;
  if (frac > C.lowHpFraction) return 0;
  const pulse = 0.5 + 0.5 * Math.sin(performance.now()/1000 * Math.PI*2 * C.lowHpPulseHz);
  const closeness = 1 - frac / C.lowHpFraction;   // 0 at threshold, 1 at 0 HP
  return C.lowHpVignetteMaxAlpha * (0.5 + 0.5*pulse) * closeness;
}

let _cleanerAlpha = 0;
function tickCleanerSick(dt){
  const C = CFG.CAMERAFX;
  const target = (G.dan && G.dan.slow > 0) ? C.cleanerSickMaxAlpha : 0;
  _cleanerAlpha += (target - _cleanerAlpha) * Math.min(1, dt * C.cleanerFadeRate);
}
```

`render-camerafx.js`'s `drawVignettes()` draws both as radial gradients
(darker/tinted at the edges, clear at center) using `getLowHpAlpha()` and
`getCleanerSickAlpha()`. The Cleaner "wobble" is cheap: fold a small
continuous sine offset into the shake channel whenever `_cleanerAlpha > 0.01`,
rather than inventing a second offset system:

```js
function cleanerWobbleOffset(){
  if (_cleanerAlpha < 0.01) return { x:0, y:0 };
  const C = CFG.CAMERAFX, t = performance.now()/1000;
  const m = C.cleanerWobbleMag * _cleanerAlpha;   // scales in with the fade
  return { x: Math.sin(t*C.cleanerWobbleHz)*m, y: Math.cos(t*C.cleanerWobbleHz*0.8)*m };
}
```

`getShakeOffset()` sums the impact-shake offset (below) with this wobble
offset — additive here is correct (they're different physical phenomena, not
competing impacts).

### 2, 3, 5 — One-shot shake + flash (player died, dustbin detonate, manager pulse)

Shake: "take the stronger, don't stack."

```js
let _mag = 0, _dur = 0, _elapsed = 0;
function shake(mag, dur){
  const remaining = _dur > 0 ? _mag * Math.max(0, 1 - _elapsed/_dur) : 0;
  if (mag >= remaining){ _mag = mag; _dur = dur; _elapsed = 0; }
}
function tickShake(dt){ if (_elapsed < _dur) _elapsed += dt; }
function currentShakeMag(){
  return (_dur > 0 && _elapsed < _dur) ? _mag * (1 - _elapsed/_dur) : 0;
}
function impactShakeOffset(){
  const m = currentShakeMag();
  if (m <= 0) return { x:0, y:0 };
  const t = performance.now()/1000;
  return {
    x: (Math.sin(t*53.7) + Math.sin(t*39.1)) * 0.5 * m,
    y: (Math.cos(t*47.3) + Math.cos(t*31.7)) * 0.5 * m,
  };
}
```

`getShakeOffset()` = `impactShakeOffset()` + `cleanerWobbleOffset()`.

Flashes: independent one-shots, kept as a small array (rarely more than one or
two active at once):

```js
let _flashes = [];   // { color, peak, dur, elapsed }
function flash(color, peak, dur){ _flashes.push({ color, peak, dur, elapsed:0 }); }
function tickFlashes(dt){
  for (let i = _flashes.length-1; i >= 0; i--){
    const f = _flashes[i]; f.elapsed += dt;
    if (f.elapsed >= f.dur) _flashes.splice(i, 1);
  }
}
function getFlashLayers(){
  return _flashes.map(f => ({ color: f.color, alpha: f.peak * (1 - f.elapsed/f.dur) }));
}
```

Event wiring (module-level, side-effect on import — same idiom as `update.js`'s
existing `on('level:all_enemies_dead', ...)`):

```js
on('player:died', () => {
  const C = CFG.CAMERAFX;
  shake(C.playerDiedShakeMag, C.playerDiedShakeDur);
  flash(C.playerDiedFlashColor, C.playerDiedFlashPeak, C.playerDiedFlashDur);
});

on('dustbin:detonated', ({ killCount }) => {
  const C = CFG.CAMERAFX;
  const mag = Math.min(C.dustbinDetonateShakeMax, C.dustbinDetonateShakeBase + killCount * C.dustbinDetonateShakePerKill);
  shake(mag, C.dustbinDetonateShakeDur);
  const peak = Math.min(C.dustbinDetonateFlashPeakMax, C.dustbinDetonateFlashPeakBase + killCount * C.dustbinDetonateFlashPeakPerKill);
  flash(C.dustbinDetonateFlashColor, peak, C.dustbinDetonateFlashDur);
});

on('dustbin:bounced', () => shake(CFG.CAMERAFX.dustbinBounceShakeMag, CFG.CAMERAFX.dustbinBounceShakeDur));
on('dustbin:thrown', () => shake(CFG.CAMERAFX.dustbinThrowKickMag, CFG.CAMERAFX.dustbinThrowKickDur));

on('manager:berserk_pulse', () => {
  const C = CFG.CAMERAFX;
  shake(C.managerPulseShakeMag, C.managerPulseShakeDur);
  flash(C.managerPulseFlashColor, C.managerPulseFlashPeak, C.managerPulseFlashDur);
});
```

`combat.js` addition (next to the existing berserk buff loop and
`G.marks.push({..., kind:"berserk"})`):

```js
emit('manager:berserk_pulse', { count: buffedCount, x: e.x, y: e.y });
```

(`buffedCount` = however many robots the existing loop actually buffed —
increment a counter inside that loop rather than recomputing.)

**Player-died flash placement:** draw it inside the world block, before that
block's `ctx.restore()` — NOT as a separate overlay drawn after
`screens.drawGameOver()`. `drawGameOver()` already lays a constant
`rgba(8,10,14,0.78)` scrim over everything; placing the impact flash *under*
that scrim is what makes it read as "fading into the game-over screen" rather
than fighting the scrim for visibility on top of it.

### 4 — Powerup punch-zoom

```js
let _zoomPeak = 1, _zoomDur = 0, _zoomElapsed = 0;
function punchZoom(peak, dur){ _zoomPeak = peak; _zoomDur = dur; _zoomElapsed = 0; }
function tickZoom(dt){ if (_zoomElapsed < _zoomDur) _zoomElapsed += dt; }
function currentZoom(){
  if (_zoomDur <= 0 || _zoomElapsed >= _zoomDur) return 1;
  const t = _zoomElapsed / _zoomDur;
  const p = t < 0.35 ? t/0.35 : 1 - (t-0.35)/0.65;   // ramp up to 0.35, back down by 1.0
  return 1 + (_zoomPeak - 1) * p;
}
```

```js
on('powerup:collected', ({ kind }) => {
  const C = CFG.CAMERAFX;
  punchZoom(C.powerupPunchZoom, C.powerupPunchDur);
  flash(POWERUPS[kind].color, 0.18, C.powerupPunchDur);   // small, brief, matches the pickup's own color
});
```

(`POWERUPS` import needed in `camerafx.js` for the color lookup.)

`render.js` applies zoom around the viewport center, **before** the existing
camera translate, in the same `ctx.save()` block:

```js
ctx.save();
const z = getZoomScale();
if (z !== 1){
  ctx.translate(VIEW_W/2, VIEW_H/2);
  ctx.scale(z, z);
  ctx.translate(-VIEW_W/2, -VIEW_H/2);
}
const shake = getShakeOffset();
ctx.translate(-Math.round(G.camera.x - shake.x), -Math.round(G.camera.y - shake.y));
```

Order matters: scale-around-center first, then translate for camera+shake, so
the zoom always pinches on the screen center regardless of where the camera
currently is.

### 7 — Worker died: desaturation pulse

Uses the canvas 2D `'saturation'` composite mode rather than `ctx.filter`
(cheaper — one `fillRect`, standard blend mode, no per-pixel filter pass):

```js
// camerafx.js
let _desatMag = 0, _desatDur = 0, _desatElapsed = 0;
function pulseDesat(peak, dur){ _desatMag = peak; _desatDur = dur; _desatElapsed = 0; }
function tickDesat(dt){ if (_desatElapsed < _desatDur) _desatElapsed += dt; }
function currentDesat(){
  return (_desatDur > 0 && _desatElapsed < _desatDur) ? _desatMag * (1 - _desatElapsed/_desatDur) : 0;
}
```

```js
// render-camerafx.js — called from render.js INSIDE the world save/restore,
// after all world/entity draws, before that block's ctx.restore(), so only
// the world layer desaturates (not the HUD).
export function drawDesaturation(){
  const a = getDesatAlpha();
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = a;
  ctx.fillStyle = 'hsl(0,0%,50%)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);   // screen-space rect; already inside the translated block, fine since it's a full-viewport wash
  ctx.restore();
}
```

```js
on('worker:died', () => pulseDesat(CFG.CAMERAFX.workerDiedDesatPeak, CFG.CAMERAFX.workerDiedDesatDur));
```

Deliberately a **different visual language** from the combat-flash channel
(gray pulse = loss, not a hit) — don't reuse the flash array for this.

### 5b — Manager berserk enemy visual (meaner color + shimmy)

Lives in `render-entities.js`, independent of the `camerafx.js`/`render-camerafx.js`
pipeline — this is a per-entity render tweak, not a screen-space effect.

**Shimmy** (visual-only position jitter, does not touch `e.x`/`e.y` — collision
and AI stay exactly where they are): wrap the existing per-type dispatch block
in `drawEnemies()`:

```js
for (const e of G.enemies){
  // ...existing berserk/alarm aura blocks unchanged...

  let jx = 0, jy = 0;
  if (e.berserk > 0 && e.spawn <= 0){
    const C = CFG.CAMERAFX, t = performance.now()/1000, ph = e.eid * 0.7;   // per-enemy phase so a mob doesn't shimmy in lockstep
    jx = Math.sin(t*C.berserkShimmyHzA + ph) * C.berserkShimmyMag;
    jy = Math.cos(t*C.berserkShimmyHzB + ph) * C.berserkShimmyMag;
  }
  ctx.save();
  if (jx || jy) ctx.translate(jx, jy);

  if (e.type === "forklift") drawForklift(e);
  else if (e.type === "security") drawSecurity(e);
  // ...unchanged dispatch chain...

  ctx.restore();
}
```

**Color tint** — touch only the *dominant body* `fillStyle` in each per-type
draw function (not every accent line; scope stays small and the read stays
clean). Add to `palette.js`:

```js
export function lerpColor(hexA, hexB, t){
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
  const br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
  const r = Math.round(ar + (br-ar)*t), g = Math.round(ag + (bg-ag)*t), bl = Math.round(ab + (bb-ab)*t);
  return `rgb(${r},${g},${bl})`;
}
```

Then in each `drawX(e)` function, wherever the main chassis fill is set (e.g.
`drawForklift`: `ctx.fillStyle = COL.forkliftBody;`), swap to:

```js
ctx.fillStyle = (e.berserk > 0) ? lerpColor(COL.forkliftBody, CFG.CAMERAFX.berserkTintColor, CFG.CAMERAFX.berserkTintAmount) : COL.forkliftBody;
```

...one line per enemy type (9 total: picker, forklift, security, sorter,
cleaner, drone, manager, scanner, inventory). Manager itself can be caught in
another Manager's pulse (rare, two Managers dying near each other) — same
treatment, no special-case needed.

### 9 — Vending healing rings

World-space marks (move with the camera naturally), not a screen-space effect
— lives in `effects.js` + `render-marks.js`, no `camerafx.js` involvement.

`effects.js`:

```js
export function addHealRing(x, y, color){
  // Three rings at staggered starting life so they cascade rather than
  // popping in sync — reuses the existing generic life-decay loop below,
  // no new timer mechanism needed.
  G.marks.push({ x, y, life:1.00, kind:"healRing", color, vy:-22 });
  G.marks.push({ x, y, life:0.85, kind:"healRing", color, vy:-22 });
  G.marks.push({ x, y, life:0.70, kind:"healRing", color, vy:-22 });
}

export function updateEffects(dt){
  for (let i = G.marks.length - 1; i >= 0; i--){
    const m = G.marks[i];
    if (m.vy) m.y += m.vy * dt;             // NEW: any mark with vy rises (reusable beyond healRing)
    m.life -= dt * 1.6;
    if (m.life <= 0) G.marks.splice(i, 1);
  }
  // ...existing floats loop unchanged...
}
```

`vending.js` — one line next to the existing `addFloat` call:

```js
addHealRing(G.dan.x, G.dan.y + 10, color);   // color already computed above (COL.vendLarge/vendSmall)
```

`render-marks.js` — new branch in the moved `drawMarks()`:

```js
} else if (m.kind === "healRing"){
  const progress = 1 - m.life;                       // life starts at 1.0/0.85/0.70, all decay at the same 1.6/s rate
  const rad = 4 + progress * 16;
  ctx.strokeStyle = m.color.startsWith('#') ? hexA(m.color, Math.max(0, m.life) * 0.85) : m.color;
  ctx.lineWidth = 2.5 - progress * 1.5;
  ctx.beginPath();
  ctx.arc(m.x, m.y, Math.max(1, rad), 0, Math.PI*2);
  ctx.stroke();
}
```

(`hexA(hex, alpha)` — small shared helper, same shape as the one in
`render-camerafx.js`; either duplicate the four-line function or export it
from `render-camerafx.js` and import it here — Claude Code's call based on
which reads cleaner once both files exist.)

---

## Edge cases and invariants

- **Shakes take the stronger, never stack additively.** Getting hit by an
  enemy right as a dustbin detonates should not produce a bigger shake than
  either alone — see the `shake()` semantics above.
- **`updateCameraFx(dt)` must run every frame regardless of `G.state`**,
  mirroring `updateWipe`. See "Why `updateCameraFx` runs at the top" above.
- **`G.dan` is `null` on the title screen.** Every function in `camerafx.js`
  that reads `G.dan` must guard for that (`lowHpAlpha`, `tickCleanerSick`).
- **Desaturation draws inside the world save/restore block**, before that
  block's `ctx.restore()` — it must NOT touch the HUD or the achievement
  banner (both draw in screen space, after the world block restores).
- **Zoom is applied before the camera translate**, in the same `ctx.save()`
  block, so it always pinches around the screen center regardless of Dan's
  world position.
- **The berserk shimmy is render-only.** `jx`/`jy` never touch `e.x`/`e.y` —
  collision, AI targeting, and the aura rings (which already read `e.x`/`e.y`
  directly) are unaffected.
- **Manager berserking another Manager:** the existing buff loop already
  handles this (`for (const other of G.enemies) if (other === e) continue`),
  no special-case needed for the new visual treatment either.
- **`POWERUPS[kind].color` is a plain hex string** (`"#5fd2ff"` etc.) —
  `camerafx.js` needs `import { POWERUPS } from "./config.js"` for the punch
  flash color lookup. `config.js` itself stays import-free (unchanged).

---

## Out of scope / deferred (for STATUS.md, once this ships)

- `level:all_enemies_dead` flash (previously `flash.js`, removed) — not rebuilt.
- `worker:rescued` escalating flash — deferred.
- Scanner alarm sustained tint — undecided; see explanation above. If revisited,
  it reuses the exact sustained-vignette machinery built here.
- Reduce Screen Shake accessibility toggle — not requested; optional Phase 5
  in the prompts doc if wanted later.