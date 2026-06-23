## Game Design Document

---

Trimmed to be relevant for L7 implementation only.

## 6\. ENEMIES

Dan has **20 HP**. Reference this when reading damage values below.

### 6.1 Enemy Roster

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
