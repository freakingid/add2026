# Atomic Dustbin Dan — Build Status & Handoff

What is actually built, the decisions behind it, and where the code lives.
Cross-cutting non-negotiables and the roadmap checklist are in **CLAUDE.md**;
design intent is in **GDD.md**. Behavior described here is the source of truth for
*reality*; where it diverges from the GDD, that divergence is intentional and noted.

## Planned changes

Work these **one at a time, then test**. Once a change is built + tested, fold its
decisions into the relevant "Subsystem decisions" entry and remove the entry here.

- _(none queued — level progression overhaul just landed; see "Level progression overhaul" below.)_

---

## Current state — what is built

All core systems are complete. The table below is the canonical build status; GDD section references and Subsystem decisions below are the sources of detail.

| System | Status | GDD ref | Key file(s) |
|---|---|---|---|
| Dan — movement, melee, ranged, HP, i-frames | ✅ Built | §2 | `player.js`, `input.js` |
| Power-ups (Rapid / Triple / Bounce) | ✅ Built | §3 | `player.js`, `config.js` |
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
| Audio — 18 SFX + looping conveyor bed | ✅ Built | §10 | `audio.js` |
| Game states (title / playing / levelclear / dead) | ✅ Built | — | `state.js`, `screens.js` |
| Achievement system | 🔧 In progress — Phase 5 complete | `ACHIEVEMENTS.md`, `ACHIEVEMENT-BLUEPRINT.md` | `events.js`, `achievements.js`, `screens.js`, `render.js`, `audio.js` |
| Pause menu + Save/Load system | ✅ Built | — | `savegame.js`, `pause.js`, `screens.js`, `input.js`, `level.js`, `audio.js`, `update.js`, `render.js` |
| Sprite-art polish | 🔲 Not built | §10 | — |

> Cross-cutting "do not silently change" rules (HP/score persistence, decrement model,
> max-shots formula, bounce, one-type-per-level, global spawn cadence, knockback,
> keyboard mapping) now live in **CLAUDE.md**. The per-subsystem feel decisions below
> stay here, next to the systems they govern.

---

## Subsystem decisions (confirm if changing feel)

### Controls / input (GDD §4.1, §4.3, §4.5–§4.8)

- **One device per run, picked on the title.** `G.inputMode` is `null` on the title,
  then `'keyboard'` or `'gamepad'` — set by `startRun(mode)` in `input.js` (a wrapper
  that calls `newGame()` then assigns the mode). First valid title input wins: SPACE /
  ENTER / click / touch → keyboard; gamepad `BTN_START` (9/0) → gamepad. The opposing
  device is then inert (its getters return zero/null), and the game-over restart keys
  off the active mode. GDD §4.5 rationale: keyboard snaps to 8 dirs, gamepad is 360° —
  mixing mid-run is confusing. *(`newGame()` itself is NOT modified to reset
  `G.inputMode`; the mode is owned entirely by `startRun`, which is the only caller of
  `newGame`. `G.inputMode` starts `null` from `state.js`, and there is no return-to-title
  path, so it's never stale. If a title-return is ever added, null it there.)*
- **Device-agnostic API — no raw key/axis reads in game code.** `input.js` exports
  `getMoveVec()` → normalized `{x,y}` (mag 0/1), `getFireAngle()` → radians or `null`,
  `isDeploySpecial()` → edge-triggered bool. Each branches on `G.inputMode`.
  `player.js`/`dustbin.js` call these; **never bypass `G.inputMode`**. `keys`/`mouse`
  stay exported only for mouse-aim, the `M` mute key, and debug. Removed the old
  `fireKeyStack`/`FIRE_ANGLES`/`keyboardFireAngle`.
- **Diagonals are derived, not bound.** Cardinals live in `CFG.KEYS` (MOVE W/D/S/A,
  FIRE N=O E=`;` S=L W=K); a held diagonal is the **vector sum of two adjacent
  cardinals** (so O+; = NE fire, W+D = NE move). Opposing fire keys (O+L) cancel to
  zero → no fire. Remap a cardinal and the diagonals follow automatically — there are
  no per-diagonal keys (the old `i o p / k l ; / , . /` single-key fire grid is gone).
  **Fire East is `;`, not P** (GDD §4.3 says P) — a deliberate divergence chosen to
  match the physical `O` / `K L ;` finger cluster; change `CFG.KEYS.FIRE.E` to revert.
- **Aim vs. fire are separate.** `getFireAngle()` is `null` when not firing. In keyboard
  mode `player.js` still faces Dan at the mouse cursor every frame (cursor tracking
  always on); in gamepad mode Dan **holds his last fire heading** when the right stick
  is centered (GDD §11). `wantFire = getFireAngle() !== null`.
- **Gamepad is polled, not event-driven.** `pollGamepad()` (in `input.js`) runs at the
  top of `update()` **every frame in every state** (events are unreliable across
  browsers; title/dead need it to start/restart). It caches `navigator.getGamepads()[0]`
  for the getters and edge-detects `BTN_START`. Left stick = axes 0/1, right = 2/3;
  any push past `moveDeadzone`/`fireDeadzone` (0.2) acts at full magnitude (movement is
  not pressure-sensitive, GDD §4.6). Special = any `BTN_SPECIAL` (4–7, bumpers/triggers).
- **`isDeploySpecial()` owns the deploy edge-trigger** (moved out of `dustbin.js`'s old
  `deployHeld`). It tracks one `prevDeploy` bool and **must be called exactly once per
  frame** — it is, as the first term of `updateDustbin`'s deploy `if` (short-circuit
  keeps it always-evaluated). Throw direction now comes from `getMoveVec()` (left stick
  or WASD), so a moving deploy throws and a centered one drops in place, in either mode.
- **Title shows both modes; the fire legend matches.** `screens.js` renders "SPACE —
  KEYBOARD" / "A / START — GAMEPAD" and a 3×3 legend with O/;/L/K cardinals + the four
  two-key diagonal combos (empty center). Game-over prompt is mode-keyed; level-clear
  auto-advances (no prompt). Pure math is unit-tested in `test-input.js` (`node
  test-input.js`); full gamepad/loop integration needs a browser.

> Completed system decisions (enemy roster, Atomic Dustbin, workers, audio) are in
> **STATUS-SYSTEMS.md**. Open it only when modifying those systems.

### Level Definition format & loader (GDD §8.1)

- **One loader, one entry point.** `loadLevel(def)` (level.js) is the *only* way a
  playable level comes into being; both procgen and hand-authoring produce a Level
  Definition and hand it to the same loader, so the engine never branches on origin
  (GDD §8.1). `buildLevel` is now just `loadLevel(generateLevelDef())`. (Alt: keep a
  separate generate-directly path — rejected; the whole point of §8.1 is a single
  data format both paths share.)
- **`map` holds a tile CHAR, not 0/1.** Collision/LOS/destructibility read per-type
  flags from `CFG.TILES` (`isWall`=`solid`, `blocksLOS`, `isDestructible`), so a new
  tile type is pure data — no collision-code edits (§8.1.1). For the generated levels
  (only `#` border + `S` shelves) this is byte-for-byte the old behavior: shelves are
  destructible, the border isn't. The **Forklift now smashes by the `destructible`
  flag**, not by `isBorderTile` — so an authored `P`/`o`/`#` correctly stops a charge.
- **Grid dims are loader-set.** `loadTileGrid` adopts the grid's `cols × rows` into
  `CFG.COLS/ROWS`, so authored levels can be any size (the camera clamp already
  tolerates worlds smaller than the viewport). The generator sizes itself from a
  **separate** `CFG.GEN_COLS/GEN_ROWS` (40×30) so loading a small authored level can't
  make the *next* generated level inherit that size.
- **Conveyors: baked here, applied in "Conveyors".** `bakeConveyors` sums every
  covering strip's `dir×speed×CFG.CONVEYOR_SPEED` into a `cols×rows` `pushField` of
  `{dx,dy}`, so crossing strips yield a diagonal at the overlap with **no special
  intersection type** and opposing strips cancel (§8.1.2/§8.1.4). `pushAt(tx,ty)` is the
  O(1) lookup; the field is now **consumed every frame** by the push mechanic (see the
  "Conveyors" subsystem entry).
- **Spawn-rule placement honors zone + avoid, never lands on a solid.** Each rule drops
  `count` of a `type` into a random non-solid tile of its zone role, skipping any
  `avoid`-role tile, with a guaranteed floor-tile fallback so a rule always places
  (matching the old "always place" behavior). `"any"` = whole interior. The generator
  reproduces the old whole-map-random placement by blanketing the interior with
  `combat`/`cover`/`danger` zones (roles may overlap, §8.1.3) and a central `spawn`
  zone that workers/terminals/pickups/dustbin `avoid` — i.e. the old `minDist`-from-
  centre, re-expressed as data. Vending uses a wall-adjacent variant (`pickWallTile`)
  so the flush look survives. Terminal rules carry `enemy` + `preplace` (the only
  documented extension to §8.1.3's example shape); preplaced enemies still emerge **from
  the terminals** (not zone-scattered), preserving feel.
- **Terminals/preplace/cluster composition is the generator's job, not the loader's.**
  The single-type term-count scaling, the Manager/Scanner +2-Picker cluster, and the
  `"mixed"` one-of-every-type seeding are emitted as spawn rules by `generateLevelDef`;
  the loader stays generic. (Verified: L1–L12 compose identically to pre-refactor.)
- **Validation throws on a malformed def** (§8.1.4): exactly one `player`, ≥1 `exit`,
  every spawn-rule zone role exists or is `"any"` (plus ragged-grid / unknown-char
  guards in `loadTileGrid`). A bad level fails loudly at load rather than half-building.
- **Hand-authored proof + tests.** `test-loader.js` (`node test-loader.js`) loads a
  small fixed authored layout through the same loader and checks: valid generated level,
  no entity on a solid, validation rejections, and the push-field sum/cancel. 35 checks.
- **The five authored levels (`authored-levels.js`) made two handoff-format
  adaptations.** The design handoff (`src/levels/level-designs-handoff.md`) was written
  against an idealized schema; two things had to change to match the real
  `runSpawnRule`/loader contract:
  (1) **`dispatchTerminal` → `terminal`.** The handoff used a generic
  `{ type:"dispatchTerminal" }` rule, but the loader only knows
  `{ type:"terminal", enemy:<ENEMY key>, preplace }` — an unmatched `dispatchTerminal`
  hits `runSpawnRule`'s default branch and silently places **zero** terminals (an
  enemy-less level). So each level's terminals carry the enemy type(s) **named in its
  tactical premise** (Receiving Dock→picker+forklift, Pick-and-Pack→sorter+scanner,
  Cold Storage→forklift+sorter, Mezzanine Ring→security+drone, Conveyor Hub→drone+manager;
  premise-named two-type levels split one terminal each), `preplace:1` so the level isn't
  empty on arrival. (Alt: keep `dispatchTerminal` literal — rejected; it loads "cleanly"
  but produces a level with no enemies, contradicting "Two Dispatch Terminals sit…".)
  (2) **L4 (Mezzanine Ring) tile grid rebuilt** from the handoff's in-design "NOTE FOR
  IMPLEMENTER" (its ASCII was a flagged approximation): a closed inner-wall rectangle
  (cols 4–24, rows 6–25) with four doorways (N/S cols 12–17, W col 4 rows 10–12, E col 24
  rows 22–24), open arena inside, mezzanine ring outside, shelf alcoves in the ring's four
  corners. Everything else (tiles/conveyors/zones/placements, and the non-terminal spawn
  rules) is transcribed as-authored, with row widths normalized to a rectangular 30×34
  (several handoff rows were 29 wide; `loadTileGrid` throws on a ragged grid).
  `G.level` is **not** consulted — `levelType()`'s interval is just a cadence number; the
  spawn loop emits off the authored terminals' own `enemy` types, so any mix works.

### Conveyors — the PUSH mechanic (GDD §8.1.2)

- **Consume the already-baked field; no new geometry.** The loader bakes
  `world.pushField` (sum of every covering strip; built last session). Activation is
  purely the read side: `pushAtWorld(x,y)` looks up a body's current cell, and
  `applyBeltPush(b, dt)` adds that vector via `moveBody` (collision-resolved, so the
  belt can't shove a body through a shelf). **Crossing strips are already summed into a
  diagonal at the overlap**, so an East×North overlap pushes NE with *zero*
  intersection-specific code — verified through the existing field, per the task.
- **Ground robots: push added AFTER the AI.** In `updateEnemies`, each per-type updater
  runs unchanged, then `applyBeltPush(e, dt)` is called additively. **Drones are immune**
  — the flying check lives **inside** `applyBeltPush` (`if (b.flying) return false`), so
  the single call site needs no guard and the immunity is unit-testable. (Alt: gate at
  the call site — rejected; the helper is the one place every caller shares.)
- **Dan: move + belt, then clamp the net.** `player.js` computes
  `net = clampNet(move·speed + belt, DAN_NET_SPEED_MAX)` and moves once. So riding with
  the belt speeds him up, pushing against it slows him *but still makes headway*, and a
  fast belt can't fling him past `CFG.DAN_NET_SPEED_MAX` (320, just above `DAN_SPEED`
  185 so normal travel is uncapped). The belt acts even when standing still. `G.dan.onBelt`
  (set each frame) drives the hum. (Alt: apply belt as a second `moveBody` like enemies —
  rejected; Dan needs the *combined* vector clamped, not two independent shoves.)
- **Projectiles + the Atomic Dustbin are untouched.** Neither reads the field — soap
  shots, `ebolts`, and the sliding/attracting bin keep their own motion (GDD: the belt
  moves *entities*, not airborne ordnance / the special). Asserted positively in tests
  (a bolt on a belt moves only by its velocity; a settled bin doesn't drift).
- **Render: animated chevrons in the resultant direction.** `drawConveyors` (render.js,
  between floor and walls) draws any non-zero-push floor cell as a dark rubber band with
  side rails and a marquee of chevrons scrolling along `atan2(dy,dx)`, scroll speed ∝ the
  belt magnitude. At an intersection the resultant is the **diagonal sum**, so the single
  chevron set points diagonally — the crossing reads as "both directions" (the GDD's
  allowed "or a diagonal"), again with no special case. Palette: `belt*` in `palette.js`.
- **Audio: one managed looping voice, not a one-shot.** `sfx.conveyor(active)` (audio.js)
  lazily builds a single persistent hum (looping filtered-noise rumble + a low sawtooth
  motor) and only **ramps its gain** in/out (`setTargetAtTime`) on a state *change*, so
  the per-frame call from `update.js` is cheap and idempotent. It connects through
  `master`, so the **M mute** silences it. `update.js` calls `conveyor(!!G.dan.onBelt)`
  while playing and `conveyor(false)` in every non-playing branch (so it fades on
  level-clear / death). This is the sustained-loop voice the §10 vortex-hum note deferred.
- **Test level is opt-in.** `conveyorTestLevelDef()` (level.js, exported) is a fixed
  Level Definition with (a) a full-width E–W belt band that fully divides the player room
  from the exit room — crossing it is the only route — and (b) a full-height N–S belt
  crossing it for the diagonal. `buildLevel` loads it through the **same loader** when
  `G.level === CFG.CONVEYOR_TEST_LEVEL` (default **0 = off**, so normal play and the
  one-type-per-level plan are untouched; set it to a level number to walk the demo).
- **Tests.** `test-conveyor.js` (`node test-conveyor.js`, 25 checks): push applied to
  ground bodies + summed diagonally at an intersection, ignored by fliers; Dan's net
  speed clamped + with-belt faster than against; ground enemy carried via `updateEnemies`;
  bolt + settled dustbin unaffected; the demo level loads with belts/diagonal correct.

---

### Level progression overhaul

- **Map layout and level type are now independent axes.** `buildLevel` picks a map at
  random from `MAP_POOL` (6 entries: `null` = procgen + the 5 authored keys); the enemy
  type/composition is still set by `LEVEL_PLAN` index (level-plan mode) or the playlist
  entry (hand-authored mode). The authored maps' baked-in terminal `enemy:` fields are
  **ignored** at runtime — `buildAuthoredDef` replaces them from `buildSpawnRulesForType`
  so the map geometry stays authored but the enemies match the current level type.
- **`buildSpawnRulesForType` is the shared terminal-rule builder.** Extracted from
  `generateLevelDef` so both the procgen path and the authored-map path produce identical
  terminal composition. The Manager/Scanner companion-Picker rule, the `"mixed"` one-of-
  every-type seeding, and the level-scaling `termCount` formula all live here and are not
  duplicated.
- **`G.gameMode` is set at the title, NOT by `newGame`.** `newGame()` builds the world
  using whatever `G.gameMode` is already set; `startRun(inputDevice, gameMode, playlist)`
  in `input.js` is the sole setter before each run. This means `newGame()` is safe to call
  from any surface without resetting the chosen mode.
- **Playlist files live in `data/playlists/`.** `data/playlists/index.json` is an array of
  filenames; `src/playlists.js` fetches it at boot via `loadPlaylists()` (called from
  `atomic-dustbin-dan.html` before the loop starts). Each file is validated at load time:
  unknown map key, unknown enemy key, or missing `terminalCount` → warn + skip that entry;
  if all entries fail → skip the playlist. `G.availablePlaylists` is populated once and
  never reset. If `index.json` is absent or empty, Hand Authored mode is hidden.
- **Title screen now has three phases** (`G._titlePhase`): `"input"` (device selection,
  original screen), `"mode"` (Level Plan vs Hand Authored), `"playlist"` (if ≥2 playlists
  available). Mode select and playlist picker are rendered by `screens.js`
  (`drawTitleModeSelect`, `drawTitlePlaylistPicker`). Keyboard: 1/2/3… select; SPACE/Enter
  on `"input"` advances to `"mode"`. Gamepad: D-pad up/down + A/START via `pollTitleMenu`
  (called from `pollGamepad`). `G._titlePhase` resets to `"input"` on each `startRun`.
- **`]` debug authored-level cycle removed.** The key, its cycle state vars
  (`authoredIdx`, `cycleAuthoredLevel`), and the `AUTHORED_LEVELS` import in `input.js`
  are all gone. Authored levels are live gameplay via `MAP_POOL` now.
- **`nextLevel` advances `G.playlistIndex`** (wraps modulo `playlist.levels.length`) in
  hand-authored mode. Loop-back (index wraps to 0) is noted with a TODO for difficulty
  escalation — not implemented yet.
- **`buildSpawnRulesFromEntry` handles three entry shapes:** single-enemy (1 terminal pool),
  multi-enemy non-mixed (terminals split round-robin via `floor(terminalCount/types.length)`,
  min 1), and `mixed:true` (one terminal per listed enemy, count=1 preplace=1 — the
  standard multi-type spawn loop runs all of them).
- **Tests.** `test-level-routing.js` (197 lines, 11 checks): MAP_POOL contents,
  `buildSpawnRulesForType` scaling/capping/mixed/companion rules, `buildAuthoredDef`
  terminal replacement, `nextLevel` index wrapping. `test-playlist.js` (229 lines, 17
  checks): `validateEntry` / `validatePlaylist` for all bad-field variants, skip behavior,
  `buildSpawnRulesFromEntry` for all three entry shapes including the actual
  `warehouse-warmup.json`, `playlistIndex` modular loop math.

---

### Iris wipe transition

- **Single star shape** (5-point, outer radius = `hypot(VIEW_W, VIEW_H) * 0.75` at full
  scale) used as a compositing mask. Drawn on an offscreen canvas with `destination-out`
  to punch a hole in the dark overlay (`rgba(28,31,38,0.80)`), then blitted to the main
  canvas. NOT a grid of icons. The star hole reveals the game; the dark surround is
  80% opaque so the game is faintly visible through it.
- **Level-start focal point deferred to first playing frame (`G._wipeOpenPending` flag)**
  so camera is settled before screen-space coords are computed. `loadLevel` sets the flag;
  `update.js` consumes it immediately after `updateCamera()`.
- **Scale semantics:** `scale` in `drawWipe` is the "covered fraction" — `R = MAX_R * (1 - scale)`.
  `scale=0` → R=MAX_R (huge star, fully revealed); `scale=1` → R=0 (tiny star, fully covered).
  Closing: scale 0→1 (star shrinks, dark covers). Opening: scale 1→0 (star grows, reveals).
- **Wipe state is module-local in `wipe.js` (not on G)** — ephemeral render state that
  doesn't need to survive a reload or be inspectable by other systems.
- **`G.transition` is set to `WIPE_CLOSE_DUR + WIPE_HOLD_IN + 0.05`** so `nextLevel()`
  fires when the screen is fully covered. Achievement modal pauses `G.transition`
  naturally, keeping the screen covered while the modal is displayed.
- **`drawWipe()` is the last call in `render()`** — renders on top of HUD, achievement
  banners, and all state screens.
- **Tests.** `test-wipe.js` (`node test-wipe.js`, 13 checks): all phase transitions
  (`closing→hold_in→none`, `hold_out→opening→none`), no-op when `phase=none`, no
  throws during draw.

---

### Pause menu + Save/Load system

- **`state="paused"` freezes the world.** `update.js` returns immediately after
  `pollPause(dt)` when `G.state === "paused"` — no Dan, enemies, spawns, or effects
  run. `updateWipe(dt)` and `pollGamepad()` still run (they're called before the
  branch) so an in-progress wipe can finish and gamepad START can un-pause.
- **`pause.js` owns all sub-screen state.** `subScreen` / cursor positions / option
  values are all module-local in `pause.js` — none are on `G`. Only `G.state` and
  `G.high` (quit path) are mutated from pause.js.
- **Module-local `_keys` avoids circular import with `input.js`.** `pause.js` registers
  its own `keydown`/`keyup` listeners tracking `_keys{}`. `input.js` imports from
  `pause.js` (to call `openPause` / `handlePauseKeydown`); if `pause.js` imported
  `keys` from `input.js` there'd be an ES-module evaluation cycle that can leave one
  side undefined. Duplicate listeners on the same events are harmless.
- **Belt hum stops immediately on `openPause()`.** `sfx.conveyor(false)` is called
  inside `openPause`. The hum naturally resumes on the next `update()` frame after
  `closePause()` if Dan is still on a belt (`G.dan.onBelt` check in `update.js`).
- **All pause sub-screens:** `menu` / `options` / `save` / `confirm_overwrite` /
  `confirm_quit` / `name_entry`. `SAVE & QUIT` opens the 5-slot picker; picking an
  occupied slot shows overwrite confirm; an empty slot (or YES on overwrite) goes to
  name entry; committing calls `saveGame()` then `_doQuitToTitle()`.
- **Save = level start, not mid-level position.** `_buildSnapshot()` reads G fields at
  save time; on resume `resumeFromSave` restores those fields then calls `buildLevel()`
  — the player re-plays from the top of the saved level.
- **Gamepad name entry accepts default name `"SAVE N"`.** Keyboard gets full typed
  entry via `handlePauseKeydown` (printable chars, Backspace, Enter); gamepad players
  confirm with A/Start to accept the default (or B to cancel back to the slot picker).
- **Title load screen is `G._titlePhase = "load"`.** L key on the input phase
  activates it; rendered by `_drawTitleLoadScreen()` in `screens.js`. Up/Down to
  navigate, Enter to load, ESC to return. Empty slot Enter = no-op.
- **Load always sets `G.inputMode = "keyboard"` before `resumeFromSave`.** This must
  be set before `resumeFromSave` calls `buildLevel` → `G.state = "playing"`, so audio
  and the game loop have a non-null mode immediately. Gamepad still works in-game via
  the existing polling.
- **High score loaded at boot** from `add_high` localStorage key via
  `atomic-dustbin-dan.html` (`G.high = loadHighScore()` before the loop starts).
  `_doQuitToTitle()` also updates `G.high` from `G.score` before quitting.

### Save/Load system (savegame.js — Phase 1)

- **Save point = level start, not mid-level.** A save captures the state at the
  beginning of the current level number (score/HP/powerups/dustbin carried). On
  resume, `resumeFromSave` restores those fields then calls `buildLevel()` — the
  player re-plays from the top of the saved level. No mid-run checkpoint.
- **5 slots, `add_save_N` localStorage keys** (0-indexed, N = 0..4). Separate
  keys: `add_prefs` (masterVolume), `add_high` (global high score). High score
  is NOT per-slot; it lives globally so it persists across runs and deletions.
- **`savegame.js` is a pure leaf.** No imports from any game module. Operates
  only on `localStorage` + `JSON`. This keeps it testable headlessly (Node.js
  mock) and avoids circular deps.
- **`resumeFromSave(saveData, availablePlaylists)` is exported from `level.js`.**
  It restores `G.score/level/gameMode/playlist/playlistIndex/dan/powerups`, then
  calls the existing `buildLevel()`. Must be called AFTER `newGame()` so `G.dan`
  and `G.powerups` are fresh objects before the overrides are applied.
- **Playlist fallback:** if the saved playlist filename no longer exists in
  `G.availablePlaylists` (file deleted / renamed), `resumeFromSave` silently
  falls back to `"levelPlan"` mode. No error thrown; the level still loads.
- **`buildLevel` is now exported** so `resumeFromSave` (and future callers) can
  call it directly without going through `newGame` or `nextLevel`.
- **Tests:** `test-savegame.js` (node, 24 checks): listSaves empty state,
  saveGame/loadSave round-trip, null untouched slot, deleteSave, version field,
  corrupt-JSON → null, prefs default/save/load, highScore default/save/load,
  boundary slot (4), listSaves sparse-write pattern.

---

## Architecture map (where things live)

> The game is now **ES modules** under `src/`, loaded by `atomic-dustbin-dan.html`
> (which only imports and runs the delta-timed loop). Run it from a static server
> (e.g. `python3 -m http.server`) — `file://` blocks module loads. All mutable
> run/level state lives on the single `G` object in `state.js`; modules read &
> mutate `G.dan`, `G.shots`, … (ES modules can't reassign an imported binding, so
> whole-value resets like `G.shots = []` happen in `level.js`).

**Module layout** (leaf-first; arrows = imports):

- **`config.js`** — `CFG` (incl. `CFG.KEYS` cardinal assignments + `CFG.GAMEPAD` deadzones/button indices, `CFG.TILES` per-type tile flags, `CFG.GEN_COLS/ROWS` procgen size, `CFG.CONVEYOR_SPEED`), `ENEMY` (per-type stat table + ranged stats), `POWERUPS`/`POWERUP_KEYS`, `LEVEL_PLAN`. Pure data. *No imports.*
- **`palette.js`** — `COL`, `TERMINAL_TINT`. *No imports.*
- **`canvas.js`** — `canvas`, `ctx`, `VIEW_W/H`. *No imports.*
- **`audio.js`** — Web Audio SFX (GDD §10): the `sfx.*` sound library + `tone`/`noise`/`sequence` synth helpers, lazy AudioContext + `master` gain, `unlock`/`toggleMute`/`isMuted`, per-sound throttle. ← config (`CFG.AUDIO`) only. Called for its side-effects from player/combat/projectiles/enemies/dustbin/level/vending/workers/update; `unlock`+`toggleMute` from input.
- **`state.js`** — `G` (the mutable container: run meta + entities `dan/shots/enemies/terminals/pickups/marks/floats/ebolts/vending/dustbin/dustbinPickups/workers/camera/exit` + `spawnTimer`/`pickupTimer` + `inputMode`) and `levelType()`. ← config.
- **`world.js`** — `map[][]` (exported `let`, char grid, reassigned only by `loadTileGrid`) + the §8.1 loader primitives: **`loadTileGrid`** (grid→`map`, sets `CFG.COLS/ROWS`), **`bakeConveyors`**/**`pushField`**/**`pushAt`** (per-cell push field) + the consume-side helpers **`pushAtWorld`** (push at a body's cell), **`applyBeltPush`** (additive belt move for a ground body; skips fliers), **`clampNet`** (Dan's move+belt net-speed clamp), and `CFG.TILES`-driven `isWall`/`blocksLOS`/`isDestructible`. Plus `randomFloorTile`/`randomFloorTileTC`/`randomFloorTileNearWall` (wall-adjacent tile for flush placement)/`hasLineOfSight`/`destroyShelf` (destructible-only), collision `bodyHitsWall`/`moveBody`, tile helpers `tileFloor`/`tileCenter`/`tileClearRun`/`rectPerimeterClear`, `clamp`, `isBorderTile`. ← config, state. (No longer imports canvas — decoupled from the DOM.)
- **`effects.js`** — `addFloat`, `updateEffects` (marks + floats lifetimes). ← state.
- **`combat.js`** — shared damage/death: `hitDanRanged`/`hitDanArea` (i-frame + knockback), `meleeContact` (0-dmg-safe; `berserDmgBonus` when berserk), `damageEnemy` (friendly-fire damage → no-score kill), `killEnemy(index, {score})` (points + score float unless `score:false`; Manager berserk pulse either way), `destroyTerminal`. ← config, palette, state, effects.
- **`projectiles.js`** — the `G.ebolts` pool: `fireEnemyBolt/Arc/Drop/Homing` + `updateEbolts` dispatching by `kind` (`bolt`/`arc`/`drop`/`homing`; `updateArc/Drop/Homing` helpers, `detonateHoming` blast). `bolt`/`homing` also friendly-fire ground robots (skip fliers/terminals) via `damageEnemy`. ← config, state, world, combat.
- **`enemies.js`** — `spawnEnemy` (per-type init), `updateEnemies` (dispatch + melee contact via `combat`), per-type AI `updatePicker/Forklift/Security/Sorter/Cleaner/Drone/Manager/Scanner/Inventory`, `buffSpd` (combined Manager-berserk + Scanner-alarm speed mult), Cleaner/Scanner patrol routing (`nearestWaypoint`/`buildCleanerPatrol`/`advancePatrol`) + Cleaner spray helpers (`danInSprayCone`/`coneRayDist`(exported, also clips the rendered cone)/`applySpray`). ← config, state, world, combat, projectiles, **workers** (`killWorker`, for the Inventory Bot), **dustbin** (`vortexHold`, for the attract phase).
- **`level.js`** — run lifecycle + the §8.1 **generator** and **loader**. `newGame` (full reset) → `buildLevel` = `loadLevel(generateLevelDef())` → `nextLevel`. `generateLevelDef` emits a Level Definition (tile grid + zones + fixed player/exit + spawn rules; single-type, Manager/Scanner +Picker cluster, or the `"mixed"` all-types branch). `loadLevel` (exported, the ONLY level entry point) validates (`validateLevelDef`), parses tiles, bakes conveyors, resolves placements, and runs spawn rules (`runSpawnRule` + `pickTile`/`pickWallTile` zone placement honoring `avoid`/non-solid). Keeps HP/powerups/score/carried-dustbin. Also spawner-terminal emission `spawnFromTerminal`/`spawnWave`; pickups `spawnPickup`/`updatePickups`. ← config, state, world, enemies, vending, dustbin, effects.
- **`vending.js`** — `spawnVendingMachine(variant, spot)` (builds one flush-against-wall cabinet at a wall-adjacent spot the loader picks) + `updateVending` (contact trigger, maxHp-capped heal, single-use depletion). ← config, state, world (`tileCenter`), effects, palette. Called from `level.js` (loader's vending spawn rules) and `update.js` (update); drawn by `render.js`.
- **`dustbin.js`** — the Atomic Dustbin special (GDD §5): `spawnDustbinPickup(pos)` (one floor pickup; the loader's atomicDustbin rule drives count/rarity), `updateDustbin` (collect + deploy E/F + slide→attract→detonate state machine), `vortexHold` (the attract-phase pull, called from `enemies.js`). ← config, state, **input** (`isDeploySpecial`/`getMoveVec`), world (`moveBody`/`isWall`), combat (`killEnemy`), effects, palette. Called from `level.js` (loader) and `update.js` (update); drawn by `render.js`. NB: `dustbin → input → level → dustbin` is an import cycle, but every cross-module use is inside a function (runtime), so module evaluation is safe.
- **`workers.js`** — `updateWorkers` (wander/avoid + rescue-on-contact), `rescueWorker` (escalating points + counter + callout), and `killWorker` (exported; Inventory Bot's no-points worker kill). ← config, palette, state, world, effects.
- **`input.js`** — device-agnostic input layer. Exports `getMoveVec()`/`getFireAngle()`/`isDeploySpecial()` (route by `G.inputMode`), `pollGamepad()` (called from `update.js`), and the raw `keys`/`mouse` (mouse aim, `M` mute, debug). Registers key/mouse/touch listeners on import (side-effect), unlocks audio on the first gesture, binds `M` = mute, and starts/restarts runs via `startRun(mode)`. ← config, canvas, state, level (`newGame`), audio (`unlock`/`toggleMute`).
- **`player.js`** — `updateDan` (slow move-scaling, decays `slow`/`sprayTick`), `fireVolley`/`fireBubble`, `updateShots` (bubble↔enemy↔terminal). ← config, state, input, world, combat.
- **`update.js`** — `update(dt)` orchestrator: `pollGamepad()` first (every state), then (when playing) Dan → shots → **dustbin** → spawn → enemies → ebolts → pickups → vending → workers → effects → camera + `updateCamera` + spawn/terminal/exit/death bookkeeping. ← state, config, input (`pollGamepad`), player, enemies, projectiles, workers, vending, dustbin, level, effects, world, canvas.
- **`render-entities.js`** — `drawEnemies` (per-type sprites + berserk aura) + `drawEbolts` (bolt/arc/drop/homing). ← canvas, state, config, palette, enemies (`coneRayDist`).
- **`screens.js`** — `drawHUD` + `drawTitle` (both "SPACE — KEYBOARD" / "A / START — GAMEPAD" options + the O/;/L/K `drawFireLegend`) / `drawLevelClear` / `drawGameOver` (continue prompt keyed to `G.inputMode`). ← canvas, state, config, palette.
- **`render.js`** — `render()` compositor + world/entity draws (`drawFloor`/`drawWalls`/`drawMarks` incl. the `"blast"` detonation ring/`drawExit`/`drawExitPointer`/`drawVending`/`drawDustbins`(floor pickups + sliding canister + attract vortex, via `drawDustbinCan`)/`drawTerminals`/`drawShots`/`drawPickups`/`drawWorkers`/`drawFloats`/`drawDan` incl. carried-dustbin cue). ← canvas, state, config, palette, world, render-entities, screens.
- **`atomic-dustbin-dan.html`** — entry: imports `update` + `render` (+ `input` for its listeners) and runs the delta-timed `loop`. Nothing else.

---

## Testing scaffolding to replace with real GDD behavior later

- Power-up pickup respawn (`CFG.PICKUP_RESPAWN` / `MAX_PICKUPS`).
- Atomic Dustbin floor placement is L1-guaranteed + `CFG.DUSTBIN.spawnChance` 0.5 elsewhere (now expressed as the generator's `atomicDustbin` rule `count`); real "rare" weighted placement is a generator tuning pass.
- Terminal counts + per-type `spawners`/`preplace`/`interval`/`max` are test tuning; real difficulty mix (multiple types per level, scaling) comes with GDD §8.3. These now live as the generator's terminal **spawn rules** — §8.3 changes the generator, not the loader.
- The generator's geometry is still the simple shelf-row test layout fed through the §8.1 loader; **richer shelf structure / guaranteed-placement procgen** is a generator-side pass (the loader contract is done).

---

See STATUS-ACHIEVEMENTS.md for achievement system decisions.
