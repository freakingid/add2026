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
  straight, dies on walls), `arc` (Sorter — time-based lob, ignores walls, AoE on landing), and
  `drop` (Drone — descends vertically onto a FIXED point, ignores walls, AoE on landing).
  Stubbed for later: homing (Manager). Cone (Cleaner) is handled outside the pool. Dan-collision
  funnels through the shared i-frame window via `hitDanRanged` (point) / `hitDanArea` (blast).
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
- `LEVEL_PLAN` (`["picker","forklift","security","sorter","cleaner","drone"]`) + `levelType()` — enemy/level.
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
  `flying`/`dropCd`/`weavePhase`/`rotor`); `spawnFromTerminal(type)` (emits from a random matching
  terminal, returns false if none left); `spawnWave(type)` (cap-aware; calls `spawnFromTerminal`).
- Entities: `dan`, `shots`, `enemies`, `terminals`, `pickups`, `marks`, `floats`, `exit`, **`ebolts`**.
- Update: `update(dt)` branches by state; `updateDan` (now applies `dan.slow` move-scaling + decays
  `slow`/`sprayTick`) / `updateShots/Enemies/Ebolts/Pickups/Effects/Camera`; per-type AI
  `updatePicker/Forklift/Security/Sorter/Cleaner/Drone`.
- **Drone (flying):** `updateDrone(e,dt)` — free mover (NOT `moveBody`), seeks a hover spot ABOVE Dan
  (`hoverAbove`) swaying via `weavePhase`, clamped to the interior border only; drops down its own
  column when at/above + lined up (ignores walls / no LOS).
- **Cleaner spray:** `updateCleaner` (patrol along waypoints <-> spray windup/active), `danInSprayCone`
  (range + half-angle + LOS, gates damage), `coneRayDist` (wall raymarch — clips the rendered cone and
  gates spraying into walls), `applySpray(d)` (refresh `dan.slow`, tick `dan.hp` via `dan.sprayTick`).
- **Enemy projectiles:** `fireEnemyBolt(e,angle,d)` + `fireEnemyArc(e,tx,ty,d)` + `fireEnemyDrop(e,tx,ty,d)`
  (spawn into `ebolts`); `updateEbolts(dt)` dispatches by `kind` — straight `bolt` (range/wall expiry,
  overlap hit), `arc` via `updateArc(b,dt)` (time-based lob, wall-ignoring, AoE), and `drop` via
  `updateDrop(b,dt)` (vertical descent onto a fixed point, wall-ignoring, AoE); impact via
  `hitDanRanged(b)` (point) / `hitDanArea(x,y,dmg)` (blast), both through the shared i-frame window.
- Combat: `meleeContact(e,dx,dy,dist,dmg)` (0-dmg-safe), `killEnemy()`, `destroyTerminal()`.
- Collision: `moveBody()` + `bodyHitsWall()` (per-axis AABB vs tiles).
- Render: camera transform; `drawPicker()`, `drawForklift()`, `drawSecurity()`, `drawSorter()`,
  `drawCleaner()` (bot + cone + spray droplets), `drawDrone()` (elevated body + cast shadow + spinning
  rotors + arming light), `drawEbolts()` (bolt + arc box + drop package/reticle/shadow),
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
7. **Manager Bot (L7) — NEXT: homing missiles (`kind:"homing"`) + on-death berserk pulse.**
   Rare boss-tier (HP 6, 500 pts, 3 dmg/missile). Add the `homing` projectile kind to `ebolts`
   (slow-tracking toward Dan, outrunnable / lure-into-walls to detonate); on death emit a temporary
   **berserk pulse** buffing nearby robots (speed + melee dmg). Best tested alongside Pickers.
- Scanner Bot — buffs/alarms nearby robots; test alongside Pickers.
- Inventory Bot — hunts human workers; needs the workers feature first.

Larger unbuilt GDD features: human workers + rescue scoring (§7), Atomic Dustbin special (§5),
full procedural placement (§8.1), audio (§10), sprite-art polish (§10).

## Implementation notes for the next enemy (Manager / homing missiles + berserk)

The new ideas are a **tracking** projectile and an **on-death buff aura**:

- New projectile kind `homing`: add `fireEnemyHoming(e,d)` + an `updateHoming(b,dt)` branch in
  `updateEbolts`. Unlike `bolt` (straight) it steers: each frame, rotate its velocity a capped amount
  toward Dan (a max turn rate so it's outrunnable and can be lured into walls). It should set
  `stopsOnWall:true` so luring it into a shelf detonates it harmlessly (small AoE on wall/expiry/Dan).
  3 dmg (GDD). Reuse `hitDanRanged`/`hitDanArea` through the shared i-frame window.
- Manager AI `updateManager(e,dt)`: rare, slow-ish pursuer with LOS-gated fire on a long cooldown
  (reuse `hasLineOfSight`). It's a normal ground unit — route through `moveBody` (NOT a flier).
- **On-death berserk pulse:** Manager needs death-side logic that current `killEnemy(index)` doesn't
  have — when a Manager dies, find nearby robots and apply a temporary `e.berserk` timer that boosts
  speed + melee damage (no new ranged). Cleanest: give `killEnemy` an optional hook or check
  `e.type === "manager"` inside it before the splice, then iterate `enemies` within a radius and
  stamp `e.berserk = duration`. Per-type movers read a `e.berserk>0 ? buffMult : 1` on speed, and the
  contact-dmg branch adds a berserk bonus. Decide: does berserk also re-trigger if two Managers die
  near each other (refresh vs ignore)? Suggest refresh (take the max remaining).
- Rarity: Managers are boss-tier — low `max` (1–2), long `interval`, few `spawners`. GDD says test
  alongside Pickers, so L7 may want a Picker+Manager mix rather than pure Manager (first multi-type
  level — would also exercise `spawnWave` with a per-terminal type already in place).
- Register (same checklist as every enemy): `ENEMY.manager` stats, `LEVEL_PLAN += "manager"`,
  `TERMINAL_TINT.manager`, `COL` entries, `spawnEnemy` init block, dispatch in `updateEnemies`/
  `drawEnemies`, contact-dmg branch, HUD `typeName`, `drawManager`, plus the `homing` fire/update/draw.

Tuning scaffolding still in place (replace with GDD §8.3 difficulty mix later): power-up pickup
respawn, and per-type `spawners`/`preplace`/`interval`/`max`.
