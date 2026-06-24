# Atomic Dustbin Dan — Working Context

Top-down twin-stick arcade shooter. Single-file HTML5 Canvas + JS, delta-timed
loop, retro warehouse look. Dan (warehouse janitor) fights malfunctioning robots
with a soap-bubble launcher; endless procedural levels.

This file is the always-loaded spine. Read it every session. For detail:
- **GDD.md** — canonical design intent ("what the game should be"). Cold storage; open it when designing or building a specific feature.
- **STATUS.md** — what's actually built, why, and where the code lives. Open it when modifying an existing system.

---

## Non-negotiable decisions (do not silently change)

These are deliberate and override naive readings of the GDD. Changing any of them
is a design decision, not a fix.

- **HP, power-ups, and score PERSIST across levels.** (GDD §2.1 also specifies HP carry-over — they agree.)
- **Power-up decrement = once per trigger, per active counter.** Triple Shot's 3 bubbles = 1 decrement.
- **Max shots on screen = `3 + 3·(Rapid) + 3·(Triple)`**, volley-gated → 3 / 6 / 6 / 9.
- **Bounce** reflects per-axis off walls; a shot lives until its travel range expires.
- **One enemy type per level** (testing), set by `LEVEL_PLAN` — except the Manager/Scanner levels (seed a Picker cluster) and the trailing **`"mixed"` sandbox** (L10+: one terminal of every real type). `"mixed"` is a pseudo-type with **no `ENEMY` entry**; only `buildLevel` + `update.js` special-case it. Levels reachable in sequence via the exit door.
- **All enemies spawn from destroyable terminals** (generalized Dispatch Terminal). A single GLOBAL spawn cadence per level (`spawnTimer` + the type's `interval`) emits from a random matching terminal, capped by the type's `max`. Destroying ALL a type's terminals stops its spawns; thinning some does NOT slow the rate.
- **Levels load through ONE loader** (GDD §8.1). Every level is a plain-data **Level Definition**; `loadLevel` (`level.js`) is the sole entry point to a playable level, and procgen is just a *producer* of these objects (`generateLevelDef`) — never generate a playable level directly, bypassing the loader. `map` holds a **tile char**, and collision/LOS/destructibility read per-type flags from **`CFG.TILES`** (`isWall`/`blocksLOS`/`isDestructible`) — do not revert to a 0/1 grid or hardcode tile behavior. Conveyor strips are parsed + **baked** into `world.pushField`, but the **push is not applied yet** (next session); don't assume belts move entities. `CFG.COLS/ROWS` are loader-set from the grid (procgen sizes itself from `CFG.GEN_COLS/ROWS`).
- **Knockback** is `+dx/dist` — pushes Dan AWAY from the enemy.
- **Worker rescue values double: 100/200/400/800/1600** (`rescueBase·2^G.rescued`), summing to 3,100 for all 5. **Rescuing all 5 does NOT auto-complete the level** — the exit door stays the only level-end trigger (GDD §8.2 was TBD; this is the chosen resolution). `G.rescued` resets each level; score persists. Workers are killable only by the (unbuilt) Inventory Bot.
- **After every implementation change, update STATUS.md** — the "Current state" bullet for the affected system and the relevant subsystem decisions block if reasoning changed. STATUS.md is the handoff artifact; it must reflect reality after every session.

### Controls (canonical — matches GDD §4.1, §4.3, §4.5–§4.8)

**Input is device-agnostic.** Player-action code NEVER reads raw keys/axes — it calls
`input.js`'s `getMoveVec()` / `getFireAngle()` / `isDeploySpecial()`, which route to
keyboard or gamepad by **`G.inputMode`** (`null` on title, then `'keyboard'` or
`'gamepad'`). **Never bypass `G.inputMode`** when reading input. Cardinal key
assignments live in `CFG.KEYS` (`MOVE` N=W E=D S=S W=A · `FIRE` N=O E=`;` S=L W=K);
**diagonals are derived at runtime** as the vector sum of two adjacent cardinals —
there are NO dedicated single-key diagonals. (Fire East is `;`, not P per GDD §4.3 —
a deliberate divergence matching the physical O / K L ; cluster.)

**Keyboard fire** — four cardinals, diagonal = two adjacent held; fire angle is the
normalized vector sum (opposing keys cancel → no fire). Mouse aims + left-click fires
(keyboard mode only); Dan faces the cursor whenever no fire key is held.

```
O+K  O  O+;     NW N NE
 K  (·) ;       W  ·  E
L+K  L  L+;     SW S SE
```

N=O  E=;  S=L  W=K   ·   NW=O+K  NE=O+;  SW=L+K  SE=L+;

**Keyboard movement** — WASD cardinals; diagonal = two adjacent (W+A=NW, W+D=NE,
S+A=SW, S+D=SE). **Special** (Atomic Dustbin) = E or F. **Gamepad** — left stick move
(360°), right stick aim+fire (360°), any bumper/trigger (BTN 4–7) = special, Start/A
(BTN 9/0) = start/restart. Deadzones + button indices in `CFG.GAMEPAD`.

**Mode selection** — title offers both ("SPACE — KEYBOARD" / "A / START — GAMEPAD");
first valid input locks the mode for the run, disabling the opposing device. Game-over
restart keys off the active mode. `newGame()` is wrapped by `startRun(mode)` in
`input.js`, which sets `G.inputMode` after the rebuild.

Per-subsystem "confirm if changing feel" decisions (ranged/i-frames, Sorter, Cleaner,
Drone, Manager) live in STATUS.md next to each system.

---

## Code map (ES modules under `src/`)

The game is **modularized**: `atomic-dustbin-dan.html` is just the entry point
(imports + the delta-timed loop). Serve it over http(s) — `file://` blocks ES
module loads (`python3 -m http.server`). The full module-by-module map (imports
and responsibilities) is in **STATUS.md → "Architecture map"**. Quick orientation:

- **Data/leaves:** `config.js` (`CFG`, `ENEMY`, `POWERUPS`, `LEVEL_PLAN`), `palette.js` (`COL`), `canvas.js` (`ctx`/view dims), `audio.js` (Web Audio `sfx.*` SFX — GDD §10; called at each gameplay event).
- **State:** `state.js` — the single mutable `G` object (run meta + all entities `dan/shots/enemies/terminals/pickups/marks/floats/ebolts/camera/exit` + timers) and `levelType()`. Modules read/mutate `G.*`; whole-value resets (`G.shots = []`) live in `level.js`.
- **World:** `world.js` — `map`, collision (`moveBody`), geometry/LOS, `destroyShelf`.
- **Sim:** `player.js` (Dan + soap shots), `enemies.js` (spawn + per-type AI incl. Inventory worker-hunter; `buffSpd` combines Manager berserk + Scanner alarm), `projectiles.js` (`G.ebolts` pool; `kind`: `bolt`/`arc`/`drop`/`homing`), `combat.js` (damage/kill/berserk), `workers.js` (human workers wander/flee + `rescueWorker`/`killWorker`), `dustbin.js` (Atomic Dustbin special §5 — carry/throw/slide/attract/detonate + `vortexHold`), `level.js` (newGame/nextLevel + the §8.1 **generator** `generateLevelDef` and **loader** `loadLevel` — `buildLevel` = `loadLevel(generateLevelDef())`; terminals/pickups/5 workers via spawn rules; `"mixed"` branch), `effects.js`. `update.js` orchestrates one frame.
- **Render:** `render.js` (compositor + world draws), `render-entities.js` (enemy/ebolt sprites), `screens.js` (HUD + title/levelclear/gameover). `input.js` registers listeners on import.
- States: `title` / `playing` / `levelclear` / `dead`.
- **Adding an enemy:** stats in `config.js` (`ENEMY` + `LEVEL_PLAN`), color in `palette.js`, spawn-init + AI in `enemies.js`, sprite in `render-entities.js`, any new projectile `kind` in `projectiles.js`.

---

## Roadmap

Each step adds ONE new system. Pair Scanner/Manager with Pickers; defer Inventory
until human workers exist. Detailed per-step notes + the Scanner implementation plan
are in STATUS.md.

1. Picker + destroyable Dispatch Terminal — **DONE (L1)**
2. Forklift Bot (charge + LOS + destructible shelves) — **DONE (L2)**
3. Security Bot + shared enemy-projectile system (`bolt`) — **DONE (L3)**
4. Sorter Bot (flee/cover AI + `arc` lob) — **DONE (L4)**
5. Cleaner Bot (cone spray + first status effect on Dan) — **DONE (L5)**
6. Drone (first flier + vertical `drop` bomb) — **DONE (L6)**
7. Manager Bot (`homing` missile + on-death berserk pulse) — **DONE (L7)**
8. Scanner Bot (continuous alarm buff; LOS-gated; alongside Pickers) — **DONE (L8)**
9. Inventory Bot (wanderer/worker-hunter; ONLY robot that kills workers) — **DONE (L9)**

**Enemy roster COMPLETE** (all 9 + Dispatch Terminal). Human workers + rescue scoring
(§7) **DONE** (`workers.js`); the **`"mixed"` all-types sandbox** is L10+; the **Atomic
Dustbin special (§5) DONE** (`dustbin.js`); the **audio system (§10) DONE** (`audio.js`);
the **§8.1 Level Definition format + loader DONE** (`level.js` generator+loader, `world.js`
tile/conveyor primitives, `CFG.TILES`) — see STATUS "Level Definition format & loader".

**Larger unbuilt GDD features:** conveyor **push** mechanic (the §8.1 push field is
baked but not yet applied — queued in STATUS), richer generator geometry /
guaranteed-placement tuning (the §8.1 *loader contract* is done), sprite-art polish (§10).
