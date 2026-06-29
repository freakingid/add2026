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

## Subsystem decisions
Decisions are split by concern — open only the file(s) relevant to your task:
- **STATUS-WORLD.md** — controls/input, level loader, conveyors, level progression, wipe, pause, save/load
- **STATUS-SYSTEMS.md** — enemy roster, vending, Atomic Dustbin, workers, mixed level
- **STATUS-AUDIO.md** — SFX, audio buses, music system
- **STATUS-ACHIEVEMENTS.md** — achievement definitions, XP, weekly rotation

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
