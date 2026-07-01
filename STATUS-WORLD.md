# Atomic Dustbin Dan — World & Level Subsystem Decisions
Open only when modifying: input controls, level loading, conveyors, level progression,
wipe transitions, pause menu, or save/load. See STATUS.md for the build table and architecture map.

---

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

---

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
- **Cold-start same-frame double-edge guard (`_modeJustEntered`).** On a cold title,
  pressing gamepad START advances `input`→`mode` inside `pollGamepad`, which then falls
  through to `pollTitleMenu` **in the same frame**. `pollTitleMenu`'s own `_prevConfirm`
  is still `false`, so the still-held START read as a fresh confirm and auto-picked Level
  Plan before the modal rendered (it "self-corrected" after one run once `_prevConfirm`
  cycled). Fix: `advanceTitleToMode` sets `_modeJustEntered = true` (+ resets
  `G._titleMenuCursor`); `pollTitleMenu` bails on its first frame after that, seeding all edge
  trackers (`_prevConfirm/_prevUp/_prevDown/_prevBack`) from the current pad reads so the
  held button can't re-trigger. Keyboard was always immune (discrete keydown events).
- **ESC/B back-navigation out of mode/playlist.** Gamepad: `pollTitleMenu` edge-detects
  `CFG.GAMEPAD.BTN_BACK` (B, btn 1) via `_prevBack` — rising edge steps `playlist`→`mode`
  →`input` (resets `G._titleMenuCursor`). Keyboard: the keydown handler does the same one-level
  step-back on ESC while `G.state==="title"` and phase is `"mode"`/`"playlist"`. (The
  `"load"` phase keeps its own separate ESC→`input` handling.)
- **Mode-select copy relabeled to ENDLESS SHIFT / STORY ROUTE (ids unchanged).**
  `drawTitleModeSelect` (screens.js) now shows `[1] ENDLESS SHIFT` / `[2] STORY ROUTE`
  (was `LEVEL PLAN` / `HAND AUTHORED`) with a one-line description under each and a
  small muted "ESC / B — BACK" hint below the existing gp/keyboard select hint. Purely
  cosmetic — `titleMenuSelect`/internal mode ids (`"levelPlan"`/`"hand-authored"` etc.)
  are untouched, only the on-screen labels changed. The Phase 2b cursor-highlight rect
  (`_drawTitleMenuHighlight`) now takes an optional height (`h=34` default) so it can
  cover the taller label+description row (46px) without a second helper; row y-offsets
  and the logo's `yOffset` (`-60`→`-84`) were retuned so header/rows/hints all fit under
  the logo without overlap.
- **Title mode/playlist cursor is rendered (was a missing-render bug, not an input bug).**
  D-pad up/down updated the cursor correctly all along, but `drawTitleModeSelect`/
  `drawTitlePlaylistPicker` drew static rows with no highlight, so the cursor moved an
  off-screen value with no visible feedback. Fix: the cursor moved from a module-local
  `input.js` variable (`_menuCursor`) onto `G._titleMenuCursor` (`state.js`) so `screens.js`
  can read it, and both draw functions now call a shared `_drawTitleMenuHighlight(rowCenterY)`
  helper (translucent soap fill + stroke, same treatment as the load-screen's selected-slot
  highlight) before drawing each row's text. `HAND AUTHORED` only highlights when
  `G.availablePlaylists.length > 0` (cursor can't land there otherwise).
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
