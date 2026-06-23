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

## Code map (current single-file build)

Top-level structure to orient in. The full function-by-function map is in STATUS.md.
**After modularization this section must be rewritten to point at module/file paths**
— "where things live" stops being function names and becomes files.

- `CFG` — global tunables (incl. `CFG.TERMINAL`, `CFG.DAN_IFRAME`, `CFG.SLOW_FACTOR`).
- `ENEMY` — per-type stat table (hp/speed/points/damage + spawner/cadence + ranged stats). Add new enemies here.
- `LEVEL_PLAN` `["picker","forklift","security","sorter","cleaner","drone","manager"]` + `levelType()`.
- Entities: `dan`, `shots`, `enemies`, `terminals`, `pickups`, `marks`, `floats`, `exit`, `ebolts`.
- Loop: `update(dt)` branches by state → `updateDan` / `updateShots/Enemies/Ebolts/Pickups/Effects/Camera`; per-type AI `updatePicker/Forklift/Security/Sorter/Cleaner/Drone/Manager`.
- Shared enemy-projectile pool `ebolts` with `kind`: `bolt` / `arc` / `drop` / `homing` (Cleaner cone is handled outside the pool).
- States: `title` / `playing` / `levelclear` / `dead`.

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
