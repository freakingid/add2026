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
- **One enemy type per level** (testing), set by `LEVEL_PLAN`; levels reachable in sequence via the exit door.
- **All enemies spawn from destroyable terminals** (generalized Dispatch Terminal). A single GLOBAL spawn cadence per level (`spawnTimer` + the type's `interval`) emits from a random matching terminal, capped by the type's `max`. Destroying ALL a type's terminals stops its spawns; thinning some does NOT slow the rate.
- **Knockback** is `+dx/dist` — pushes Dan AWAY from the enemy.
- **After every implementation change, update STATUS.md** — the "Current state" bullet for the affected system and the relevant subsystem decisions block if reasoning changed. STATUS.md is the handoff artifact; it must reflect reality after every session.

### Keyboard fire keys (canonical — matches GDD §4.3)

Compass 3×3 on the right hand, `l` = no-fire center:

```
i o p     NW N NE
k l ;     W  ·  E
, . /     SW S SE
```

NW=i  N=o  NE=p  W=k  E=;  SW=,  S=.  SE=/

Per-subsystem "confirm if changing feel" decisions (ranged/i-frames, Sorter, Cleaner,
Drone, Manager) live in STATUS.md next to each system.

---

## Code map (ES modules under `src/`)

The game is **modularized**: `atomic-dustbin-dan.html` is just the entry point
(imports + the delta-timed loop). Serve it over http(s) — `file://` blocks ES
module loads (`python3 -m http.server`). The full module-by-module map (imports
and responsibilities) is in **STATUS.md → "Architecture map"**. Quick orientation:

- **Data/leaves:** `config.js` (`CFG`, `ENEMY`, `POWERUPS`, `LEVEL_PLAN`), `palette.js` (`COL`), `canvas.js` (`ctx`/view dims).
- **State:** `state.js` — the single mutable `G` object (run meta + all entities `dan/shots/enemies/terminals/pickups/marks/floats/ebolts/camera/exit` + timers) and `levelType()`. Modules read/mutate `G.*`; whole-value resets (`G.shots = []`) live in `level.js`.
- **World:** `world.js` — `map`, collision (`moveBody`), geometry/LOS, `destroyShelf`.
- **Sim:** `player.js` (Dan + soap shots), `enemies.js` (spawn + per-type AI + Cleaner patrol/spray), `projectiles.js` (`G.ebolts` pool; `kind`: `bolt`/`arc`/`drop`/`homing`), `combat.js` (damage/kill/berserk), `level.js` (newGame/buildLevel/nextLevel + terminals + pickups), `effects.js`. `update.js` orchestrates one frame.
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
8. Scanner Bot — buffs/alarms nearby robots; test alongside Pickers — **NEXT**
9. Inventory Bot — hunts human workers; needs the workers feature first.

**Larger unbuilt GDD features:** human workers + rescue scoring (§7), Atomic Dustbin
special (§5), full procedural placement (§8.1), audio (§10), sprite-art polish (§10).
