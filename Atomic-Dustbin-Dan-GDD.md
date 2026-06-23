# Atomic Dustbin Dan 20260622

6/22/2026, 6:34p edit: “Health should carry over between levels”  
6/22/2026, 9:16p edit: Change keyboard fire control keys in “4.3 Ranged Attack — Keyboard Directional Fire”

# Atomic Dustbin Dan

See [https://claude.ai/chat/6021106a-f447-46d2-9b12-9312c192a5a2](https://claude.ai/chat/6021106a-f447-46d2-9b12-9312c192a5a2) 

## Game Design Document v1.0

---

## 1\. OVERVIEW

**Title:** Atomic Dustbin Dan **Genre:** Top-down twin-stick arcade shooter **Platform:** Browser (HTML5 Canvas \+ JavaScript) **Perspective:** Top-down, tile-based **Player Count:** Single player **Win Condition:** None (endless levels) **Level End Conditions:** Two possible — see Section 7

---

## 2\. PLAYER CHARACTER

**Name:** Dan (lead warehouse janitor) **Premise:** Dan noticed the warehouse robots malfunctioning and attacking human workers. Armed with his janitorial supplies, he decided to take action.

### 2.1 Health

- Dan has **20 HP**  
- Health is **hit-based** (not draining)  
- Health is restored by **vending machine pickups** scattered through levels  
  - Small pickup: **\+5 HP**  
  - Large pickup: **\+10 HP**  
- Health should carry over between levels

### 2.2 Melee Attack

- **Weapon:** Mop / plunger  
- **Trigger:** Automatic — activates on contact with any robot  
- **Mechanics:**  
  - Both Dan and the robot take melee damage on contact  
  - Dan is **knocked back** a fixed distance away from the robot immediately after contact  
  - Damage is **not continuous** — another melee event only occurs if Dan moves back into contact range  
  - Melee damage dealt to robots: **2 HP per hit**  
  - Melee damage received by Dan: per robot type (see Section 6\)

### 2.3 Ranged Attack

- **Weapon:** Soap bubble launcher (janitorial theme)  
- **Projectile:** Soap bubbles at base level; visually escalate to cleaning pods with power-ups  
- **Ammo:** Unlimited — no resource management  
- **Base fire rate:** Standard  
- **Base max shots on screen:** 3  
- **Trigger:** Left mouse click (primary), or keyboard directional fire keys (see Section 4\)  
- **Projectile lifespan:** Each shot travels a fixed distance/duration and self-destructs if it has not hit a target

### 2.4 Visual Progression of Ranged Shots (cosmetic only)

| State | Visual |
| :---- | :---- |
| Base | Iridescent translucent soap bubbles |
| Triple Shot active | Larger, more opaque cleaning pods |
| Bounce active | Shots leave brief soapy trail on walls at ricochet point |

---

## 3\. POWER-UPS

Power-ups are **shot-count based** — each pickup grants a fixed number of enhanced shots (suggested: **75 shots per pickup**). Power-ups are **fully stackable**. Each power-up tracks its remaining shot count independently.

### 3.1 Power-up Types

**Rapid Fire**

- Doubles fire rate  
- Increases max shots on screen

**Triple Shot**

- Each trigger fires 3 projectiles in a forward-facing fan spread  
- Increases max shots on screen

**Bounce Shot**

- All projectiles ricochet off walls  
- Shots continue bouncing until their lifespan expires

### 3.2 Max Shots on Screen by Stack State

| Active Power-ups | Max Shots on Screen |
| :---- | :---- |
| None (base) | 3 |
| Rapid Fire only | 6 |
| Triple Shot only | 6 (3 per trigger, 2 volleys in flight) |
| Rapid Fire \+ Triple Shot | 9 (3 per trigger, 3 volleys in flight, faster) |
| \+ Bounce (any state) | Same as above — all shots now ricochet |

---

## 4\. CONTROLS

### 4.1 Movement

| Key | Action |
| :---- | :---- |
| W | Move up |
| A | Move left |
| S | Move down |
| D | Move right |
| (Diagonal movement supported via key combinations) |  |

### 4.2 Ranged Attack — Mouse

| Input | Action |
| :---- | :---- |
| Mouse | Aim (Dan always faces mouse cursor) |
| Left Click | Fire in direction of mouse cursor |

### 4.3 Ranged Attack — Keyboard Directional Fire

Eight directional fire keys arranged as a 3×3 grid on the right side of the keyboard, mirroring a thumbstick:

i o p     NW N NE  
k l ;     W  ·  E  
, . /     SW S SE

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

| Key | Action |
| :---- | :---- |
| E or F | Deploy / throw Atomic Dustbin |

---

## 5\. SPECIAL ITEM — THE ATOMIC DUSTBIN

A rare, glowing green deployable pickup. Dan can carry **one at a time**. Visually distinctive — glows green, spins slowly when sitting on the floor as a pickup.

### 5.1 Deployment Physics

- **Deployed while stationary:** Placed at Dan's current position immediately  
- **Deployed while moving:** Thrown in the direction of Dan's movement. The dustbin slides across the floor, decelerating due to friction, and **bounces off walls**. Once it comes to a complete stop, the attract phase begins.

### 5.2 Sequence of Effects

1. **Attract Phase (2.5 seconds):** Once stationary, the dustbin opens and generates a vortex. All robots within a large radius are pulled toward it. Robots caught in the pull **cannot fire** during this phase. Drones (which normally fly above obstacles) are also affected.  
2. **Detonate:** Massive area-of-effect explosion. Destroys or heavily damages all robots within the blast radius.

### 5.3 Scoring

- Robots destroyed by the Atomic Dustbin award their **normal point value**  
- A **"DAN'S SPECIAL\!"** callout is displayed on screen when the dustbin detonates

### 5.4 Tactical Notes

- Throwing into a mob and letting it bounce off a far wall to settle in the center is advanced play  
- Works as both a panic button and a precision crowd-control tool

---

## 6\. ENEMIES

Dan has **20 HP**. Reference this when reading damage values below.

### 6.1 Enemy Roster

---

**6.1.1 PICKER BOT**

- **Role:** Basic chaser, cannon fodder  
- **HP:** 1  
- **Points:** 50  
- **Attack:** Melee (contact)  
- **Damage to Dan:** 1 HP per contact  
- **Behavior:** Moves directly toward Dan at moderate speed. Spawns constantly from Dispatch Terminals.

---

**6.1.2 FORKLIFT BOT**

- **Role:** Slow tank, charger  
- **HP:** 5  
- **Points:** 200  
- **Attack:** Melee — charge attack  
- **Damage to Dan:** 4 HP on charge impact, 2 HP on standard contact  
- **Behavior:** Moves slowly by default. When Dan is in its line of sight, it locks on and charges in a straight line. Can destroy shelving obstacles in its path. Dangerous to stand in front of.

---

**6.1.3 SCANNER BOT**

- **Role:** Support / alarm emitter  
- **HP:** 2  
- **Points:** 150  
- **Attack:** None (indirect)  
- **Damage to Dan:** 0 HP direct  
- **Behavior:** Patrols the area. When it spots Dan, it broadcasts an alarm that makes all nearby robots temporarily faster and more aggressive. Priority kill target — deal with it before engaging clusters of other robots.

---

**6.1.4 SORTER BOT**

- **Role:** Cowardly ranged lob attacker — bombards from behind cover  
- **HP:** 2  
- **Points:** 100  
- **Attack:** Ranged — arcing cardboard box projectile (arcs over walls and shelving).   
- **Damage to Dan:** 1 HP per hit  
- **Behavior:** Always knows Dan's location; its mood flips on line of sight.  
  - **Exposed (has line of sight to Dan):** panics — scampers away fast in an erratic, jittery scatter and holds fire. It just wants cover.  
  - **In cover (no line of sight — something solid between them):** feels secure — advances on Dan and periodically lobs a cardboard box in a slow, high arc that clears walls to drop on his position. Will only lob when within \~140px of Dan; closes the distance under cover otherwise. Since a wall is usually between them, Dan's straight soap shots can't answer back — bombarding from cover is its whole game. Each lob is telegraphed by a ground shadow at the landing spot, so it stays predictable and dodgeable, but it's punishing in tight, wall-heavy rooms.  
- 

---

**6.1.5 DRONE**

- **Role:** Aerial ranged attacker, ignores ground obstacles  
- **HP:** 2  
- **Points:** 150  
- **Attack:** Ranged — package bomb dropped below its position  
- **Damage to Dan:** 2 HP per bomb hit  
- **Behavior:** Flies above shelving and walls, unaffected by ground-level obstacles. Drops package bombs at Dan's position. A shadow or targeting indicator should appear on the ground before the bomb lands. Forces Dan to stay mobile. Note: still affected by Atomic Dustbin attract phase.

---

**6.1.6 INVENTORY BOT**

- **Role:** Wanderer / worker hunter  
- **HP:** 1  
- **Points:** 75  
- **Attack:** Melee (contact)  
- **Damage to Dan:** 1 HP per contact  
- **Behavior (dual state):**  
  - *Default:* Wanders slowly and randomly, oblivious to Dan.  
  - *Hunter state:* Periodically — triggered by a timer or proximity to a worker — locks onto the nearest human worker and pursues them slowly but relentlessly.  
- **Special:** The ONLY robot capable of killing human workers. It is slow, but it will find them.

---

**6.1.7 CLEANER BOT**

- **Role:** Debuffer / slow hazard  
- **HP:** 2  
- **Points:** 100  
- **Attack:** Ranged — cone spray in front  
- **Damage to Dan:** 1 HP per tick while inside spray cone  
- **Behavior:** Wanders slowly. Sprays a cleaning solution in a short cone ahead of it. The spray both **damages Dan** and applies a **slow movement debuff** while Dan is inside it. Most dangerous in corridors where Dan cannot easily escape the cone.

---

**6.1.8 SECURITY BOT**

- **Role:** Fast ranged pursuer, mid-game primary threat  
- **HP:** 3  
- **Points:** 200  
- **Attack:** Ranged — taser bolt  
- **Damage to Dan:** 2 HP per bolt  
- **Behavior:** Fast mover, aggressive pursuer. Fires taser bolts in a direct line toward Dan at a fast rate. Requires active dodging. The main threat in mid-game waves.

---

**6.1.9 MANAGER BOT**

- **Role:** Rare, high-value, boss-tier threat  
- **HP:** 6  
- **Points:** 500  
- **Attack:** Ranged — seeking missile  
- **Damage to Dan:** 3 HP per missile hit  
- **Behavior:** Rare spawn. Fires slow-tracking missiles that follow Dan. Missiles can be outrun or lured into walls to detonate harmlessly. On death, emits a **berserk pulse** that affects all nearby robots:  
  - *Berserk effect:* Increased movement speed \+ increased melee damage. No additional ranged capability.  
  - Berserk is temporary.

---

**6.1.10 DISPATCH TERMINAL**

- **Role:** Static spawner (equivalent to Gauntlet's ghost generators)  
- **HP:** 4  
- **Points:** 300  
- **Attack:** None  
- **Damage to Dan:** 0 HP direct  
- **Behavior:** Stationary. Spawns Picker Bots on a fixed timer. Destroying a Dispatch Terminal stops all spawning from that location. Always a priority target. Multiple terminals may exist per level.

---

### 6.2 Enemy Summary Table

| Enemy | HP | Points | Attack Type | Damage to Dan | Ranged? |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Picker Bot | 1 | 50 | Melee contact | 1 HP | No |
| Forklift Bot | 5 | 200 | Melee charge | 4 HP (charge) / 2 HP (contact) | No |
| Scanner Bot | 2 | 150 | Alarm (indirect) | 0 HP | No |
| Sorter Bot | 2 | 100 | Arcing box | 1 HP | Yes |
| Drone | 2 | 150 | Bomb drop | 2 HP | Yes |
| Inventory Bot | 1 | 75 | Melee contact | 1 HP | No |
| Cleaner Bot | 2 | 100 | Spray cone | 1 HP/tick \+ slow | Yes (cone) |
| Security Bot | 3 | 200 | Taser bolt | 2 HP | Yes |
| Manager Bot | 6 | 500 | Seeking missile | 3 HP | Yes |
| Dispatch Terminal | 4 | 300 | None (spawner) | 0 HP | No |

---

## 7\. HUMAN WORKERS

### 7.1 Basics

- **Count per level:** 5  
- **Can be killed:** Yes — by Inventory Bot only (see Section 6.1)  
- Workers wander the level slowly, trying to avoid robots

### 7.2 Rescue Scoring (exponential doubling)

| Worker Rescued | Points Awarded | Running Total |
| :---- | :---- | :---- |
| 1st | 100 | 100 |
| 2nd | 200 | 300 |
| 3rd | 400 | 700 |
| 4th | 800 | 1,500 |
| 5th | 1,600 | 3,100 |

Rescuing all 5 workers earns a **full clear bonus** and a celebratory screen callout.

### 7.3 Rescue Mechanic

- Dan rescues a worker by moving into contact with them  
- If a worker is killed by an Inventory Bot before rescue, they are gone for the remainder of the level

---

## 8\. LEVEL STRUCTURE

### 8.1 Layout

- **Tile-based procedural generation** for each level  
- Warehouse aesthetic: shelf rows, corridors, open floor areas, cinderblock walls  
- **Guaranteed placement each level:**  
  - 1 exit door  
  - 5 human workers (pre-placed, wander after level start)  
  - Multiple Dispatch Terminals (count scales with level number)  
  - Vending machine health pickups  
  - Power-up pickups (Rapid Fire, Triple Shot, Bounce Shot)  
  - Atomic Dustbin pickup (rare — 1 per level, possibly 0 on early levels)

### 8.2 Level End Conditions

Two ways to complete a level:

1. **Find the Exit Door:** Dan reaches the exit and leaves. The level ends immediately. Any unrescued workers and uncollected points are forfeited.  
2. **Rescue All 5 Workers:** All surviving workers are rescued. Full 3,100-point rescue bonus is awarded. Dan still must then reach the exit or the level may auto-complete — **TBD during implementation.**

### 8.3 Level Progression

- Levels are endless  
- Each subsequent level increases difficulty: more Dispatch Terminals, faster spawns, more dangerous enemy mix, higher proportion of mid/high-tier enemies  
- No story cutscenes between levels — arcade pacing

---

## 9\. SCORING SUMMARY

| Action | Points |
| :---- | :---- |
| Picker Bot destroyed | 50 |
| Inventory Bot destroyed | 75 |
| Sorter Bot destroyed | 100 |
| Cleaner Bot destroyed | 100 |
| Scanner Bot destroyed | 150 |
| Drone destroyed | 150 |
| Forklift Bot destroyed | 200 |
| Security Bot destroyed | 200 |
| Dispatch Terminal destroyed | 300 |
| Manager Bot destroyed | 500 |
| 1st worker rescued | 100 |
| 2nd worker rescued | 200 |
| 3rd worker rescued | 400 |
| 4th worker rescued | 800 |
| 5th worker rescued | 1,600 |

High score is tracked and displayed on the title/game over screen.

---

## 10\. VISUAL AND AUDIO STYLE

- **Aesthetic:** Retro arcade, chunky pixel art, limited color palette  
- **Setting:** Product warehouse interior — shelving, concrete floors, loading zones, break room elements  
- **Projectile visuals:**  
  - Base: iridescent translucent soap bubbles  
  - Triple Shot: larger, more opaque cleaning pods  
  - Bounce Shot active: soapy trail left on walls at ricochet points  
- **Atomic Dustbin:** Glowing green, spins when on floor as pickup; dramatic vortex \+ explosion on detonation  
- **Audio:** Retro arcade sound effects via Web Audio API; satisfying pop/splash on projectile hit; alarm sound on Scanner Bot trigger; explosion for Atomic Dustbin detonation

---

## 11\. TECHNICAL NOTES FOR IMPLEMENTATION

- **Platform:** HTML5 Canvas \+ JavaScript, single file, runs in browser  
- **Rendering:** 2D tile-based top-down  
- **Collision:** Tile-based for walls/obstacles; circle or AABB for entities  
- **Procedural generation:** Tile grid with guaranteed exit, worker, terminal, and pickup placement; shelf rows as obstacles  
- **Projectile system:** Pool of active shots, each with position, direction, velocity, lifespan counter, bounce flag  
- **Power-up system:** Three independent shot counters (RF, Triple, Bounce); decrement on each shot fired; stack all three simultaneously  
- **Atomic Dustbin physics:** Velocity vector applied on throw using Dan's movement direction; friction applied each frame to decelerate; wall bounce via velocity reflection; attract phase begins when velocity reaches zero  
- **Enemy AI per type:** Described in Section 6; each robot type has a distinct behavior state machine  
- **Inventory Bot worker-hunt:** Timer-based trigger or proximity-based trigger locks Inventory Bot onto nearest living worker  
- **Dan facing:** Always faces mouse cursor position (or last keyboard fire direction if no mouse input)  
- **Melee knockback:** On contact between Dan and any robot, apply fixed knockback vector to Dan away from robot; single damage event per contact; requires re-entry to trigger again

---

*End of Document — Atomic Dustbin Dan GDD v1.0*  
