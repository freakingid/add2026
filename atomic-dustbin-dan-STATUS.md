# Atomic Dustbin Dan — Build Status & Handoff

## Current state — implemented and working

- Single-file HTML5 Canvas + JS game; delta-timed loop; pixelated retro warehouse look.
- **Dan:** WASD + diagonals, mouse aim/fire, 8-key keyboard directional fire
  (`O P [ L ' , . /`, `;` = no-fire), 20 HP, melee-on-contact with knockback + i-frames.
- **Soap launcher:** finite range, base cooldown, base cap 3.
- **Power-ups (Rapid / Triple / Bounce):** shot-count based, stackable, independent counters,
  HUD pills, floor pickups + floating callouts.
- **Enemies implemented:**
  - **Picker Bot** (L1) — chase + melee. Spawns from terminals.
  - **Dispatch Terminal** (L1) — **DESTROYABLE** (HP 4, 300 pts, HP pips, hit flash);
    destroying it stops its spawning.
  - **Forklift Bot** (L2) — slow roam, line-of-sight lock + wind-up telegraph + straight-line
    charge; **smashes shelving** in its path (destructible tiles + dust puffs). 4 dmg on
    charge / 2 on contact; can't break the outer border wall.
  - **Security Bot** (L3) — Fast pursuer; chases Dan and fires a straight **taser bolt**
    on a fast cooldown whenever it has LOS + Dan within fire range. Brief latched-aim windup
    telegraph (visor brightens, charge spark on the prongs) so the shot is dodgeable. HP 3,
    200 pts, 2 dmg/bolt, light 1 dmg contact zap. First user of the shared enemy-projectile system.
  - **Sorter Bot** (L4) — Cowardly lobber. Always knows Dan; LOS flips mood: **exposed** -> panics
    and flees fast in an erratic scatter, holds fire; **in cover** -> advances and lobs an **arcing
    box** (over walls) when within `fireRange` (140), telegraphed by a landing reticle + ground
    shadow. HP 2, 100 pts, 1 dmg/hit, no contact damage.
  - **Cleaner Bot** (L5) — Slow hazard / debuffer (GDD §6.7). **Patrols a fixed route** chosen at
    spawn and kept for life (a back-and-forth line down the longest clear aisle through its spawn
    tile, or a small rectangular loop when one with a fully-walkable perimeter fits — ~17% loops /
    ~83% lines in practice), spraying a short cone **ahead of its heading**. While Dan is inside the
    cone he takes **1 HP/tick AND a movement-slow**. Damage is LOS-gated (a shelf blocks it); the
    rendered cone is **clipped to walls** so it stops at shelves instead of bleeding through, and it
    won't start a spray facing a wall point-blank. HP 2, 100 pts, no contact damage. **Introduces the
    first status effect on Dan.**
  - **Manager Bot** (L7) — Rare **boss-tier** ground pursuer (HP 6, 500 pts). Slow mover; fires a
    slow-tracking **homing missile** (`kind:"homing"`) on a long cooldown whenever it has LOS + range.
    A dashed-beam windup telegraphs the launch (aim latched at windup start = dodgeable). Missile steers
    toward Dan each frame with a capped turn rate — outrunnable on straights; lure it into a shelf to
    detonate harmlessly (small wall-AoE). On death, emits a **berserk pulse** (expanding orange ring
    mark): all robots within `berserRadius` (220 px) gain `e.berserk` timer → speed ×1.7 + melee
    dmg +2 for 7 s. Refreshes if a second pulse hits before expiry. L7 is the first **mixed-type
    level**: Manager terminals + 2 Picker terminals (3 preplaced Pickers), so the pulse has targets.
    No contact damage (`dmgContact:0`). Feel dials: `missileSpeed` 90 / `missileTurnRate` 1.4 rad/s /
    `fireCd` 3.5 s / `berserDur` 7 s / `berserSpeedMult` 1.7 / `berserDmgBonus` 2 / `max` 2 / 
    `interval` 8 s.
  - **Drone** (L6) — Aerial bomber (GDD §6.1.5). **First FLYING enemy:** ignores ground walls
    entirely (free mover, not `moveBody`); seeks a hover spot **above Dan** (swaying around his
    column) and **drops a package bomb straight down its OWN column** (bomb x = drone x) onto Dan's
    row — committing only when it's at/above Dan and lined up, so bombs always fall *down from the
    drone* rather than materializing over Dan. The `drop` projectile descends onto that point,
    telegraphed by a ground reticle + growing shadow, and uses fake perspective (~2x size at release,
    shrinking to 1x at impact). **Bombs ignore walls / need no LOS** — you can't hide, only move out
    from under it. HP 2, 150 pts, 2 dmg/bomb (AoE), no contact damage. Drawn elevated with a cast
    ground-shadow (body-anchored: soap shots hit the sprite you see). Carries an `e.flying` flag for
    the future Atomic Dustbin attract phase.
- **Dan status effects:** `dan.slow` (sec) scales move speed by `CFG.SLOW_FACTOR` while active;
  `dan.sprayTick` rate-limits spray DoT so overlapping cones can't multi-tick. Both decay in
  `updateDan`, reset per level. Visual: green aura + drips on Dan while slowed.
- **Shared enemy-projectile system (`ebolts`)** — One pool drives every robot's ranged attack;
  each projectile carries a `kind` selecting its motion + expiry. Implemented: `bolt` (Security —
  straight, dies on walls), `arc` (Sorter — time-based lob, ignores walls, AoE on landing), `drop`
  (Drone — descends vertically onto a FIXED point, ignores walls, AoE on landing), and `homing`
  (Manager — slow-tracking missile, steers toward Dan each frame, stops on wall with small AoE).
  Cone (Cleaner) is handled outside the pool. Dan-collision funnels through the shared i-frame
  window via `hitDanRanged` (point) / `hitDanArea` (blast).
- **Spawner-terminals (all enemies):** every level places destroyable spawner-terminals
  (HP 4, 300 pts, HP pips, hit flash) of its enemy type; **all enemies emerge from terminals**
  (no floor placement). Emitter light is tinted per enemy type; brief white pulse on each emit.
  Destroying all terminals of a type stops its spawns.
- **Level system:** procedural warehouse, camera, EXIT door + off-screen pointer, level-clear
  splash, endless progression. **HP, power-ups, and score persist across levels.**
- **States:** `title` / `playing` / `levelclear` / `dead`.

## Key design decisions (do not silently change)

- **HP, power-ups, score PERSIST across levels** (user choice; overrides GDD §2.1 HP reset).
- **Power-up decrement = once per trigger, per active counter** (Triple's 3 bubbles = 1 decrement).
- **Max shots on screen = 3 + 3·(Rapid) + 3·(Triple)**, volley-gated (3 / 6 / 6 / 9).
- **Bounce** reflects per-axis off walls, lives until travel range expires.
- **One enemy type per level** for testing, set by `LEVEL_PLAN`; reachable in sequence via exit.
- **All enemies spawn from destroyable terminals** (generalized Dispatch Terminal). Single GLOBAL
  spawn cadence per level (`spawnTimer` + the type's `interval`) emits from a random matching
  terminal, capped by the type's `max`. Destroying *all* a type's terminals stops spawns; thinning
  *some* doesn't slow the rate (cadence is global). Alt model: per-terminal timers (Gauntlet-style,
  thinning throttles flow) — would move the timer onto each terminal object.
- **Keyboard fire keys** (diverges from GDD §4.3): compass 3×3 on the right hand —
  `i o p` / `k l ;` / `, . /`, with **`l` = no-fire center**. NW=i N=o NE=p W=k E=; SW=, S=. SE=/.
- **Knockback** is `+dx/dist` (pushes Dan away from the enemy). Fixed in the Forklift session;
  mattered once an enemy survives contact.

### Ranged-system decisions (Security / `ebolts` session — confirm if changing feel)

- **Shared i-frame window:** enemy bolts use the SAME `CFG.DAN_IFRAME` window as melee, so a
  Forklift charge and a taser bolt landing the same instant can't double-dip. (Alt: per-bolt
  independent invuln.)
- **Security contact damage = 1** (`dmgContact`). GDD lists no melee value for Security; this is a
  light "don't mop a live taser" zap. Set to 0 for a pure-ranged unit. Dan still mops it + gets
  knocked back on contact regardless.
- **Bolt absorbed during i-frames:** a bolt overlapping Dan while he's already invulnerable is
  removed (counts as a blocked hit) rather than passing through to land later.
- **Bolts die on walls** (`kind:"bolt"` sets `stopsOnWall`). Only matters when Dan ducks behind a
  shelf mid-flight — the intended dodge. Future drone bombs will set this false to ignore walls.
- **Soap shots and enemy bolts ignore each other** — you can't currently shoot a bolt down.

### Sorter decisions (L4 — confirm if changing feel)

- **Sorter fires ONLY in cover** (no LOS); it holds fire while exposed/fleeing.
- **Sorter fires only in cover AND within lob range** (`fireRange`, 280px — a thrown box can't go
  far; not in the GDD, suggest adding). Out of range it keeps advancing under cover and holds fire,
  lobbing the instant it closes in.
- **Arc targets Dan's position at lob time** (no leading); slow flight + landing reticle/shadow is
  the counterplay. Blast radius `arcBlast` (30) around the landing point; absorbed by i-frames.
- **No contact damage** (`dmg=0` in the melee branch). `meleeContact` now guards so a 0-damage
  touch gives Dan no free i-frames — Dan just mops the cornered coward. (No effect on other types.)
- **Flee is erratic** (`fleeSpeed`/`fleeJitter`, wander random-walk fed through `sin`) — the panic
  scatter, not a straight retreat.

### Cleaner decisions (L5 — confirm if changing feel)

- **Patrols a FIXED route** chosen at spawn and kept for life (no random wander). `buildCleanerPatrol`
  picks a back-and-forth **line** down the longest clear aisle through its spawn tile, or (≈`rectChance`
  0.35 odds, when one fits) a small **rectangular loop** with a fully-walkable perimeter. Lines win
  ~83% of the time in the current shelf-heavy map; both paths are live. Stuck-against-geometry is
  handled by `wpTimeout` advancing the waypoint. (Alt: add serpentine / waypoint-graph routes.)
- **Oblivious by default** (`aimAtDan:false`): sprays along its patrol heading, not at Dan. Flip
  `aimAtDan` to turn toward Dan before each spray (more aggressive; diverges from GDD).
- **Spray render is CLIPPED to walls** (`coneRayDist` raymarch per cone slice + per droplet), so the
  cone visually stops at shelves instead of bleeding through. Fixes the "sprayed through a wall" look;
  damage was already correct. It also **won't start a spray facing a wall point-blank** (`sprayMinClear`
  0.4 = needs ≥40% of range open ahead), so it never sprays uselessly into a shelf it's hugging.
- **Spray DoT uses its own tick timer** (`dan.sprayTick`/`tickEvery`), NOT the melee/bolt i-frame
  window — DoT hazard, ignores i-frames, overlapping cones can't double-tick. Slow always refreshes
  while inside. Damage stays LOS-gated via `danInSprayCone`. (Alt: gate damage by i-frames.)
- **No contact damage** (mop the bot freely; `meleeContact` 0-dmg guard).
- **Slow = movement only** (`SLOW_FACTOR` 0.5); fire rate unaffected. `sprayRange` 108 / ~60° cone /
  `slowDur` 0.9s are the feel dials.

### Drone decisions (L6 — confirm if changing feel)

- **Flies over walls; no LOS gate on bombs.** This is the Drone's whole identity (distinct from
  Security, which needs LOS, and Sorter, which lobs over walls but only *from* cover). Cover is no
  defense — the only counterplay is moving off the telegraphed landing spot. (Alt: gate drops by LOS
  to make shelves block bombing — would erase the "can't hide" identity.)
- **Soap shots CAN hit it** (GDD dodgeable=Yes, HP 2). Simplest + readable. (Alt: fliers immune to
  ground fire — would need a whole anti-air mechanic; flagged, not built.)
- **Body-anchored hitbox.** `e.x,e.y` is the body you see and shoot; the cast ground-shadow is drawn
  *below* it (offset `altitude`) purely as an elevation cue. So you shoot the sprite, not the shadow.
- **No contact damage, still mop-able** (`meleeContact` 0-dmg guard, same as Sorter/Cleaner). It
  hovers at standoff so contact is rare anyway. (Alt: melee-immune flier — would need special-casing.)
- **`drop` falls down the drone's OWN column** (`tx = drone.x`, `ty = Dan's row`), and the drone only
  commits when it's **at/above Dan** (`e.y <= dan.y`) AND lined up (`|drone.x - dan.x| <= dropAlignX`
  80). So no more bombs materializing over Dan from a drone off to the side — the drone must physically
  get overhead, and bombs always fall downward. Visual fall distance = the real drone→row gap, and the
  bomb scales ~2x→1x as it descends (fake perspective; shadow grows to match). Feel dials: `hoverAbove`
  220 / `weaveAmp` 70 / `dropCd` 1.7 / `dropDur` 0.9 (dodge window) / `dropBlast` 36 / `dropDmg` 2 /
  `max` 4. (Headless sim: drops now reliably land in a drone's column; a strafing non-dodging Dan lost
  ~8 HP over 14s, so a reacting player clears it comfortably — dial `dropCd`/`max`/`dropAlignX` if hot.)
- **`e.flying` flag** is set so the future Atomic Dustbin attract phase (GDD §5.2) can pull drones,
  and so other systems can branch on fliers later.

## Architecture map (where things live)

- `CFG` — global tunables incl. `CFG.TERMINAL`.
- `ENEMY` — per-type stat table (hp/speed/points/damage, plus `spawners` = base terminal count,
  `preplace` = initial emission from terminals, `interval`/`max` = cadence/cap, and ranged stats
  like `boltSpeed`/`boltDmg`/`boltRange`/`fireCd`/`windup`). Add new enemies here.
- `LEVEL_PLAN` (`["picker","forklift","security","sorter","cleaner","drone","manager"]`) + `levelType()` — enemy/level.
- `TERMINAL_TINT` — emitter color per enemy type (terminal readability).
- `POWERUPS` / `POWERUP_KEYS`.
- Input: `keys{}`, `fireKeyStack`, `FIRE_ANGLES` (compass i/o/p/k/;/,/./), `keyboardFireAngle()`.
- World: `map[][]`, `isWall()`, `isBorderTile()`, `generateWarehouse()`, `randomFloorTile()`,
  `hasLineOfSight()`, `destroyShelf()`; Cleaner patrol routing: `tileFloor`/`tileCenter`/
  `tileClearRun`/`rectPerimeterClear`/`nearestWaypoint`/`buildCleanerPatrol`/`advancePatrol`.
- Flow: `GAME`; `newGame()` (full reset) -> `buildLevel()` (per-level, keeps hp/powerups/score;
  resets `ebolts`) -> `nextLevel()`.
- Spawning: `spawnEnemy(type,pos)` (per-type init incl. Security's `fireCd`/`winding`/`aim`,
  Sorter's `fireCd`/`wander`/`canSee`, Cleaner's patrol route via `buildCleanerPatrol`, Drone's
  `flying`/`dropCd`/`weavePhase`/`rotor`, Manager's `fireCd`/`winding`/`aim`/`canSee`);
  `spawnFromTerminal(type)` (emits from a random matching terminal, returns false if none left);
  `spawnWave(type)` (cap-aware; calls `spawnFromTerminal`).
- Entities: `dan`, `shots`, `enemies`, `terminals`, `pickups`, `marks`, `floats`, `exit`, **`ebolts`**.
- Update: `update(dt)` branches by state; `updateDan` (now applies `dan.slow` move-scaling + decays
  `slow`/`sprayTick`) / `updateShots/Enemies/Ebolts/Pickups/Effects/Camera`; per-type AI
  `updatePicker/Forklift/Security/Sorter/Cleaner/Drone/Manager`. All ground movers apply
  `berserSpd(e)` multiplier when `e.berserk > 0`. Berserk timer decays in `updateEnemies` loop.
- **Drone (flying):** `updateDrone(e,dt)` — free mover (NOT `moveBody`), seeks a hover spot ABOVE Dan
  (`hoverAbove`) swaying via `weavePhase`, clamped to the interior border only; drops down its own
  column when at/above + lined up (ignores walls / no LOS).
- **Cleaner spray:** `updateCleaner` (patrol along waypoints <-> spray windup/active), `danInSprayCone`
  (range + half-angle + LOS, gates damage), `coneRayDist` (wall raymarch — clips the rendered cone and
  gates spraying into walls), `applySpray(d)` (refresh `dan.slow`, tick `dan.hp` via `dan.sprayTick`).
- **Enemy projectiles:** `fireEnemyBolt(e,angle,d)` + `fireEnemyArc(e,tx,ty,d)` + `fireEnemyDrop(e,tx,ty,d)`
  + `fireEnemyHoming(e,d)` (spawn into `ebolts`); `updateEbolts(dt)` dispatches by `kind` — straight
  `bolt` (range/wall expiry, overlap hit), `arc` via `updateArc(b,dt)` (time-based lob, wall-ignoring,
  AoE), `drop` via `updateDrop(b,dt)` (vertical descent onto fixed point, wall-ignoring, AoE), and
  `homing` via `updateHoming(b,dt)` (steered missile, capped turn rate, wall-AoE on impact).
- Combat: `meleeContact(e,dx,dy,dist,dmg)` (0-dmg-safe; adds `berserDmgBonus` when `e.berserk>0`),
  `killEnemy()` (awards points, shows score float for ALL kills, triggers Manager berserk pulse),
  `destroyTerminal()`.
- Collision: `moveBody()` + `bodyHitsWall()` (per-axis AABB vs tiles).
- Render: camera transform; `drawPicker()`, `drawForklift()`, `drawSecurity()`, `drawSorter()`,
  `drawCleaner()` (bot + cone + spray droplets), `drawDrone()` (elevated body + cast shadow + spinning
  rotors + arming light), `drawManager()` (dark navy chassis, missile launcher arm, red visor, dashed
  windup beam, 6 HP pips), `drawEbolts()` (bolt + arc box + drop package/reticle/shadow + homing
  missile with exhaust plume + fins), `drawEnemies()` (berserk orange aura on any berserked enemy),
  `drawMarks()` (`"berserk"` expanding ring mark on Manager death),
  `drawTerminals()`, `drawMarks()`, `drawDan()` (slow aura), HUD/screens.

## Testing scaffolding to replace with real GDD behavior later

- Power-up pickup respawn (`CFG.PICKUP_RESPAWN`/`MAX_PICKUPS`).
- Terminal counts + per-type `spawners`/`preplace`/`interval`/`max` are test tuning; real
  difficulty mix (multiple types/level, scaling) comes with GDD §8.3.

## Remaining roadmap

Confirmed order (each step adds ONE new system); pair Scanner/Manager with Pickers; defer Inventory
until human workers exist.

1. Picker + destroyable Dispatch Terminal — **DONE (L1)**
2. Forklift Bot (charge + LOS + destructible shelves) — **DONE (L2)**
3. Security Bot + shared enemy-projectile system (straight `bolt`) — **DONE (L3)**
4. Sorter Bot — cowardly flee/cover AI + arcing lobbed projectile (`kind:"arc"`) — **DONE (L4)**
5. Cleaner Bot — cone spray + first status effect on Dan (slow) — **DONE (L5)**
6. Drone — first flier (free mover, ignores walls) + vertical bomb-drop (`kind:"drop"`) — **DONE (L6)**
7. Manager Bot — homing missiles (`kind:"homing"`) + on-death berserk pulse — **DONE (L7)**
- Scanner Bot — buffs/alarms nearby robots; test alongside Pickers.
- Inventory Bot — hunts human workers; needs the workers feature first.

Larger unbuilt GDD features: human workers + rescue scoring (§7), Atomic Dustbin special (§5),
full procedural placement (§8.1), audio (§10), sprite-art polish (§10).

### Manager decisions (L7 — confirm if changing feel)

- **Missile is outrunnable by design.** `missileSpeed` 90 px/s vs Dan's 185 px/s — even slowed by
  Cleaner spray (×0.5 = 92.5 px/s) Dan can barely outpace it. `missileTurnRate` 1.4 rad/s lets it
  track straights; the counterplay is sharp corners into shelving to lure it into a wall-AoE. Tune
  `missileSpeed` up (harder) or `missileTurnRate` down (wider turns = easier to dodge around corners).
- **Wall impact = small AoE, not a ricochet.** Missile detonates on any wall tile with `missileBlast`
  24 px radius — harmless if Dan's clear. (Alt: ricochet like bounce-shot — would make luring into
  walls a double-edged tactic.)
- **Berserk refresh = max of existing vs new.** If two Managers die near the same robot, the berserk
  timer is refreshed to whichever is longer (`Math.max(existing, berserDur)`), not stacked.
- **L7 is a mixed-type level.** Manager terminals + 2 hardcoded Picker terminals + 3 preplaced
  Pickers. The spawn loop now iterates all terminal types present (multi-type support generalized —
  any future mixed level works without further changes). Picker max (22) and Manager interval (8 s)
  govern their respective cadences.
- **Score float added to all enemy kills.** `killEnemy` now calls `addFloat` for every enemy type
  (previously only terminal destructions showed a float). Minor feedback improvement; revert easily.
- **Manager contact damage = 0.** Pure ranged unit; `dmgContact:0`. Even berserk, it does no melee.
  The berserk dmg bonus only applies to enemies with `dmg > 0` (Pickers, Forklifts, Security).

## Implementation notes for the next enemy (Scanner Bot)

Scanner Bot is a support enemy: it doesn't attack Dan directly, but triggers an **alarm** that buffs
nearby robots when it detects Dan in line-of-sight. Key new idea: **indirect threat via area buff**.

- **Detection loop:** `updateScanner(e,dt)` polls LOS to Dan (`hasLineOfSight`) on a throttled timer.
  When it acquires Dan within sight range, start `e.alarming = true` + a persistent alarm timer
  (`e.alarmT`). While alarming: nearby enemies receive a speed/damage buff (similar to berserk but
  lighter, continuous rather than one-shot). If LOS breaks (Dan ducks behind a shelf), the alarm fades
  after a grace period.
- **Alarm visual:** Scanner should have a rotating radar dish or sweep arc; while alarming, emit a
  pulsing red ring around it (similar to berserk but continuous). Dan's shot killing the Scanner
  should cancel the alarm instantly.
- **Buff scope:** `alarmRadius` (e.g. 300 px) — only robots within range get the buff. This means
  Dan can kill the Scanner to stop the buff, or lure buffed robots out of range.
- **No contact / no ranged damage:** pure support unit (GDD §6.1.3). `dmgContact:0`, no ebolts.
- **Register checklist:** `ENEMY.scanner`, `LEVEL_PLAN += "scanner"`, `TERMINAL_TINT.scanner`,
  `COL` entries, `spawnEnemy` init, `updateScanner`, dispatch in `updateEnemies`/`drawEnemies`,
  `drawScanner`, HUD `typeName`. No new projectile kind needed.

Tuning scaffolding still in place (replace with GDD §8.3 difficulty mix later): power-up pickup
respawn, and per-type `spawners`/`preplace`/`interval`/`max`.
