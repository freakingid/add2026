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
- **Levels load through ONE loader** (GDD §8.1). Every level is a plain-data **Level Definition**; `loadLevel` (`level.js`) is the sole entry point to a playable level, and procgen is just a *producer* of these objects (`generateLevelDef`) — never generate a playable level directly, bypassing the loader. `map` holds a **tile char**, and collision/LOS/destructibility read per-type flags from **`CFG.TILES`** (`isWall`/`blocksLOS`/`isDestructible`) — do not revert to a 0/1 grid or hardcode tile behavior. Conveyor strips are parsed + **baked** into `world.pushField` and the **push is applied** each frame to Dan + ground robots (drones immune; projectiles/Dustbin unaffected; net Dan speed clamped) — see STATUS "Conveyors". `CFG.COLS/ROWS` are loader-set from the grid (procgen sizes itself from `CFG.GEN_COLS/ROWS`).
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

*This section lags real growth — it's known to be missing several files that
exist and are built per `STATUS.md` (e.g. `render-ebolts.js`, `wipe.js`,
`pause.js`, `achievements.js`, `optionsmenu.js`, `savegame.js`, `playlists.js`,
`menuedge.js`, `events.js`). Treat `STATUS.md`'s "Architecture map" as
authoritative when the two disagree; this stays useful for core-loop
orientation, not as a complete file list.*

The game is **modularized**: `atomic-dustbin-dan.html` is just the entry point
(imports + the delta-timed loop). Serve it over http(s) — `file://` blocks ES
module loads (`python3 -m http.server`). Quick orientation:

- **Data/leaves:** `config.js` (`CFG`, `ENEMY`, `POWERUPS`, `LEVEL_PLAN`), `palette.js` (`COL`), `canvas.js` (`ctx`/view dims), `audio.js` (Web Audio `sfx.*` SFX — GDD §10; called at each gameplay event).
- **State:** `state.js` — the single mutable `G` object (run meta + all entities `dan/shots/enemies/terminals/pickups/marks/floats/ebolts/camera/exit` + timers) and `levelType()`. Modules read/mutate `G.*`; whole-value resets (`G.shots = []`) live in `level.js`.
- **World:** `world.js` — `map`, collision (`moveBody`), geometry/LOS, `destroyShelf`.
- **Sim:** `player.js` (Dan + soap shots), `enemies.js` (spawn + per-type AI incl. Inventory worker-hunter; `buffSpd` combines Manager berserk + Scanner alarm), `projectiles.js` (`G.ebolts` pool; `kind`: `bolt`/`arc`/`drop`/`homing`), `combat.js` (damage/kill/berserk), `workers.js` (human workers wander/flee + `rescueWorker`/`killWorker`), `dustbin.js` (Atomic Dustbin special §5 — carry/throw/slide/attract/detonate + `vortexHold`), `level.js` (newGame/nextLevel + the §8.1 **generator** `generateLevelDef` and **loader** `loadLevel` — `buildLevel` = `loadLevel(generateLevelDef())`; terminals/pickups/5 workers via spawn rules; `"mixed"` branch), `effects.js`. `update.js` orchestrates one frame.
- **Render:** `render.js` (compositor + world draws), `render-entities.js` (enemy/ebolt sprites), `screens.js` (HUD + title/levelclear/gameover). `input.js` registers listeners on import.
- States: `title` / `playing` / `paused` / `levelclear` / `dead`.
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

**Conveyor PUSH mechanic DONE** (`world.applyBeltPush`/`clampNet`, belt render in
`render.js`, hum in `audio.js`; demo `conveyorTestLevelDef` gated by `CFG.CONVEYOR_TEST_LEVEL`)
— see STATUS "Conveyors". **Larger unbuilt GDD features:** seeding conveyor strips from the
*generator* (so generated levels get belts), richer generator geometry /
guaranteed-placement tuning (the §8.1 *loader contract* is done), sprite-art polish (§10).

---

## Claude Code session conventions

*Last reviewed 2026-07-01 — current judgment, not permanent law. Revisit the
size numbers and exemption list as the codebase grows; bump this date when you
do.* Each rule below leads with the imperative; the trailing clause is the
"why," read once and skip thereafter. A phase prompt may override any of these
for that phase only.

**Model.** Default **Sonnet, normal effort, thinking off**. Escalate to Opus
only after Sonnet produces broken output and one correction attempt fails.

**Git.** Claude Code **never** runs `git add`/`commit`/`push` — Paul does all
git manually. Solo project, single `main`, no branches.

**Edit with `str_replace`, not full rewrites** — far cheaper — *but* grep
`old_str` first; if it isn't unique, add context or rewrite instead (per-type
blocks repeat a lot: 9 enemy draws in `render-entities.js`, 5 track arrays in
`music.js`, per-type updaters in `enemies-ai.js`, per-state draws in
`screens.js`). A change touching many scattered lines is often cheaper as one
rewrite anyway.

**Read targeted, not whole files** — `grep` to locate, then `sed -n 'A,Bp'`
for the range. Load a whole file only when you truly need it (e.g. before a
split).

**Keep logic files ≤24KB** (soft ceiling). Two reasons: skimmability (large
files tempt whole-file pastes over targeted reads), and reasoning locality in
hot-path render code (see canvas rule below). **Flag any file within ~2KB of
the line** before editing, and note it in STATUS.md even if your edit doesn't
cross it. **Exempt: `music.js`, `achievements.js`** — mostly declarative data
read in isolation, where a size-only split buys nothing. **Not exempt:
`config.js`** — it's data too, but read constantly during logic work, so
skimmability matters; if it nears 24KB, make the exemption call explicitly
rather than defaulting into it. When splitting, follow precedent shape: suffix
split (`render-ebolts.js` from `render.js`) or full extraction (`music.js`
from `audio.js`).

**Know which coordinate space your render code runs in.** The camera
`translate` in `render.js` is the boundary: world-space draws (floor, walls,
entities, marks) go *inside* it and move with the camera; screen-space draws
(HUD, vignettes/flashes, wipe, achievement banner) go *outside* it and stay
fixed. Drawing on the wrong side of that line is the most common Canvas bug in
this codebase — and camera-effects code straddles it deliberately (world-space
desaturation inside, screen-space vignettes outside), so it's the easiest
place to get it wrong. Relatedly, when splitting a hot-path render file, keep
each `ctx.save()`/`restore()` pair and transform sequence within one file — a
byte-count split that severs one makes transform bugs harder to catch.

**Use `dt`, never frame counts, for timed math** — a frame-count accumulator
(`elapsed += 1`) or a rate that assumes ~60fps runs wrong on other refresh
rates and won't show up in normal testing. When touching timing math, reason
it through at a large `dt` (e.g. 1/30) and confirm it degrades gracefully —
doesn't overshoot, freeze, or divide-by-something-tiny — rather than assuming
step-size invariance (the exponential decays in `camerafx.js`/`dustbin.js` and
the piecewise curves in `wipe.js` are *not* linearly step-invariant, so a
"same result under uneven steps" test gives false positives on them).

**Smoke-test pure-math modules headlessly** — any module with no canvas/DOM
import (like `test-input.js`) gets `node`-runnable assertions. Add to
`test-input.js` unless that pushes it toward 24KB, then split to
`test-<feature>.js` (precedent: `test-achievements.js` → four files under
`run-tests-achievements.sh`).

**Verify logic, not just wiring.** After any split or cross-file move, three
cheap wiring checks: (1) `node --input-type=module -e "import('./src/<file>.js')"`
per touched file; (2) grep used identifiers against the import list (catches a
dropped import for a still-referenced symbol); (3) load a level and confirm the
intro animation completes (canary for a missing import that loads fine but
breaks on call). These catch wiring only — a module can load, resolve every
import, and animate while the *logic* is wrong (bad formula, flipped
conditional). For logic changes, trigger the actual in-game situation and
confirm the visible/audible/scored result; the feature's spec or phase prompt
should say concretely what "correct" looks like.

**Spec then phase, in separate sessions.** For any complex feature: write
`SPEC-*.md` first (design, schemas, exact tuning values), then a phased
prompts doc (`CLAUDE-CODE-PROMPTS-*.md`). Each phase block is
**self-contained** — restates what to read first and the model/effort setting,
plus files touched, watch-fors, and how to verify — because later phases
depend on earlier ones existing and each phase's manual verify step is a real
stopping point. Don't paste multiple phases at once.

**Audition audio by ear before wiring it in** — build a standalone
(no-server) browser audition tool first; specs carry programmatically
validated note data, not hand-transcribed guesses. Note the Web Audio gotcha:
playback needs a user gesture (`input.js` calls `audio.js`'s `unlock()` on
first input). Gameplay audio is safe (the title requires a gesture to start),
but anything playing *before* that — a boot sound, a fresh audition tool,
module-load playback — fails silently until unlocked; confirm unlock timing if
new audio isn't obviously post-title.

**If you break a convention mid-session, say so** — don't silently patch or
continue. Note it in STATUS.md (what happened, fixed-now or followup), the same
"STATUS.md reflects reality" standard everything else here holds to. Fix it
this session only if cheap and safe given what's in flight; otherwise flag it
for next session rather than risking an in-flight correction.