# Atomic Dustbin Dan — Build Status & Handoff

What is actually built, the decisions behind it, and where the code lives.
Cross-cutting non-negotiables and the roadmap checklist are in **CLAUDE.md**;
design intent is in **GDD.md**. Behavior described here is the source of truth for
*reality*; where it diverges from the GDD, that divergence is intentional and noted.

## Current state — implemented and working

- Single-file HTML5 Canvas + JS game; delta-timed loop; pixelated retro warehouse look.
- **Dan:** WASD + diagonals, mouse aim/fire, 8-key keyboard directional fire
  (`i o p` / `k l ;` / `, . /`, `l` = no-fire center — see CLAUDE.md), 20 HP,
  melee-on-contact with knockback + i-frames.
- **Soap launcher:** finite range, base cooldown, base cap 3.
- **Power-ups (Rapid / Triple / Bounce):** shot-count based, stackable, independent
  counters, HUD pills, floor pickups + floating callouts.
- **Enemies implemented:**
  - **Picker Bot** (L1) — chase + melee. Spawns from terminals.
  - **Dispatch Terminal** (L1) — **DESTROYABLE** (HP 4, 300 pts, HP pips, hit flash); destroying it stops its spawning.
  - **Forklift Bot** (L2) — slow roam, LOS lock + wind-up telegraph + straight-line charge; **smashes shelving** in its path (destructible tiles + dust puffs). 4 dmg on charge / 2 on contact; can't break the outer border wall.
  - **Security Bot** (L3) — fast pursuer; chases Dan and fires a straight **taser bolt** on a fast cooldown whenever it has LOS + Dan within fire range. Brief latched-aim windup telegraph (visor brightens, charge spark on prongs) keeps the shot dodgeable. HP 3, 200 pts, 2 dmg/bolt, light 1 dmg contact zap. First user of the shared enemy-projectile system.
  - **Sorter Bot** (L4) — cowardly lobber. Always knows Dan; LOS flips mood: **exposed** → panics and flees fast in an erratic scatter, holds fire; **in cover** → advances and lobs an **arcing box** (over walls) when within `fireRange` (140), telegraphed by a landing reticle + ground shadow. HP 2, 100 pts, 1 dmg/hit, no contact damage.
  - **Cleaner Bot** (L5) — slow hazard / debuffer (GDD §6.1.7). **Patrols a fixed route** chosen at spawn and kept for life (a back-and-forth line down the longest clear aisle through its spawn tile, or a small rectangular loop when one with a fully-walkable perimeter fits — ~17% loops / ~83% lines in practice), spraying a short cone **ahead of its heading**. While Dan is inside the cone he takes **1 HP/tick AND a movement-slow**. Damage is LOS-gated (a shelf blocks it); the rendered cone is **clipped to walls** so it stops at shelves instead of bleeding through, and it won't start a spray facing a wall point-blank. HP 2, 100 pts, no contact damage. **Introduces the first status effect on Dan.**
  - **Drone** (L6) — aerial bomber (GDD §6.1.5). **First FLYING enemy:** ignores ground walls entirely (free mover, not `moveBody`). **Three-phase predatory orbit** (STALK → COMMIT → DROP): circles Dan at `stalkRadius` (CW/CCW, alternating per spawn), then breaks orbit to climb above his column, then **drops a package bomb straight down its OWN column** (bomb x = drone x) onto Dan's row — aborting back to STALK if Dan jukes past `abortDist` before it lines up, so mobility is the counterplay. The `drop` projectile descends onto that point, telegraphed by a ground reticle + growing shadow, with fake perspective (~2x size at release, shrinking to 1x at impact). **Bombs ignore walls / need no LOS** — you can't hide, only move out from under it. HP 2, 150 pts, 2 dmg/bomb (AoE), no contact damage. Drawn elevated with a cast ground-shadow (body-anchored: soap shots hit the sprite you see). Carries an `e.flying` flag for the future Atomic Dustbin attract phase.
  - **Manager Bot** (L7) — rare **boss-tier** ground pursuer (HP 6, 500 pts). Slow mover; fires a slow-tracking **homing missile** (`kind:"homing"`) on a long cooldown whenever it has LOS + range. A dashed-beam windup telegraphs the launch (aim latched at windup start = dodgeable). Missile steers toward Dan each frame with a capped turn rate — outrunnable on straights; lure it into a shelf to detonate harmlessly (small wall-AoE). On death, emits a **berserk pulse** (expanding orange ring mark): all robots within `berserRadius` (220 px) gain `e.berserk` timer → speed ×1.7 + melee dmg +2 for 7 s. Refreshes if a second pulse hits before expiry. L7 is the first **mixed-type level**: Manager terminals + 2 Picker terminals (3 preplaced Pickers), so the pulse has targets. No contact damage (`dmgContact:0`). Feel dials: `missileSpeed` 90 / `missileTurnRate` 1.4 rad/s / `fireCd` 3.5 s / `berserDur` 7 s / `berserSpeedMult` 1.7 / `berserDmgBonus` 2 / `max` 2 / `interval` 8 s.
- **Dan status effects:** `dan.slow` (sec) scales move speed by `CFG.SLOW_FACTOR` while active; `dan.sprayTick` rate-limits spray DoT so overlapping cones can't multi-tick. Both decay in `updateDan`, reset per level. Visual: green aura + drips while slowed.
- **Shared enemy-projectile system (`ebolts`):** one pool drives every robot's ranged attack; each projectile carries a `kind` selecting motion + expiry. Implemented: `bolt` (Security — straight, dies on walls), `arc` (Sorter — time-based lob, ignores walls, AoE on landing), `drop` (Drone — descends vertically onto a FIXED point, ignores walls, AoE on landing), `homing` (Manager — slow-tracking missile, steers toward Dan each frame, stops on wall with small AoE). Cone (Cleaner) is handled outside the pool. Dan-collision funnels through the shared i-frame window via `hitDanRanged` (point) / `hitDanArea` (blast).
- **Spawner-terminals (all enemies):** every level places destroyable spawner-terminals (HP 4, 300 pts, HP pips, hit flash) of its enemy type; **all enemies emerge from terminals** (no floor placement). Emitter light is tinted per enemy type; brief white pulse on each emit. Destroying all terminals of a type stops its spawns.
- **Level system:** procedural warehouse, camera, EXIT door + off-screen pointer, level-clear splash, endless progression. **HP, power-ups, and score persist across levels.**
- **States:** `title` / `playing` / `levelclear` / `dead`.

> Cross-cutting "do not silently change" rules (HP/score persistence, decrement model,
> max-shots formula, bounce, one-type-per-level, global spawn cadence, knockback,
> keyboard mapping) now live in **CLAUDE.md**. The per-subsystem feel decisions below
> stay here, next to the systems they govern.

---

## Subsystem decisions (confirm if changing feel)

### Ranged system (Security / `ebolts`)

- **Shared i-frame window:** enemy bolts use the SAME `CFG.DAN_IFRAME` window as melee, so a Forklift charge and a taser bolt landing the same instant can't double-dip. (Alt: per-bolt independent invuln.)
- **Security contact damage = 1** (`dmgContact`). GDD lists no melee value for Security; this is a light "don't mop a live taser" zap. Set to 0 for a pure-ranged unit. Dan still mops it + gets knocked back on contact regardless.
- **Bolt absorbed during i-frames:** a bolt overlapping Dan while he's already invulnerable is removed (counts as a blocked hit) rather than passing through to land later.
- **Bolts die on walls** (`kind:"bolt"` sets `stopsOnWall`). Only matters when Dan ducks behind a shelf mid-flight — the intended dodge. Drone bombs set this false to ignore walls.
- **Soap shots and enemy bolts ignore each other** — you can't currently shoot a bolt down.

### Sorter (L4)

- **Fires ONLY in cover** (no LOS); holds fire while exposed/fleeing.
- **Fires only in cover AND within lob range** (`fireRange`, 280px — a thrown box can't go far; not in the GDD, suggest adding). Out of range it keeps advancing under cover and holds fire, lobbing the instant it closes in.
- **Arc targets Dan's position at lob time** (no leading); slow flight + landing reticle/shadow is the counterplay. Blast radius `arcBlast` (30) around the landing point; absorbed by i-frames.
- **No contact damage** (`dmg=0`). `meleeContact` guards so a 0-damage touch gives Dan no free i-frames — Dan just mops the cornered coward.
- **Flee is erratic** (`fleeSpeed`/`fleeJitter`, wander random-walk fed through `sin`) — a panic scatter, not a straight retreat.

### Cleaner (L5)

- **Patrols a FIXED route** chosen at spawn and kept for life (no random wander). `buildCleanerPatrol` picks a back-and-forth **line** down the longest clear aisle through its spawn tile, or (≈`rectChance` 0.35 odds, when one fits) a small **rectangular loop** with a fully-walkable perimeter. Lines win ~83% of the time in the current shelf-heavy map; both paths are live. Stuck-against-geometry is handled by `wpTimeout` advancing the waypoint. (Alt: serpentine / waypoint-graph routes.)
- **Oblivious by default** (`aimAtDan:false`): sprays along its patrol heading, not at Dan. Flip `aimAtDan` to turn toward Dan before each spray (more aggressive; diverges from GDD).
- **Spray render is CLIPPED to walls** (`coneRayDist` raymarch per cone slice + per droplet), so the cone visually stops at shelves instead of bleeding through. Damage was already correct. Also **won't start a spray facing a wall point-blank** (`sprayMinClear` 0.4 = needs ≥40% of range open ahead).
- **Spray DoT uses its own tick timer** (`dan.sprayTick`/`tickEvery`), NOT the melee/bolt i-frame window — DoT hazard, ignores i-frames, overlapping cones can't double-tick. Slow always refreshes while inside. Damage stays LOS-gated via `danInSprayCone`. (Alt: gate damage by i-frames.)
- **No contact damage** (mop the bot freely; `meleeContact` 0-dmg guard).
- **Slow = movement only** (`SLOW_FACTOR` 0.5); fire rate unaffected. `sprayRange` 108 / ~60° cone / `slowDur` 0.9 s are the feel dials.

### Drone (L6)

- **Flies over walls; no LOS gate on bombs.** This is the Drone's whole identity (distinct from Security, which needs LOS, and Sorter, which lobs over walls but only from cover). Cover is no defense — the only counterplay is moving out from under it. (Alt: gate drops by LOS — would erase the "can't hide" identity.)
- **Soap shots CAN hit it** (GDD dodgeable=Yes, HP 2). Simplest + readable. (Alt: fliers immune to ground fire — would need an anti-air mechanic; flagged, not built.)
- **Body-anchored hitbox.** e.x,e.y is the body you see and shoot; the cast ground-shadow is drawn below it (offset altitude) purely as an elevation cue.
- **No contact damage, still mop-able** (meleeContact 0-dmg guard). It orbits at standoff so contact is rare anyway.
- **Three-phase predatory orbit replaces the old "hover above Dan" behavior.** STALK: drone orbits Dan at stalkRadius (180 px), circling CW or CCW (e.orbitDir ±1, assigned at spawn; alternating across drones so multiple drones cross paths — harder to dodge simultaneously). No bombs during this phase; duration randomised per cycle (stalkMinT–stalkMaxT, suggested 1.5–3.0 s). COMMIT: drone breaks orbit and climbs toward dan.y - hoverAbove; if Dan moves so |drone.x - dan.x| > abortDist (200 px) before alignment, drone aborts back to STALK — mobility is the counterplay. DROP: once at/above Dan and within dropAlignX (80 px), fires fireEnemyDrop (existing reticle + growing shadow system), then re-enters STALK with a fresh randomised duration and optional direction flip.
- **drop still falls down the drone's OWN column** (tx = drone.x, ty = Dan's row); bomb scales ~2x→1x on descent (fake perspective). Feel dials: stalkRadius 180 / stalkMinT 1.5 / stalkMaxT 3.0 / abortDist 200 / hoverAbove 220 / dropAlignX 80 / dropCd 1.7 / dropDur 0.9 (dodge window) / dropBlast 36 / dropDmg 2 / max 4.
- **e.flying flag** is set so the future Atomic Dustbin attract phase (GDD §5.2) can pull drones, and so other systems can branch on fliers later.

### Manager (L7)

- **Missile is outrunnable by design.** `missileSpeed` 90 px/s vs Dan's 185 px/s — even slowed by Cleaner spray (×0.5 = 92.5 px/s) Dan can barely outpace it. `missileTurnRate` 1.4 rad/s lets it track straights; counterplay is sharp corners into shelving to lure it into a wall-AoE. Tune `missileSpeed` up (harder) or `missileTurnRate` down (easier).
- **Wall impact = small AoE, not a ricochet.** Missile detonates on any wall tile with `missileBlast` 24 px radius — harmless if Dan's clear. (Alt: ricochet like bounce-shot.)
- **Berserk refresh = max of existing vs new.** Two Managers dying near the same robot refresh the timer to whichever is longer (`Math.max(existing, berserDur)`), not stacked.
- **L7 is a mixed-type level.** Manager terminals + 2 hardcoded Picker terminals + 3 preplaced Pickers. The spawn loop iterates all terminal types present (multi-type support generalized — any future mixed level works without further changes). Picker `max` (22) and Manager `interval` (8 s) govern their cadences.
- **Score float on all enemy kills.** `killEnemy` calls `addFloat` for every type (previously only terminal destructions). Minor feedback improvement; revert easily.
- **Manager contact damage = 0.** Pure ranged unit. Even berserk, no melee. The berserk dmg bonus only applies to enemies with `dmg > 0` (Pickers, Forklifts, Security).

---

## Architecture map (where things live)

> The game is now **ES modules** under `src/`, loaded by `atomic-dustbin-dan.html`
> (which only imports and runs the delta-timed loop). Run it from a static server
> (e.g. `python3 -m http.server`) — `file://` blocks module loads. All mutable
> run/level state lives on the single `G` object in `state.js`; modules read &
> mutate `G.dan`, `G.shots`, … (ES modules can't reassign an imported binding, so
> whole-value resets like `G.shots = []` happen in `level.js`).

**Module layout** (leaf-first; arrows = imports):

- **`config.js`** — `CFG`, `ENEMY` (per-type stat table + ranged stats), `POWERUPS`/`POWERUP_KEYS`, `LEVEL_PLAN`. Pure data. *No imports.*
- **`palette.js`** — `COL`, `TERMINAL_TINT`. *No imports.*
- **`canvas.js`** — `canvas`, `ctx`, `VIEW_W/H`. *No imports.*
- **`state.js`** — `G` (the mutable container: run meta + entities `dan/shots/enemies/terminals/pickups/marks/floats/ebolts/camera/exit` + `spawnTimer`/`pickupTimer`) and `levelType()`. ← config.
- **`world.js`** — `map[][]` (exported `let`, reassigned only here), `isWall`/`isBorderTile`/`generateWarehouse`/`randomFloorTile`/`hasLineOfSight`/`destroyShelf`, collision `bodyHitsWall`/`moveBody`, tile helpers `tileFloor`/`tileCenter`/`tileClearRun`/`rectPerimeterClear`, `clamp`. ← config, canvas, state.
- **`effects.js`** — `addFloat`, `updateEffects` (marks + floats lifetimes). ← state.
- **`combat.js`** — shared damage/death: `hitDanRanged`/`hitDanArea` (i-frame + knockback), `meleeContact` (0-dmg-safe; `berserDmgBonus` when berserk), `killEnemy` (points, score float for all kills, Manager berserk pulse), `destroyTerminal`. ← config, palette, state, effects.
- **`projectiles.js`** — the `G.ebolts` pool: `fireEnemyBolt/Arc/Drop/Homing` + `updateEbolts` dispatching by `kind` (`bolt`/`arc`/`drop`/`homing`; `updateArc/Drop/Homing` helpers). ← config, state, world, combat.
- **`enemies.js`** — `spawnEnemy` (per-type init), `updateEnemies` (dispatch + melee contact via `combat`), per-type AI `updatePicker/Forklift/Security/Sorter/Cleaner/Drone/Manager`, `berserSpd`, Cleaner patrol routing (`nearestWaypoint`/`buildCleanerPatrol`/`advancePatrol`) + spray helpers (`danInSprayCone`/`coneRayDist`(exported, also clips the rendered cone)/`applySpray`). ← config, state, world, combat, projectiles.
- **`level.js`** — `newGame` (full reset) → `buildLevel` (world + terminals + exit; keeps HP/powerups/score) → `nextLevel`; spawner-terminal emission `spawnFromTerminal`/`spawnWave`; pickups `spawnPickup`/`updatePickups`. ← config, state, world, enemies, effects.
- **`input.js`** — `keys`, `mouse`, `fireKeyStack`, `FIRE_ANGLES`, `keyboardFireAngle`; registers key/mouse/touch listeners on import (side-effect). ← canvas, state, level (`newGame`).
- **`player.js`** — `updateDan` (slow move-scaling, decays `slow`/`sprayTick`), `fireVolley`/`fireBubble`, `updateShots` (bubble↔enemy↔terminal). ← config, state, input, world, combat.
- **`update.js`** — `update(dt)` orchestrator + `updateCamera` + spawn/terminal/exit/death bookkeeping. ← state, config, player, enemies, projectiles, level, effects, world, canvas.
- **`render-entities.js`** — `drawEnemies` (per-type sprites + berserk aura) + `drawEbolts` (bolt/arc/drop/homing). ← canvas, state, config, palette, enemies (`coneRayDist`).
- **`screens.js`** — `drawHUD` + `drawTitle`/`drawLevelClear`/`drawGameOver` (+ internal `drawFireLegend`). ← canvas, state, config, palette.
- **`render.js`** — `render()` compositor + world/entity draws (`drawFloor`/`drawWalls`/`drawMarks`/`drawExit`/`drawExitPointer`/`drawTerminals`/`drawShots`/`drawPickups`/`drawFloats`/`drawDan`). ← canvas, state, config, palette, world, render-entities, screens.
- **`atomic-dustbin-dan.html`** — entry: imports `update` + `render` (+ `input` for its listeners) and runs the delta-timed `loop`. Nothing else.

---

## Testing scaffolding to replace with real GDD behavior later

- Power-up pickup respawn (`CFG.PICKUP_RESPAWN` / `MAX_PICKUPS`).
- Terminal counts + per-type `spawners`/`preplace`/`interval`/`max` are test tuning; real difficulty mix (multiple types per level, scaling) comes with GDD §8.3.

---

## Next enemy — Scanner Bot (implementation notes)

Support enemy: doesn't attack Dan directly, but triggers an **alarm** that buffs
nearby robots when it detects Dan in LOS. Key new idea: **indirect threat via area buff.**

- **Detection loop:** `updateScanner(e,dt)` polls LOS to Dan (`hasLineOfSight`) on a throttled timer. On acquiring Dan within sight range, set `e.alarming = true` + a persistent alarm timer (`e.alarmT`). While alarming, nearby enemies receive a speed/damage buff (like berserk but lighter, continuous rather than one-shot). If LOS breaks, the alarm fades after a grace period.
- **Alarm visual:** rotating radar dish / sweep arc; while alarming, a pulsing red ring (continuous). Killing the Scanner cancels the alarm instantly.
- **Buff scope:** `alarmRadius` (e.g. 300 px) — only robots in range get the buff. So Dan can kill the Scanner to stop it, or lure buffed robots out of range.
- **No contact / no ranged damage:** pure support (GDD §6.1.3). `dmgContact:0`, no ebolts.
- **Register checklist:** `ENEMY.scanner`, `LEVEL_PLAN += "scanner"`, `TERMINAL_TINT.scanner`, `COL` entries, `spawnEnemy` init, `updateScanner`, dispatch in `updateEnemies`/`drawEnemies`, `drawScanner`, HUD `typeName`. No new projectile kind needed.
- Pair with Pickers so the buff has targets. Tuning scaffolding above still applies.
