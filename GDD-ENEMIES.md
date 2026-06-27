# Atomic Dustbin Dan — Enemy Reference (GDD §6)

Extracted from GDD.md for token efficiency. Include this file only in sessions
that touch enemy AI, stats, or new enemy types. For all other sessions, GDD.md
alone is sufficient. Cross-references to GDD section numbers (§6.x) remain stable.

**Status: All 9 enemies + Dispatch Terminal are fully built.** Implementation
decisions for each enemy are in STATUS.md under the corresponding subsystem entry.
Feel dials (speed, HP, damage, range, timers) live in `config.js` → `ENEMY` table.

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
1 HP to Dan. Dual state:
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
300 pts. No attack (0 HP). Stationary; spawns enemies on a fixed timer.
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