# Atomic Dustbin Dan — Game Design Document v1.0

Canonical design intent. This is "what the game should be." For what is actually
built and the decisions made along the way, see STATUS.md; for the cross-cutting
rules, see CLAUDE.md. Section numbers here are stable — STATUS.md references them.

### Build status index

- **Built:** §2 Player (incl. §2.5 Vending Machines), §3 Power-ups, §4 Controls (**full**: §4.1 keyboard move, §4.2 mouse aim/fire, §4.3 keyboard directional fire (N=O E=`;` S=L W=K + two-key diagonals; East is `;`, not P — see STATUS), §4.4 keyboard special, §4.5 input-mode selection, §4.6–§4.8 gamepad move/fire/special — device-agnostic `input.js`, see STATUS "Controls / input"), §5 Atomic Dustbin special, §6 Enemies (**full roster**: Picker, Forklift, Security, Sorter, Cleaner, Drone, Manager, Scanner, Inventory + Dispatch Terminal) plus a `"mixed"` all-types sandbox level, §7 Human workers + rescue scoring, §8.2 level-end, §8.3 progression, §10 audio.
- **Designed, NOT yet built:** §8.1 Level Definition format + loader (procgen to be refactored to emit it), §10 sprite-art polish.

---

## 1. OVERVIEW

- **Title:** Atomic Dustbin Dan
- **Genre:** Top-down twin-stick arcade shooter
- **Platform:** Browser (HTML5 Canvas + JavaScript)
- **Perspective:** Top-down, tile-based
- **Player Count:** Single player
- **Win Condition:** None (endless levels)
- **Level End Conditions:** Two possible — see §8.2

---

## 2. PLAYER CHARACTER

**Name:** Dan (lead warehouse janitor). **Premise:** Dan noticed the warehouse robots
malfunctioning and attacking human workers. Armed with his janitorial supplies, he
decided to take action.

### 2.1 Health

- Dan has **20 HP**.
- Health is **hit-based** (not draining).
- Restored by **vending machine pickups**: small **+5 HP**, large **+10 HP**.
- Health **carries over between levels**.

### 2.2 Melee Attack

- **Weapon:** Mop / plunger.
- **Trigger:** Automatic — activates on contact with any robot.
- Both Dan and the robot take melee damage on contact.
- Dan is **knocked back** a fixed distance immediately after contact.
- Damage is **not continuous** — another melee event only occurs if Dan re-enters contact range.
- Melee damage to robots: **2 HP per hit**. Damage to Dan: per robot type (see §6).

### 2.3 Ranged Attack

- **Weapon:** Soap bubble launcher.
- **Projectile:** Soap bubbles at base; escalates to cleaning pods with power-ups.
- **Ammo:** Unlimited — no resource management.
- **Base fire rate:** Standard. **Base max shots on screen:** 3.
- **Trigger:** Left mouse click (primary), or keyboard directional fire keys (see §4).
- **Projectile lifespan:** Each shot travels a fixed distance/duration and self-destructs if it has not hit a target.

### 2.4 Visual Progression of Ranged Shots (cosmetic only)

| State | Visual |
| :---- | :---- |
| Base | Iridescent translucent soap bubbles |
| Triple Shot active | Larger, more opaque cleaning pods |
| Bounce active | Shots leave brief soapy trail on walls at ricochet point |

### 2.5 Vending Machines

> **Status: BUILT** (`vending.js`). Contact-triggered, single-use, maxHp-capped.
> Test levels place one small + one large flush against walls; full weighted
> procedural placement (1–3 per level) awaits §8.1. Implementation/feel decisions
> (won't deplete at full HP; float shows actual HP gained) are in STATUS
> "Vending machines".

Vending machines are static, interactable health-restoration objects placed in each
level. They are the sole means of restoring Dan's HP mid-run and are diegetically
consistent with the warehouse setting (break-room / floor vending).

**Two variants:**

| Variant | HP Restored | Visual |
| :---- | :---- | :---- |
| Small | +5 HP | Shorter/narrower unit, dim glow |
| Large | +10 HP | Taller/wider unit, brighter glow |

**Placement:** Procedurally placed at level generation time, flush against walls
(must not block corridors). Each level contains **1–3 machines**; quantity and
placement are weighted against level size and enemy density. Suggested default
ratio: 2 small : 1 large per level.

**Interaction:** Triggered by Dan walking into contact — no button press required.
On contact the machine immediately restores HP to Dan, capped at his 20 HP maximum.
The machine then enters a **depleted state** and cannot be used again. Machines do
not respawn within a level.

**Robots and machines:** Robots ignore vending machines entirely. Machines are not
destructible and do not participate in enemy pathfinding or AI behavior.

**Feedback:**
- *Active state:* lit screen / display with a soft ambient glow (suggest green or
  blue to contrast the warehouse palette).
- *On use:* brief flash, a dispensing sound cue, and a floating "+5" or "+10" number
  rising from the machine.
- *Depleted state:* screen goes dark / static, glow extinguished. Remains in level
  as a visual landmark only.

---

## 3. POWER-UPS

Power-ups are **shot-count based** — each pickup grants a fixed number of enhanced
shots (suggested: **75 shots per pickup**). Power-ups are **fully stackable**; each
tracks its remaining shot count independently.

### 3.1 Power-up Types

- **Rapid Fire** — doubles fire rate; increases max shots on screen.
- **Triple Shot** — each trigger fires 3 projectiles in a forward-facing fan spread; increases max shots on screen.
- **Bounce Shot** — all projectiles ricochet off walls; shots continue bouncing until lifespan expires.

### 3.2 Max Shots on Screen by Stack State

| Active Power-ups | Max Shots on Screen |
| :---- | :---- |
| None (base) | 3 |
| Rapid Fire only | 6 |
| Triple Shot only | 6 (3 per trigger, 2 volleys in flight) |
| Rapid Fire + Triple Shot | 9 (3 per trigger, 3 volleys in flight, faster) |
| + Bounce (any state) | Same as above — all shots now ricochet |

Implemented as `3 + 3·(Rapid) + 3·(Triple)`, volley-gated (see CLAUDE.md).

---

## 4. CONTROLS

### 4.1 Movement — Keyboard

WASD keys for four cardinal directions. North: W, East: D, South: S, West: A.
Diagonal movement is triggered by holding two adjacent cardinal keys simultaneously.

| Keys | Direction |
| :---- | :---- |
| W + A | Northwest |
| W + D | Northeast |
| S + A | Southwest |
| S + D | Southeast |

No dedicated single-key diagonal shortcuts. Movement cardinal keys are defined in
`CFG.KEYS.MOVE` for future remapping; diagonal combos are derived automatically
from those assignments at runtime.

### 4.2 Ranged Attack — Mouse

- **Mouse:** aim (Dan always faces the cursor).
- **Left Click:** fire in the direction of the cursor.

### 4.3 Ranged Attack — Keyboard Directional Fire

Four cardinal fire keys; diagonal fire is activated by holding two adjacent cardinal
fire keys simultaneously. Fire direction is the **normalized vector sum** of all
currently held cardinal fire keys — so combos produce diagonal angles naturally,
and holding two opposing keys (e.g. O + L) cancels to no fire.

Cardinal fire keys: North (O), East (P), South (L), West (K).

| Key(s) | Direction |
| :---- | :---- |
| O | North |
| P | East |
| L | South |
| K | West |
| O + K | Northwest |
| O + P | Northeast |
| L + K | Southwest |
| L + P | Southeast |

Fire cardinal keys are defined in `CFG.KEYS.FIRE` for future remapping; diagonal
combos are derived automatically from those assignments at runtime.

### 4.4 Special Item — Keyboard

`E` or `F` — deploy / throw the Atomic Dustbin.

### 4.5 Input Mode Selection

At the title screen, the player selects their input mode before play begins:

- **Spacebar** → Keyboard + mouse mode
- **A button (button 0) or Start button (button 9) on gamepad** → Gamepad mode

The title screen displays both options. Once a mode is selected, the opposing input
type is disabled for the session; to switch, the player must return to the title
screen (on death / game over). This design is intentional: keyboard input snaps to
8 directions while gamepad input is full 360° — mixing them mid-session would be
confusing.

On game-over and level-clear continue screens, prompts reflect the active mode:
"SPACE to continue" in keyboard mode; "A / START to continue" in gamepad mode.

`G.inputMode` is reset to `null` by `newGame()`, so returning to the title always
allows re-selection.

### 4.6 Movement — Gamepad

Left analog thumbstick (axes 0, 1): move Dan in full 360 degrees. Movement is
**normalized** — any push beyond the deadzone moves Dan at full speed regardless of
stick depth (not proportional). `CFG.GAMEPAD.moveDeadzone = 0.2`.

### 4.7 Ranged Attack — Gamepad

Right analog thumbstick (axes 2, 3): aim and fire in full 360 degrees. Dan fires
continuously whenever the stick is pushed beyond the deadzone. Fire rate respects
the same cooldown as keyboard fire — analog input does not bypass it.
`CFG.GAMEPAD.fireDeadzone = 0.2`.

### 4.8 Special Item — Gamepad

Any of: **LB** (left bumper, button 4), **RB** (right bumper, button 5), **LT**
(left trigger, button 6), or **RT** (right trigger, button 7) — deploy / throw the
Atomic Dustbin. Button indices per standard XInput / Browser Gamepad API mapping.

---

## 5. SPECIAL ITEM — THE ATOMIC DUSTBIN

> **Status: BUILT** (`dustbin.js`). Implementation/feel decisions are in STATUS.md → "Atomic Dustbin special". `e.flying` flags drones so the attract phase pulls them too.

A rare, glowing green deployable pickup. Dan carries **one at a time**. Glows green,
spins slowly when sitting on the floor as a pickup.

### 5.1 Deployment Physics

- **Stationary:** placed at Dan's current position immediately.
- **Moving:** thrown in Dan's movement direction; slides across the floor, decelerates via friction, and **bounces off walls**. Once fully stopped, the attract phase begins.

### 5.2 Sequence of Effects

1. **Attract Phase (2.5 s):** once stationary, the dustbin opens and generates a vortex. All robots within a large radius are pulled toward it and **cannot fire** during this phase. Drones (which normally fly above obstacles) are also affected.
2. **Detonate:** massive AoE explosion. Destroys or heavily damages all robots within the blast radius.

### 5.3 Scoring

- Robots destroyed by the dustbin award their **normal point value**.
- A **"DAN'S SPECIAL!"** callout displays on detonation.

### 5.4 Tactical Notes

- Throwing into a mob and letting it bounce off a far wall to settle in the center is advanced play.
- Works as both a panic button and a precision crowd-control tool.

---

## 6. ENEMIES

Dan has **20 HP** — reference this when reading damage values. Per-enemy detail
below; the summary table in §6.2 is the canonical stat reference.

### 6.1 Enemy Roster

**6.1.1 PICKER BOT** — basic chaser / cannon fodder. HP 1, 50 pts. Melee contact,
1 HP to Dan. Moves directly toward Dan at moderate speed. Spawns constantly from
Dispatch Terminals.

**6.1.2 FORKLIFT BOT** — slow tank / charger. HP 5, 200 pts. Melee charge: 4 HP on
charge impact, 2 HP on standard contact. Slow by default; on line of sight it locks
on and charges in a straight line. Can destroy shelving in its path. Dangerous to
stand in front of.

**6.1.3 SCANNER BOT** — support / alarm emitter. HP 2, 150 pts. No direct attack
(0 HP). Patrols; on spotting Dan it broadcasts an alarm making nearby robots
temporarily faster and more aggressive. Priority kill before engaging clusters.

**6.1.4 SORTER BOT** — cowardly ranged lobber; bombards from behind cover. HP 2,
100 pts. Ranged arcing cardboard box (arcs over walls/shelving), 1 HP per hit.
Always knows Dan's location; mood flips on line of sight:
- **Exposed (has LOS):** panics — flees fast in an erratic, jittery scatter, holds fire. Wants cover.
- **In cover (no LOS):** feels secure — advances and periodically lobs a box in a slow high arc that clears walls to drop on Dan. Only lobs when within ~140px; closes distance under cover otherwise. A wall usually sits between them, so Dan's straight soap shots can't answer back — bombarding from cover is its whole game. Each lob is telegraphed by a ground shadow at the landing spot: predictable and dodgeable, but punishing in tight, wall-heavy rooms.

**6.1.5 DRONE** — aerial ranged attacker; ignores ground obstacles. HP 2, 150 pts. Ranged package bomb dropped below its position, 2 HP per hit. Flies above shelving and walls. A shadow / targeting indicator appears on the ground before the bomb lands. Forces Dan to stay mobile by orbiting unpredictably before committing to a bombing run. Still affected by the Atomic Dustbin attract phase.
**Movement behavior:** Drones use a three-phase predatory orbit cycle rather than flying directly above Dan. **STALK** — the drone orbits Dan at a medium radius, circling clockwise or counter-clockwise. No bombing during this phase; the drone is visibly circling, not descending. **COMMIT** — after a randomized stalk duration, the drone breaks orbit and climbs toward bombing position above Dan. This is the readable telegraph: it accelerates upward and inward. If Dan moves far enough to break pursuit, the drone aborts back to STALK — mobility is the counterplay. **DROP** — if the drone reaches position, it drops the bomb (existing reticle + shadow system), then returns to STALK. Multiple drones may orbit in opposite directions, making their paths cross and harder to dodge simultaneously.

**6.1.6 INVENTORY BOT** — wanderer / worker hunter. HP 1, 75 pts. Melee contact,
1 HP to Dan. **(BUILT, L9.)** Dual state:
- *Default:* wanders slowly and randomly, oblivious to Dan.
- *Hunter:* periodically (timer or worker proximity) locks onto the nearest human worker and pursues slowly but relentlessly.
- *Hunting Dan:* once **no human workers remain** in the level (all rescued and/or killed), the Inventory Bot turns on Dan — it pursues the player directly and deals its melee contact damage. Its worker-hunting purpose is over, so it becomes a (weak) threat to Dan.
- **Special:** the ONLY robot capable of killing human workers. Slow, but it will find them.

**6.1.7 CLEANER BOT** — debuffer / slow hazard. HP 2, 100 pts. Ranged cone spray
ahead of it, 1 HP per tick while Dan is inside the cone, plus a **strong slow
movement debuff** (a heavy movement penalty while sprayed — significantly more than
a gentle slow). Wanders slowly. Most dangerous in corridors where Dan cannot escape
the cone.

**6.1.8 SECURITY BOT** — fast ranged pursuer; mid-game primary threat. HP 3, 200
pts. Ranged taser bolt, 2 HP per bolt. Fast, aggressive; fires direct-line bolts at
a fast rate. Requires active dodging. **Taser bolts also damage any ground robot
they strike** (friendly fire) — **drones are immune** (bolts travel below drone
altitude). Robots destroyed this way award **no points** to Dan (§9).

**6.1.9 MANAGER BOT** — rare, high-value, boss-tier. HP 6, 500 pts. Ranged seeking
missile, 3 HP per hit. Rare spawn; fires slow-tracking missiles that follow Dan.
The missile **launches slow and accelerates over its flight up to a fast maximum** —
easy to outrun at first, but it closes the gap if it chases too long, so commit to
luring it into a wall (detonates harmlessly) before it reaches top speed. **Missiles
also damage any ground robot they hit** (friendly fire); **drones are immune**
(missiles fly below drone altitude), and robots killed this way award **no points**
to Dan (§9). On death the Manager emits a **berserk pulse**: nearby robots gain
increased movement speed + increased melee damage (no added ranged) for a temporary
duration.

**6.1.10 DISPATCH TERMINAL** — static spawner (like Gauntlet's generators). HP 4,
300 pts. No attack (0 HP). Stationary; spawns Picker Bots on a fixed timer.
Destroying it stops all spawning from that location. Always a priority target.
Multiple terminals may exist per level.

### 6.2 Enemy Summary Table (canonical stat reference)

| Enemy | HP | Points | Attack Type | Damage to Dan | Ranged? |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Picker Bot | 1 | 50 | Melee contact | 1 HP | No |
| Forklift Bot | 5 | 200 | Melee charge | 4 HP (charge) / 2 HP (contact) | No |
| Scanner Bot | 2 | 150 | Alarm (indirect) | 0 HP | No |
| Sorter Bot | 2 | 100 | Arcing box | 1 HP | Yes |
| Drone | 2 | 150 | Bomb drop | 2 HP | Yes |
| Inventory Bot | 1 | 75 | Melee contact | 1 HP | No |
| Cleaner Bot | 2 | 100 | Spray cone | 1 HP/tick + slow | Yes (cone) |
| Security Bot | 3 | 200 | Taser bolt | 2 HP | Yes |
| Manager Bot | 6 | 500 | Seeking missile | 3 HP | Yes |
| Dispatch Terminal | 4 | 300 | None (spawner) | 0 HP | No |

---

## 7. HUMAN WORKERS

> **Status: BUILT** (`workers.js`) — wander/flee + rescue scoring. Killing workers
> awaits the Inventory Bot (§6.1.6); until then a worker only leaves by rescue.

### 7.1 Basics

- **Count per level:** 5. Can be killed by Inventory Bot only (§6.1.6).
- Workers wander slowly, trying to avoid robots.
- **Seeking rescue:** when a worker has line of sight to Dan it moves **toward** Dan
  to make rescue easier — **unless** it is currently fleeing a nearby robot, which
  always takes priority. Priority order: flee a nearby robot > move toward Dan on LOS
  > wander.

### 7.2 Rescue Scoring (exponential doubling)

| Worker Rescued | Points | Running Total |
| :---- | :---- | :---- |
| 1st | 100 | 100 |
| 2nd | 200 | 300 |
| 3rd | 400 | 700 |
| 4th | 800 | 1,500 |
| 5th | 1,600 | 3,100 |

Rescuing all 5 earns a **full clear bonus** and a celebratory callout.

### 7.3 Rescue Mechanic

- Dan rescues a worker by moving into contact.
- If a worker is killed by an Inventory Bot before rescue, they are gone for the remainder of the level.

---

## 8. LEVEL STRUCTURE

## 8. LEVEL STRUCTURE

### 8.1 Layout — Level Definition Format

> **Status: DESIGNED, loader NOT yet built.** Current builds generate level
> geometry directly in code with no intermediate data. This section defines the
> single **Level Definition** format that both procedural generation and
> hand-authoring emit, and that the engine alone consumes. Settled implementation
> decisions live in CLAUDE.md / STATUS.md.

Every level — generated or hand-authored — is a plain data object: the **Level
Definition**. Procgen is a *producer* of these objects; hand-drawn set-piece levels
are written directly as these objects. The engine never branches on origin: it loads
a Level Definition and runs. This is what lets the conveyor mechanic, obstacle types,
and entity placement behave identically whether a level was generated or authored.

A Level Definition has three thin layers plus fixed set-piece placements.

#### 8.1.1 Layer 1 — Tile grid (static geometry)

A row-major array of equal-length strings; one character per tile. This is the only
layer that carries collision and line-of-sight. Grid dimensions are `cols × rows`;
a typical level is roughly 30 × 34 tiles.

| Char | Tile | Solid | Blocks LOS | Destructible |
| :--- | :--- | :--- | :--- | :--- |
| `.` | floor | no | no | — |
| `#` | wall | yes | yes | no |
| `S` | shelf | yes | yes | yes (Forklift charge only) |
| `P` | pallet | yes | yes | no |
| `o` | pillar | yes | yes | no |

Per-type flags are defined once in `CFG.TILES` so behavior is data-driven and new
tile types can be added without touching collision code. Conveyor cells are **not** a
tile type — they are plain `.` floor; the conveyor layer (§8.1.2) is the sole source
of truth for belt positions. The Sorter's arcing box clears walls via its projectile
arc (§6.1.4), not via any tile flag, so no "low wall" type is required.

#### 8.1.2 Layer 2 — Conveyor strips

A list of axis-aligned rectangles, each with a push direction and speed. The net push
applied at any cell is the **vector sum of every strip that covers it**.

```
conveyors: [
  { x: 1,  y: 16, w: 28, h: 2,  dir: "E", speed: 1.0 },
  { x: 14, y: 1,  w: 2,  h: 32, dir: "N", speed: 1.0 },
]
```

Each strip's `x, y, w, h` are in tile coordinates; `dir` is one of `N / S / E / W`;
`speed` is in the same units as entity movement per the `CFG` conveyor constant.

Because push is summed, **crossing strips produce a diagonal push at the overlap with
no special intersection type** — an East strip crossing a North strip pushes any
entity in the overlap cells to the Northeast. This is the entire intersection
mechanic. Two strips with the same axis and opposing directions cancel where they
overlap (avoid authoring this unless a dead zone is intended).

**Unavoidable belts** are an authoring concern, not a format feature: span a strip the
full width or height of the map and wall off every other route to the exit side, so
crossing the belt is the only path. The format already supports this — no flag needed.

#### 8.1.3 Layer 3 — Zones, placements, and spawn rules

**Zones** are tagged, non-colliding rectangles that hint where the placer puts things.
They carry no geometry of their own.

```
zones: [
  { x: 1, y: 24, w: 28, h: 9,  role: "spawn"  },
  { x: 1, y: 1,  w: 28, h: 13, role: "danger" },
  { x: 1, y: 18, w: 28, h: 5,  role: "cover"  },
]
```

Standard roles: `spawn`, `cover`, `combat`, `danger`. A level may define any subset;
roles may overlap spatially.

**Fixed placements** are hand-authored set pieces with exact tile coordinates. The
player start and the exit door are always fixed placements.

```
placements: [
  { type: "player", x: 15, y: 27 },
  { type: "exit",   x: 25, y: 1  },
]
```

**Spawn rules** are what keep procedural placement alive. Each rule asks the placer to
drop `count` entities of `type` into a named zone `role`, optionally avoiding a role.

```
spawnRules: [
  { type: "dispatchTerminal", count: 2, zone: "danger" },
  { type: "vendingSmall",     count: 1, zone: "cover"  },
  { type: "vendingLarge",     count: 1, zone: "danger" },
  { type: "worker",           count: 5, zone: "any", avoid: "spawn" },
  { type: "powerup",          count: 2, zone: "cover"  },
  { type: "atomicDustbin",    count: 1, zone: "danger" },
]
```

**Guaranteed placement each level** (per the original design intent, now expressed as
spawn rules): 1 exit door (fixed); 5 human workers; Dispatch Terminals scaling with
level; **two vending machines — one small in a `cover` zone, one large in a `danger`
zone** (the large unit is a deliberate risk/reward pull, §2.5); power-up pickups; and
1 rare Atomic Dustbin (`count` may be 0 on early levels).

#### 8.1.4 Loader contract

The engine gains one loader that consumes a Level Definition and is the **only** entry
point to a playable level. It must:

- Parse the tile grid into the runtime collision/LOS structures, reading flags from `CFG.TILES`.
- **Bake conveyor strips into a per-cell push field**: a `cols × rows` array of `{dx, dy}` defaulting to zero, summing every covering strip's vector during the bake. Runtime push lookup is then O(1) per entity and intersections are already resolved. Drones ignore this field entirely (§6.1.5 — they fly above the belt).
- Resolve fixed placements to exact spawn positions; run spawn rules to scatter rule-based entities into their zones, honoring `avoid`, and never placing an entity on a solid tile.
- Validate: every level must have exactly one `player` and at least one `exit` placement, and every spawn rule's referenced zone role must exist (or be `"any"`).

Procgen's responsibility narrows to **emitting a valid Level Definition** — generating
the tile grid, choosing conveyor strips, tagging zones, and listing spawn rules — after
which it hands off to the same loader every hand-authored level uses.

### 8.2 Level End Conditions

1. **Find the Exit Door:** Dan reaches the exit and leaves. Level ends immediately; unrescued workers and uncollected points are forfeited.
2. **Rescue All 5 Workers:** full 3,100-point rescue bonus awarded (the escalating per-rescue values; §7.2) plus a celebratory callout. **Resolved:** this does **not** auto-complete the level — the exit door remains the only level-end trigger (see STATUS "Human workers & rescue").

### 8.3 Level Progression

- Endless. Each level raises difficulty: more terminals, faster spawns, more dangerous mix, higher proportion of mid/high-tier enemies.
- No story cutscenes between levels — arcade pacing.

---

## 9. SCORING SUMMARY

Per-enemy point values are canonical in §6.2. Worker rescue values are in §7.2.
High score is tracked and displayed on the title / game-over screen.

**No-score kills:** robots destroyed by another robot's projectile — i.e. Security
taser bolts or Manager seeking missiles striking a ground robot (§6.1.8, §6.1.9) —
award **no points** to Dan. Only kills Dan causes (soap shots, mop, or the Atomic
Dustbin per §5.3) score.

---

## 10. VISUAL AND AUDIO STYLE

- **Aesthetic:** retro arcade, chunky pixel art, limited palette. *(Sprite-art polish NOT yet built.)*
- **Setting:** warehouse interior — shelving, concrete floors, loading zones, break-room elements.
- **Projectile visuals:** base iridescent soap bubbles; Triple Shot larger opaque cleaning pods; Bounce leaves a soapy trail on walls at ricochet points.
- **Atomic Dustbin:** glowing green, spins as a floor pickup; dramatic vortex + explosion on detonation.
- **Audio:** retro arcade SFX via Web Audio API — pop/splash on hit, alarm on Scanner trigger, explosion on dustbin detonation. *(Built — `audio.js`; 17 synthesized SFX incl. these 3 plus game-feel additions, `M` to mute. See STATUS.md → "Audio".)*
- **Worker-death cue:** a worker being killed plays a **dramatic, prominent** sting (clearly more noticeable than a generic hit) so the loss reads unmistakably.
- **Last-worker cue:** when the **final** worker leaves the level — by rescue *or* by being killed — a **unique** one-shot SFX signals that there are no more humans left to save.

---

## 11. TECHNICAL NOTES FOR IMPLEMENTATION

Design-level guidance; settled implementation decisions live in CLAUDE.md / STATUS.md.

- **Platform:** HTML5 Canvas + JS, runs in browser.
- **Rendering:** 2D tile-based top-down.
- **Collision:** tile-based for walls/obstacles; circle or AABB for entities.
- **Procedural generation:** tile grid with guaranteed exit, worker, terminal, and pickup placement; shelf rows as obstacles.
- **Projectile system:** pool of active shots, each with position, direction, velocity, lifespan counter, bounce flag.
- **Power-up system:** three independent shot counters (RF, Triple, Bounce); decrement once per trigger; stack all three.
- **Atomic Dustbin physics:** velocity vector on throw from Dan's movement direction; per-frame friction; wall bounce via velocity reflection; attract phase begins at zero velocity.
- **Enemy AI per type:** §6; each type has a distinct behavior state machine.
- **Inventory Bot worker-hunt:** timer- or proximity-based trigger locks onto nearest living worker.
- **Dan facing:** always faces the mouse cursor (keyboard mode) or the last fire direction from the right stick (gamepad mode).
- **Melee knockback:** fixed knockback vector away from the robot; single damage event per contact; requires re-entry to trigger again.
- **Input abstraction:** `input.js` exports `getMoveVec()`, `getFireAngle()`, and `isDeploySpecial()` — device-agnostic functions that route to keyboard or gamepad based on `G.inputMode`. All player-action code calls these rather than reading raw key state. Cardinal key assignments live in `CFG.KEYS.MOVE` and `CFG.KEYS.FIRE` for future remapping. Diagonal combos are derived from those assignments at runtime.
- **Gamepad polling:** `navigator.getGamepads()[0]` polled each update tick (not event-driven). Standard XInput / Browser Gamepad API button indices assumed (axes 0/1 = left stick, axes 2/3 = right stick).

---

*End of Document — Atomic Dustbin Dan GDD v1.0*