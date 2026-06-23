# Atomic Dustbin Dan — Game Design Document v1.0

Canonical design intent. This is "what the game should be." For what is actually
built and the decisions made along the way, see STATUS.md; for the cross-cutting
rules, see CLAUDE.md. Section numbers here are stable — STATUS.md references them.

### Build status index

- **Built:** §2 Player, §3 Power-ups, §4 Controls, §6 Enemies (Picker, Forklift, Security, Sorter, Cleaner, Drone, Manager — Scanner & Inventory pending), §8.2 level-end, §8.3 progression, parts of §10.
- **Designed, NOT yet built:** §5 Atomic Dustbin, §7 Human Workers, full procedural placement (§8.1), audio (§10), sprite-art polish (§10).

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

### 4.1 Movement

WASD, with diagonal movement via key combinations. W up, A left, S down, D right.

### 4.2 Ranged Attack — Mouse

- **Mouse:** aim (Dan always faces the cursor).
- **Left Click:** fire in the direction of the cursor.

### 4.3 Ranged Attack — Keyboard Directional Fire

Eight directional fire keys arranged as a 3×3 grid on the right of the keyboard,
mirroring a thumbstick. Center key `l` does NOT fire.

```
i o p     NW N NE
k l ;     W  ·  E
, . /     SW S SE
```

| Key | Fire Direction |
| :---- | :---- |
| i | Upper-left |
| o | Up |
| p | Upper-right |
| k | Left |
| ; | Right |
| , | Lower-left |
| . | Down |
| / | Lower-right |

### 4.4 Special Item

`E` or `F` — deploy / throw the Atomic Dustbin.

---

## 5. SPECIAL ITEM — THE ATOMIC DUSTBIN

> **Status: DESIGNED, NOT YET BUILT.** (Note `e.flying` already flags drones for the attract phase.)

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

**6.1.5 DRONE** — aerial ranged attacker; ignores ground obstacles. HP 2, 150 pts.
Ranged package bomb dropped below its position, 2 HP per hit. Flies above shelving
and walls. A shadow / targeting indicator appears on the ground before the bomb
lands. Forces Dan to stay mobile. Still affected by the Atomic Dustbin attract phase.

**6.1.6 INVENTORY BOT** — wanderer / worker hunter. HP 1, 75 pts. Melee contact,
1 HP to Dan. Dual state:
- *Default:* wanders slowly and randomly, oblivious to Dan.
- *Hunter:* periodically (timer or worker proximity) locks onto the nearest human worker and pursues slowly but relentlessly.
- **Special:** the ONLY robot capable of killing human workers. Slow, but it will find them.

**6.1.7 CLEANER BOT** — debuffer / slow hazard. HP 2, 100 pts. Ranged cone spray
ahead of it, 1 HP per tick while Dan is inside the cone, plus a **slow movement
debuff**. Wanders slowly. Most dangerous in corridors where Dan cannot escape the cone.

**6.1.8 SECURITY BOT** — fast ranged pursuer; mid-game primary threat. HP 3, 200
pts. Ranged taser bolt, 2 HP per bolt. Fast, aggressive; fires direct-line bolts at
a fast rate. Requires active dodging.

**6.1.9 MANAGER BOT** — rare, high-value, boss-tier. HP 6, 500 pts. Ranged seeking
missile, 3 HP per hit. Rare spawn; fires slow-tracking missiles that follow Dan
(outrun them or lure them into walls to detonate harmlessly). On death emits a
**berserk pulse**: nearby robots gain increased movement speed + increased melee
damage (no added ranged) for a temporary duration.

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

> **Status: DESIGNED, NOT yet built.** Inventory Bot (§6.1.6) depends on this feature.

### 7.1 Basics

- **Count per level:** 5. Can be killed by Inventory Bot only (§6.1.6).
- Workers wander slowly, trying to avoid robots.

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

### 8.1 Layout

- **Tile-based procedural generation** per level. *(Full guaranteed-placement procgen below is NOT yet built — current builds use test placement.)*
- Warehouse aesthetic: shelf rows, corridors, open floor, cinderblock walls.
- **Guaranteed placement each level:** 1 exit door; 5 human workers; multiple Dispatch Terminals (scales with level); vending-machine health pickups; power-up pickups; 1 rare Atomic Dustbin pickup (possibly 0 on early levels).

### 8.2 Level End Conditions

1. **Find the Exit Door:** Dan reaches the exit and leaves. Level ends immediately; unrescued workers and uncollected points are forfeited.
2. **Rescue All 5 Workers:** full 3,100-point rescue bonus awarded. Whether Dan must then reach the exit or the level auto-completes is **TBD during implementation.**

### 8.3 Level Progression

- Endless. Each level raises difficulty: more terminals, faster spawns, more dangerous mix, higher proportion of mid/high-tier enemies.
- No story cutscenes between levels — arcade pacing.

---

## 9. SCORING SUMMARY

Per-enemy point values are canonical in §6.2. Worker rescue values are in §7.2.
High score is tracked and displayed on the title / game-over screen.

---

## 10. VISUAL AND AUDIO STYLE

- **Aesthetic:** retro arcade, chunky pixel art, limited palette. *(Sprite-art polish NOT yet built.)*
- **Setting:** warehouse interior — shelving, concrete floors, loading zones, break-room elements.
- **Projectile visuals:** base iridescent soap bubbles; Triple Shot larger opaque cleaning pods; Bounce leaves a soapy trail on walls at ricochet points.
- **Atomic Dustbin:** glowing green, spins as a floor pickup; dramatic vortex + explosion on detonation.
- **Audio:** retro arcade SFX via Web Audio API — pop/splash on hit, alarm on Scanner trigger, explosion on dustbin detonation. *(Audio NOT yet built.)*

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
- **Dan facing:** always faces the mouse cursor (or last keyboard fire direction if no mouse input).
- **Melee knockback:** fixed knockback vector away from the robot; single damage event per contact; requires re-entry to trigger again.

---

*End of Document — Atomic Dustbin Dan GDD v1.0*
