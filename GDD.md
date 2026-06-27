# Atomic Dustbin Dan — Game Design Document v1.0

Canonical design intent. This is "what the game should be." For what is actually
built and the decisions made along the way, see STATUS.md; for the cross-cutting
rules, see CLAUDE.md. Section numbers here are stable — STATUS.md references them.

### Build status index

- **Built:** §2 Player (incl. §2.5 Vending Machines), §3 Power-ups, §4 Controls (full — keyboard+mouse and gamepad; device-agnostic `input.js`; see STATUS "Controls / input"), §5 Atomic Dustbin special, §6 Enemies (full roster: all 9 types + Dispatch Terminal + `"mixed"` sandbox — see `GDD-ENEMIES.md`), §7 Human workers + rescue scoring + Inventory Bot worker-hunting, §8.1 Level Definition format + loader + five hand-authored levels + conveyor push mechanic, §8.2 level-end, §8.3 progression, §10 audio (17 SFX + conveyor hum).
- **Designed, NOT yet built:** Achievement system (see `ACHIEVEMENTS.md`), §10 sprite-art polish.

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

> See **`GDD-ENEMIES.md`** for the full enemy roster (§6.1) and canonical stat table (§6.2). That file is extracted here for token efficiency — include it only in sessions that touch enemy AI, stats, or new enemy types.
>
> All 9 enemies + Dispatch Terminal are fully built. Implementation decisions in STATUS.md per-enemy subsystem entries.

---

## 7. HUMAN WORKERS

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

### 8.1 Layout — Level Definition Format

> **Status: BUILT** (`level.js` + `world.js`). Generator, loader, five hand-authored levels, and conveyor push mechanic are all complete. Implementation decisions in STATUS.md → "Level Definition format & loader" and "Conveyors".

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

## 11. FUTURE OPTIONAL FEATURES

Features considered during design but deferred from the current roadmap. Not in CLAUDE.md or the active STATUS.md checklist; not expected in any current implementation session. Revisit when a relevant system creates a natural hook.

### 11.1 The Scenic Route (Achievement)

Achievement concept: "Step on every walkable tile in a level." Requires per-frame spatial coverage tracking — a `cols × rows` boolean visited-grid updated each frame as Dan moves. Deferred because the CPU overhead and implementation complexity are not justified for a single achievement. Revisit if a tile-visit tracking system is added for another purpose.

### 11.2 Vending Machine Cooldown

Instead of permanently single-use, vending machines could enter a cooldown period and become usable again after a fixed time. This would unlock achievement concepts that currently make no sense (e.g., "use a vending machine 5 times in one level"). Deferred; current design is single-use within a level.

---

*End of Document — Atomic Dustbin Dan GDD v1.0*