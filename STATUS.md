# Atomic Dustbin Dan — Build Status & Handoff

What is actually built, the decisions behind it, and where the code lives.
Cross-cutting non-negotiables and the roadmap checklist are in **CLAUDE.md**;
design intent is in **GDD.md**. Behavior described here is the source of truth for
*reality*; where it diverges from the GDD, that divergence is intentional and noted.

## Planned changes

Work these **one at a time, then test**. Once a change is built + tested, fold its
decisions into the relevant "Subsystem decisions" entry and remove the entry here.

_(none queued — the Controls overhaul shipped; see "Controls / input" below.)_

---

## Current state — implemented and working

- Single-file HTML5 Canvas + JS game; delta-timed loop; pixelated retro warehouse look.
- **Dan:** device-agnostic controls (GDD §4) — keyboard+mouse OR gamepad, chosen on
  the title and locked for the run (`G.inputMode`). Keyboard: WASD move (diagonals =
  two adjacent), O/P/L/K cardinal fire (diagonals = two adjacent, vector-sum angle),
  mouse aim + left-click fire, E/F special. Gamepad: left stick move, right stick
  aim+fire, any bumper/trigger special. All player code reads `getMoveVec()` /
  `getFireAngle()` / `isDeploySpecial()` (see "Controls / input"). 20 HP,
  melee-on-contact with knockback + i-frames.
- **Soap launcher:** finite range, base cooldown, base cap 3.
- **Power-ups (Rapid / Triple / Bounce):** shot-count based, stackable, independent
  counters, HUD pills, floor pickups + floating callouts.
- **Enemies implemented:**
  - **Picker Bot** (L1) — chase + melee. Spawns from terminals.
  - **Dispatch Terminal** (L1) — **DESTROYABLE** (HP 4, 300 pts, HP pips, hit flash); destroying it stops its spawning.
  - **Forklift Bot** (L2) — slow roam, LOS lock + wind-up telegraph + straight-line charge; **smashes shelving** in its path (destructible tiles + dust puffs). 4 dmg on charge / 2 on contact; can't break the outer border wall.
  - **Security Bot** (L3) — fast pursuer; chases Dan and fires a straight **taser bolt** on a fast cooldown whenever it has LOS + Dan within fire range. Brief latched-aim windup telegraph (visor brightens, charge spark on prongs) keeps the shot dodgeable. HP 3, 200 pts, 2 dmg/bolt, light 1 dmg contact zap. First user of the shared enemy-projectile system. Its bolts also **hit other ground robots** (friendly fire, no score — GDD §9).
  - **Sorter Bot** (L4) — cowardly lobber. Always knows Dan; LOS flips mood: **exposed** → panics and flees fast in an erratic scatter, holds fire; **in cover** → advances and lobs an **arcing box** (over walls) when within `fireRange` (140), telegraphed by a landing reticle + ground shadow. HP 2, 100 pts, 1 dmg/hit, no contact damage.
  - **Cleaner Bot** (L5) — slow hazard / debuffer (GDD §6.1.7). **Patrols a fixed route** chosen at spawn and kept for life (a back-and-forth line down the longest clear aisle through its spawn tile, or a small rectangular loop when one with a fully-walkable perimeter fits — ~17% loops / ~83% lines in practice), spraying a short cone **ahead of its heading**. While Dan is inside the cone he takes **1 HP/tick AND a movement-slow**. Damage is LOS-gated (a shelf blocks it); the rendered cone is **clipped to walls** so it stops at shelves instead of bleeding through, and it won't start a spray facing a wall point-blank. HP 2, 100 pts, no contact damage. **Introduces the first status effect on Dan.**
  - **Drone** (L6) — aerial bomber (GDD §6.1.5). **First FLYING enemy:** ignores ground walls entirely (free mover, not `moveBody`). **Three-phase predatory orbit** (STALK → COMMIT → DROP): circles Dan at `stalkRadius` (CW/CCW, alternating per spawn), then breaks orbit to climb above his column, then **drops a package bomb straight down its OWN column** (bomb x = drone x) onto Dan's row — aborting back to STALK if Dan jukes past `abortDist` before it lines up, so mobility is the counterplay. The `drop` projectile descends onto that point, telegraphed by a ground reticle + growing shadow, with fake perspective (~2x size at release, shrinking to 1x at impact). **Bombs ignore walls / need no LOS** — you can't hide, only move out from under it. HP 2, 150 pts, 2 dmg/bomb (AoE), no contact damage. Drawn elevated with a cast ground-shadow (body-anchored: soap shots hit the sprite you see). Carries an `e.flying` flag for the future Atomic Dustbin attract phase.
  - **Manager Bot** (L7) — rare **boss-tier** ground pursuer (HP 6, 500 pts). Slow mover; fires a slow-tracking **homing missile** (`kind:"homing"`) on a long cooldown whenever it has LOS + range. A dashed-beam windup telegraphs the launch (aim latched at windup start = dodgeable). Missile steers toward Dan each frame with a capped turn rate and **spools up** from `missileSpeed` 90 to `missileSpeedMax` 210 (> Dan's 185) — outrunnable only while it accelerates, then lure it into a shelf to detonate harmlessly (small wall-AoE). The blast also **damages ground robots caught in it** (friendly fire, no score — GDD §9), and the missile detonates on a robot body too. On death, emits a **berserk pulse** (expanding orange ring mark): all robots within `berserRadius` (220 px) gain `e.berserk` timer → speed ×1.7 + melee dmg +2 for 7 s. Refreshes if a second pulse hits before expiry. L7 is the first **mixed-type level**: Manager terminals + 2 Picker terminals (3 preplaced Pickers), so the pulse has targets. No contact damage (`dmgContact:0`). Feel dials: `missileSpeed` 90 → `missileSpeedMax` 210 @ `missileAccel` 70 px/s² / `missileTurnRate` 1.4 rad/s / `fireCd` 3.5 s / `berserDur` 7 s / `berserSpeedMult` 1.7 / `berserDmgBonus` 2 / `max` 2 / `interval` 8 s.
  - **Scanner Bot** (L8) — **support / alarm emitter** (GDD §6.1.3). HP 2, 150 pts, **no direct attack** (`dmgContact:0`). Patrols a fixed route (reuses the Cleaner's patrol routing). While it has **LOS to Dan** it broadcasts an **alarm**: every robot within `alarmRadius` (300 px) gets faster (`alarmSpeedMult` 1.4) and hits harder (`alarmDmgBonus` +1) — **continuous** while in range (a short per-robot `e.alarmed` timer refreshed each frame), so it fades almost instantly when the Scanner dies or a robot leaves range; the alarm itself lingers `alarmGrace` (0.8 s) after LOS breaks. Lighter than the Manager's one-shot berserk pulse, and the two stack via the shared `buffSpd`/melee-bonus plumbing. Visual: rotating radar dish + sweep wedge; chassis flushes red + an expanding alarm ring while broadcasting; buffed robots wear a cyan aura. L8 is a **mixed-type level** (Scanner + Picker terminals) so the alarm has a cluster to amplify. **Priority kill before engaging clusters.**
  - **Inventory Bot** (L9) — **wanderer / worker-hunter** (GDD §6.1.6). HP 1, 75 pts, light **1 HP melee** to Dan. Dual state: **WANDER** (oblivious random roam) ↔ **HUNT** (locks the nearest human worker — on `proxAcquire` 150 px or a `huntPeriod` 6 s timer — and pursues at `huntSpeed` 96, just edging a worker's flee speed so it corners them against shelves). **The ONLY robot that can kill a worker**: on contact it removes the worker (no points, gone for the level, red "WORKER LOST" callout), then drops back to WANDER. **When no workers remain** (`G.workers.length === 0`) it stops wandering and **hunts Dan** directly at `huntDanSpeed` 105 (eye stays red), dealing its 1-HP melee — outrunnable, but punishes cornering. Dies to one mop/shot (HP 1) — kill it before it reaches a worker. Drawn as a low violet crawler with a grabber claw + an eye that goes red while hunting. L9 carries the standard 5 workers (every level does), so the hunt has targets.
  - **Mixed sandbox** (L10+) — not an enemy: a level whose `levelType()` is `"mixed"`, seeding **one terminal of every real enemy type** at once; the existing multi-type spawn loop then emits a varied swarm (capped per type), with workers + Inventory bots hunting them. Cadence is `CFG.MIXED_INTERVAL` (2 s). Levels past L10 reuse `"mixed"`, so endless play settles into the all-types arena. HUD banner reads "ALL UNITS".
- **Vending machines** (GDD §2.5) — static, **contact-triggered** HP restoration (no button press). Two variants: **small +5 HP** (dim green glow) and **large +10 HP** (brighter blue glow), placed **flush against walls** (`randomFloorTileNearWall` finds a floor tile bordering a wall; the cabinet is inset toward that wall so its back sits flush, long-axis parallel to the wall). **Single-use:** on contact it heals (capped at `dan.maxHp` 20), then enters a permanent **depleted** state (dark/static screen, glow extinguished, "static" cross-out) — no respawn within a level. HP gain is shown as a floating "+N" in the variant color. **Robots ignore them entirely** — no AI/pathfinding/collision references `G.vending`. Test levels place a fixed set (`CFG.VENDING.testPlacement` = one small + one large); full weighted procgen comes with §8.1. Lives in `vending.js`.
- **Atomic Dustbin special** (GDD §5) — a **rare, glowing-green deployable** Dan carries **one at a time** (`G.dan.hasDustbin`, persists across levels; collected by walking over a spinning floor pickup). Deploy with **E or F** (GDD §4.4): **stationary** → dropped at Dan's feet, straight into the attract phase; **moving** → **THROWN** in his movement direction, sliding with friction and **bouncing off walls** (`bounce` 0.7) until it settles. **Attract phase** (`attractDur` 2.5 s): a vortex opens — every robot within `attractRadius` (260; **drones included** via `e.flying`) is **pulled toward it and cannot act** (the pull in `vortexHold` makes a caught robot skip its whole AI tick, so it neither moves on its own nor fires). **Detonate**: a massive AoE (`blastRadius` 200) that **destroys every robot in range** for its **normal point value** (routed through `killEnemy`), with a **"DAN'S SPECIAL!"** callout, a shockwave ring (`"blast"` mark) + soapy debris. Dan is unharmed by his own blast. **Rare placement:** guaranteed on L1 (testing reach) then `spawnChance` 0.5 per level. State machine `G.dustbin.state`: `slide` → `attract` → (detonate → null); floor pickups in `G.dustbinPickups`. HUD shows a green **☢ DUSTBIN [E]** pill + a canister over Dan's head while carried. Lives in `dustbin.js`.
- **Dan status effects:** `dan.slow` (sec) scales move speed by `CFG.SLOW_FACTOR` while active; `dan.sprayTick` rate-limits spray DoT so overlapping cones can't multi-tick. Both decay in `updateDan`, reset per level. Visual: green aura + drips while slowed.
- **Shared enemy-projectile system (`ebolts`):** one pool drives every robot's ranged attack; each projectile carries a `kind` selecting motion + expiry. Implemented: `bolt` (Security — straight, dies on walls), `arc` (Sorter — time-based lob, ignores walls, AoE on landing), `drop` (Drone — descends vertically onto a FIXED point, ignores walls, AoE on landing), `homing` (Manager — slow-tracking missile, steers toward Dan each frame, stops on wall with small AoE). Cone (Cleaner) is handled outside the pool. Dan-collision funnels through the shared i-frame window via `hitDanRanged` (point) / `hitDanArea` (blast).
- **Spawner-terminals (all enemies):** every level places destroyable spawner-terminals (HP 4, 300 pts, HP pips, hit flash) of its enemy type; **all enemies emerge from terminals** (no floor placement). Emitter light is tinted per enemy type; brief white pulse on each emit. Destroying all terminals of a type stops its spawns.
- **Human workers + rescue scoring** (GDD §7) — 5 per level, scattered away from Dan's spawn. They **wander slowly, flee robots** within `avoidRadius` (scurrying faster while fleeing), and — when not fleeing and they have line of sight to Dan — **move toward Dan** at `seekSpeed` to make rescue easier (priority: flee > seek-Dan > wander). Dan **rescues by walking into one** for **escalating points** — 100 / 200 / 400 / 800 / 1600 (doubling, `rescueBase·2^n`), summing to **3,100** for all five, with a celebratory "ALL 5 SAVED!" callout on the last. HUD shows `WORKERS n/5 RESCUED`. The rescue counter (`G.rescued`) resets each level; the score persists. Drawn as a hi-vis hard-hat figure (clearly not a robot), with a "!" while fleeing.
- **Audio** (GDD §10) — retro arcade SFX **synthesized live via the Web Audio API** (no asset files; single-file/ES-module constraint holds). Lives in `audio.js`, a cross-cutting leaf (imports only `CFG`) exposing a named `sfx.*` API; every gameplay event adds a one-line call at its source (the same pattern as `addFloat`). **17 sounds:** the 3 GDD-mandated (`pop` soap-hit, `alarm` Scanner klaxon, `detonate` Dustbin blast) plus game-feel additions — `shoot`, `terminalHit`/`terminalDie`, `enemyDie`, `hurt` (all 3 Dan-damage paths), `enemyFire` (all 4 ranged kinds), `deploy`, `powerup`, `heal`, `rescue` (**pitch climbs with `G.rescued`**), `workerLost`, `noWorkers` (last worker gone), `levelClear`, `gameOver`. AudioContext is lazily created and **resumed on the first user gesture** (`unlock()` from `input.js` keydown/mousedown/touchstart — browser autoplay policy). **`M` toggles mute.** A small per-sound throttle (`shoot`/`pop`/`enemyFire`/`hurt`) prevents clipping when many fire in one frame. Master gain + startup-enabled in `CFG.AUDIO`.
- **Level system:** procedural warehouse, camera, EXIT door + off-screen pointer, level-clear splash, endless progression. **HP, power-ups, and score persist across levels.**
- **States:** `title` / `playing` / `levelclear` / `dead`.

> Cross-cutting "do not silently change" rules (HP/score persistence, decrement model,
> max-shots formula, bounce, one-type-per-level, global spawn cadence, knockback,
> keyboard mapping) now live in **CLAUDE.md**. The per-subsystem feel decisions below
> stay here, next to the systems they govern.

---

## Subsystem decisions (confirm if changing feel)

### Controls / input (GDD §4.1, §4.3, §4.5–§4.8)

- **One device per run, picked on the title.** `G.inputMode` is `null` on the title,
  then `'keyboard'` or `'gamepad'` — set by `startRun(mode)` in `input.js` (a wrapper
  that calls `newGame()` then assigns the mode). First valid title input wins: SPACE /
  ENTER / click / touch → keyboard; gamepad `BTN_START` (9/0) → gamepad. The opposing
  device is then inert (its getters return zero/null), and the game-over restart keys
  off the active mode. GDD §4.5 rationale: keyboard snaps to 8 dirs, gamepad is 360° —
  mixing mid-run is confusing. *(`newGame()` itself is NOT modified to reset
  `G.inputMode`; the mode is owned entirely by `startRun`, which is the only caller of
  `newGame`. `G.inputMode` starts `null` from `state.js`, and there is no return-to-title
  path, so it's never stale. If a title-return is ever added, null it there.)*
- **Device-agnostic API — no raw key/axis reads in game code.** `input.js` exports
  `getMoveVec()` → normalized `{x,y}` (mag 0/1), `getFireAngle()` → radians or `null`,
  `isDeploySpecial()` → edge-triggered bool. Each branches on `G.inputMode`.
  `player.js`/`dustbin.js` call these; **never bypass `G.inputMode`**. `keys`/`mouse`
  stay exported only for mouse-aim, the `M` mute key, and debug. Removed the old
  `fireKeyStack`/`FIRE_ANGLES`/`keyboardFireAngle`.
- **Diagonals are derived, not bound.** Cardinals live in `CFG.KEYS` (MOVE W/D/S/A,
  FIRE O/P/L/K); a held diagonal is the **vector sum of two adjacent cardinals** (so
  O+P = NE fire, W+D = NE move). Opposing fire keys (O+L) cancel to zero → no fire.
  Remap a cardinal and the diagonals follow automatically — there are no per-diagonal
  keys (the old `i ; , . /` single-key fire grid is gone).
- **Aim vs. fire are separate.** `getFireAngle()` is `null` when not firing. In keyboard
  mode `player.js` still faces Dan at the mouse cursor every frame (cursor tracking
  always on); in gamepad mode Dan **holds his last fire heading** when the right stick
  is centered (GDD §11). `wantFire = getFireAngle() !== null`.
- **Gamepad is polled, not event-driven.** `pollGamepad()` (in `input.js`) runs at the
  top of `update()` **every frame in every state** (events are unreliable across
  browsers; title/dead need it to start/restart). It caches `navigator.getGamepads()[0]`
  for the getters and edge-detects `BTN_START`. Left stick = axes 0/1, right = 2/3;
  any push past `moveDeadzone`/`fireDeadzone` (0.2) acts at full magnitude (movement is
  not pressure-sensitive, GDD §4.6). Special = any `BTN_SPECIAL` (4–7, bumpers/triggers).
- **`isDeploySpecial()` owns the deploy edge-trigger** (moved out of `dustbin.js`'s old
  `deployHeld`). It tracks one `prevDeploy` bool and **must be called exactly once per
  frame** — it is, as the first term of `updateDustbin`'s deploy `if` (short-circuit
  keeps it always-evaluated). Throw direction now comes from `getMoveVec()` (left stick
  or WASD), so a moving deploy throws and a centered one drops in place, in either mode.
- **Title shows both modes; the fire legend matches.** `screens.js` renders "SPACE —
  KEYBOARD" / "A / START — GAMEPAD" and a 3×3 legend with O/P/L/K cardinals + the four
  two-key diagonal combos (empty center). Game-over prompt is mode-keyed; level-clear
  auto-advances (no prompt). Pure math is unit-tested in `test-input.js` (`node
  test-input.js`); full gamepad/loop integration needs a browser.

### Ranged system (Security / `ebolts`)

- **Shared i-frame window:** enemy bolts use the SAME `CFG.DAN_IFRAME` window as melee, so a Forklift charge and a taser bolt landing the same instant can't double-dip. (Alt: per-bolt independent invuln.)
- **Security contact damage = 1** (`dmgContact`). GDD lists no melee value for Security; this is a light "don't mop a live taser" zap. Set to 0 for a pure-ranged unit. Dan still mops it + gets knocked back on contact regardless.
- **Bolt absorbed during i-frames:** a bolt overlapping Dan while he's already invulnerable is removed (counts as a blocked hit) rather than passing through to land later.
- **Bolts die on walls** (`kind:"bolt"` sets `stopsOnWall`). Only matters when Dan ducks behind a shelf mid-flight — the intended dodge. Drone bombs set this false to ignore walls.
- **Soap shots and enemy bolts ignore each other** — you can't currently shoot a bolt down.
- **Enemy bolts cause friendly fire** (GDD §9). A Security `bolt` that overlaps a ground robot deals its Dan damage (`b.dmg` = `boltDmg` 2) and is consumed; the robot dies through a **no-score** path (`damageEnemy` → `killEnemy(i, {score:false})` in `combat.js`). Fliers (`e.flying` drones) and still-spawning bots are skipped; terminals live in `G.terminals` so they're never tested. Dan collision is unchanged (still the very next check). Other ranged kinds (`arc`/`drop`/`cone`) are unaffected — only the straight `bolt` and the `homing` missile friendly-fire (the latter via blast, see Manager). (Alt: bolts pass harmlessly through robots — rejected; §9 wants the chaos.)

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
- **Slow = movement only** (`SLOW_FACTOR` **0.35** — a heavy ~65% slow); fire rate unaffected. `sprayRange` 108 / ~60° cone / `slowDur` **1.1 s** are the feel dials. `SLOW_FACTOR` is consumed only at `player.js` (gated on `dan.slow > 0`), and `dan.slow` is set only by the Cleaner spray, so the heavier slow stays contained to the Cleaner. ⚠ **Compounds with the Manager missile** (now a speed-ramp, change #6): a Dan slowed to ~0.35× (~65 px/s) can't outrun even the base 90 px/s missile, let alone its 210 cap, so once both land, walls are the only counterplay while slowed — intended, but only co-occurs on the `"mixed"` sandbox (single-type L5/L7 never pair a Cleaner with a Manager).

### Drone (L6)

- **Flies over walls; no LOS gate on bombs.** This is the Drone's whole identity (distinct from Security, which needs LOS, and Sorter, which lobs over walls but only from cover). Cover is no defense — the only counterplay is moving out from under it. (Alt: gate drops by LOS — would erase the "can't hide" identity.)
- **Soap shots CAN hit it** (GDD dodgeable=Yes, HP 2). Simplest + readable. (Alt: fliers immune to ground fire — would need an anti-air mechanic; flagged, not built.)
- **Body-anchored hitbox.** e.x,e.y is the body you see and shoot; the cast ground-shadow is drawn below it (offset altitude) purely as an elevation cue.
- **No contact damage, still mop-able** (meleeContact 0-dmg guard). It orbits at standoff so contact is rare anyway.
- **Three-phase predatory orbit replaces the old "hover above Dan" behavior.** STALK: drone orbits Dan at stalkRadius (180 px), circling CW or CCW (e.orbitDir ±1, assigned at spawn; alternating across drones so multiple drones cross paths — harder to dodge simultaneously). No bombs during this phase; duration randomised per cycle (stalkMinT–stalkMaxT, suggested 1.5–3.0 s). COMMIT: drone breaks orbit and climbs toward dan.y - hoverAbove; if Dan moves so |drone.x - dan.x| > abortDist (200 px) before alignment, drone aborts back to STALK — mobility is the counterplay. DROP: once at/above Dan and within dropAlignX (80 px), fires fireEnemyDrop (existing reticle + growing shadow system), then re-enters STALK with a fresh randomised duration and optional direction flip.
- **drop still falls down the drone's OWN column** (tx = drone.x, ty = Dan's row); bomb scales ~2x→1x on descent (fake perspective). Feel dials: stalkRadius 180 / stalkMinT 1.5 / stalkMaxT 3.0 / abortDist 200 / hoverAbove 220 / dropAlignX 80 / dropCd 1.7 / dropDur 0.9 (dodge window) / dropBlast 36 / dropDmg 2 / max 4.
- **e.flying flag** is set so the future Atomic Dustbin attract phase (GDD §5.2) can pull drones, and so other systems can branch on fliers later.

### Manager (L7)

- **Missile spools up — outrun it early, corner it late.** Each missile carries a per-instance `speed` that starts at `missileSpeed` 90 and accelerates by `missileAccel` 70 px/s² toward `missileSpeedMax` 210 (the ramp lives in `updateHoming`, applied before steering; `traveled` accumulates at the current speed so range still measures real distance). Since 210 > Dan's 185, a straight outrun only works while it's spooling up (~1.7 s to reach Dan's speed, ~1.9 s to cap) — after that the counterplay is the same as always: `missileTurnRate` 1.4 rad/s is capped, so sharp corners into shelving lure it into a wall-AoE. Tune `missileAccel`/`missileSpeedMax` for how long the outrun window stays open; `missileTurnRate` for how hard it corners. ⚠ Compounds with **Cleaner slow** (change #3): a Dan slowed to ~0.35× ≈ 65 px/s can't outrun even the *base* 90 missile, so once both land, walls are the only counterplay while slowed — intended, but a known spike if a Cleaner and Manager are both alive (only co-occurs on the `"mixed"` sandbox; single-type L7 has no Cleaner).
- **Detonates on walls AND on ground robots — `missileBlast` AoE either way (friendly fire, GDD §9).** A shared `detonateHoming(b)` helper runs whether the missile hits a wall tile or overlaps a non-flying, non-spawning robot: it pushes the blast mark, damages every ground robot within `missileBlast` 24 px (no-score, via `damageEnemy`), and damages Dan if he's in the blast and unguarded (`hitDanArea`). So luring the missile into a clustered mob — by wall OR by a robot body — now wipes nearby bots too, not just Dan. Fliers (drones) are immune. (Alt: only damage the single robot it touched — rejected; an explosion should be radial and consistent with the wall blast. Alt: ricochet — rejected.)
- **Berserk refresh = max of existing vs new.** Two Managers dying near the same robot refresh the timer to whichever is longer (`Math.max(existing, berserDur)`), not stacked.
- **L7 is a mixed-type level.** Manager terminals + 2 hardcoded Picker terminals + 3 preplaced Pickers. The spawn loop iterates all terminal types present (multi-type support generalized — any future mixed level works without further changes). Picker `max` (22) and Manager `interval` (8 s) govern their cadences.
- **Score float on most enemy kills, but friendly-fire kills are silent on score.** `killEnemy(index, {score=true})` awards points + the amber float by default; callers that omit the option (Dan's mop/shots, the Dustbin blast) keep scoring. The no-score path `killEnemy(i, {score:false})` (used by `damageEnemy` for bolt/missile robot-on-robot kills) **skips points + float** but still plays `enemyDie` and runs a caught Manager's berserk pulse — so robots killing each other gives Dan FX/chaos but no free points (GDD §9).
- **Manager contact damage = 0.** Pure ranged unit. Even berserk, no melee. The berserk dmg bonus only applies to enemies with `dmg > 0` (Pickers, Forklifts, Security).

### Scanner (L8)

- **Indirect threat via continuous area buff.** No contact/ranged damage (`dmgContact:0`); the danger is what it does to *other* robots. While it has LOS to Dan it refreshes a short `e.alarmed` timer (`alarmHold` 0.25 s) on every robot within `alarmRadius` (300 px) each frame. `buffSpd(e)` reads it for a speed mult (`alarmSpeedMult` 1.4) and the melee block adds `alarmDmgBonus` (+1). (Alt: a one-shot pulse like the Manager — rejected; the Scanner's identity is a *sustained* field you escape or silence.)
- **Continuous, not one-shot — and it stacks with berserk.** `buffSpd` now multiplies *both* `e.berserk` (Manager) and `e.alarmed` (Scanner). Refreshing a short timer each frame (rather than setting a long one) means the buff **lapses ~0.25 s after the Scanner dies or the robot leaves range** — so "kill the Scanner to stop it" works without special-casing death. The alarm *itself* lingers `alarmGrace` (0.8 s) after LOS breaks so it doesn't strobe through doorways.
- **Patrols like the Cleaner.** Reuses `buildCleanerPatrol`/`advancePatrol` (fixed route at spawn) — GDD says "patrols," and this is the existing route system. Oblivious-to-Dan movement; only the alarm reacts to LOS. (Alt: roam/chase — rejected, support units shouldn't pursue.)
- **L8 is a mixed-type level.** Scanner + 2 Picker terminals + 3 preplaced Pickers (same seeding as the Manager level) so the alarm has a cluster to amplify. Pure-Scanner levels would be toothless.
- **No contact damage.** Added `scanner` to the zero-dmg melee list; like the Manager, its buff bonus only lands on enemies that already deal melee (`dmg > 0`). Still mop-able (HP 2 — dies to one mop hit + a soap shot, or two shots).
- Feel dials: `sight` 340 / `alarmRadius` 300 / `alarmGrace` 0.8 / `alarmHold` 0.25 / `alarmSpeedMult` 1.4 / `alarmDmgBonus` 1 / `speed` 60 / `max` 4 / `interval` 3 s.

### Vending machines (GDD 2.5)

- **Won't deplete at full HP.** GDD reads "on contact … then depleted," but a contact-only trigger means brushing a machine at 20/20 would waste it. Chosen resolution: the trigger is gated on `dan.hp < dan.maxHp`, so a full-health Dan walks past harmlessly and the machine stays usable. (Alt: literal GDD — deplete on any contact regardless of HP.)
- **Float shows ACTUAL HP gained, not the variant rating.** GDD suggests a "+5"/"+10" float; we show the real amount after the maxHp cap (e.g. a small machine at 18/20 floats "+2"). Truthful feedback over the nominal value; the cap is a real mechanic. (Alt: always show the rating.)
- **No collision; contact = circle overlap** (`m.r` 15 + Dan's radius). Machines are flush against walls so they never block corridors, and Dan reaches them from the open side — no need to make them solid. Robots never test against them at all.
- **Placement is wall-adjacent, not corridor-aware.** `randomFloorTileNearWall` guarantees a wall on at least one side (so "flush" reads), and `minDistFromCenter` (4) keeps them off Dan's spawn pocket — but it does NOT yet check that the machine leaves the corridor passable in the strict §8.1 sense. Fine for the test layout; real weighted/guaranteed placement is §8.1.
- Feel/looks dials: `r` 15 / small `heal` 5 `breadth` 22 `depth` 16 / large `heal` 10 `breadth` 28 `depth` 20 / `testPlacement` ["small","large"].

### Atomic Dustbin special (GDD §5)

- **"Pulled toward it AND cannot fire" is ONE mechanic, not two.** During the attract phase `vortexHold(e, dt)` is checked at the top of `updateEnemies` (after buff decay, before the per-type dispatch): a robot within `attractRadius` is pulled toward the vortex and the loop `continue`s, **skipping its entire AI tick** — so it can't self-move, fire, or melee Dan while caught. This avoids threading a "suppress fire" flag through every enemy's fire logic (Security/Sorter/Drone/Manager/Cleaner). (Alt: per-enemy `noFire` flag + guards in each fire path — more invasive, easy to miss a type.)
- **The pull respects walls for ground bots, ignores them for fliers.** Grounded robots are moved via `moveBody` (they slide along shelves toward the vortex — reads naturally); `e.flying` drones move freely (consistent with their no-wall identity). `pullSpeed` 150 over 2.5 s drags edge-of-radius bots (260) well inside the blast (200), so the attract reliably feeds the detonation.
- **Detonation routes through `killEnemy`** so robots award their **normal points** (GDD §5.3) with the usual score float — and a Manager caught in the blast still emits its on-death berserk pulse (harmless, everything near it is also being detonated). `blastDmg` 99 one-shots any current type ("destroys", not "heavily damages" — simpler + more satisfying than partial damage; tune down for survivors).
- **Dan is immune to his own blast.** GDD doesn't specify; making it a pure panic-button/crowd-control tool (no self-damage) matches the "panic button" framing. (Alt: self-damage if standing in the blast — would punish the panic use it's designed for.)
- **Throw vs. drop is read from movement input, not Dan's velocity.** In keyboard mode: holding a WASD direction at deploy throws along it; no keys = drop in place. In gamepad mode: left stick direction at deploy is the throw direction; stick centered = drop in place. Knockback velocity is ignored so a knocked-back Dan still "drops" rather than flinging the bin. Slide uses the same per-axis wall-bounce as bounce-shots; bouncing off a far wall to settle in a mob's centre is the GDD §5.4 "advanced play". (Previously: "holding a WASD direction at deploy throws" — now abstracted through `getMoveVec()`.)
- **Carry persists across levels, the deployed bin does not.** `G.dan.hasDustbin` is only reset by `newGame` (like HP/power-ups/score); `buildLevel` nulls any in-flight `G.dustbin` and reseeds the floor pickup. **Floor placement is rare:** guaranteed on L1 (so a fresh run can always find/learn the special), then `spawnChance` 0.5 per level — the L1 guarantee is testing scaffolding to dial down with §8.1.
- **One active at a time.** Deploy is gated on `!G.dustbin`, and Dan holds at most one (`hasDustbin` collection guard), so there's never more than a single vortex/blast in flight.
- Feel dials: `r` 14 / `throwSpeed` 300 / `friction` 2.2 / `stopSpeed` 30 / `bounce` 0.7 / `attractDur` 2.5 / `attractRadius` 260 / `pullSpeed` 150 / `blastRadius` 200 / `blastDmg` 99 / `spawnChance` 0.5.

### Human workers & rescue (GDD 7)

- **Rescuing all 5 does NOT auto-complete the level** (GDD §8.2 left this TBD). The exit door stays the only level-end trigger; the escalating per-rescue points (100/200/400/800/1600 = 3,100) *are* the "full clear bonus", and the 5th rescue fires a celebratory callout. Rationale: keeps a single level-end path and doesn't strand a player who's cleared the rescue objective but still wants to fight/collect. (Alt: auto-advance on the 5th rescue, or award a separate lump bonus on top — both easy to add later.)
- **Escalating value via `rescueBase·2^G.rescued`** (`G.rescued` = rescues *this level*, reset in `buildLevel`). One counter drives both the points and the HUD; the doubling is data (`CFG.WORKER.rescueBase` 100), not hardcoded per-step.
- **Workers can't die yet.** Only the Inventory Bot (§6.1.6, unbuilt) kills workers; `updateWorkers` has no death path, so for now a worker only leaves the level by rescue. The Inventory Bot will add a kill→`G.workers.splice` (no points, gone for the level) without touching rescue.
- **Avoidance is reactive, not pathfound.** A worker flees directly away from the single nearest robot inside `avoidRadius` (130 px) at `fleeSpeed`; otherwise it wanders (re-pick heading every `wanderMin..wanderMax` s) at `speed`. `moveBody` slides it along shelves; a fully-boxed step turns the heading. Good enough for "wander, avoid robots" flavor — no flow field. (Alt: steer from all nearby robots / flee toward open space.)
- **Seek-Dan on LOS** (GDD §7.1): when a worker is NOT fleeing a robot and `hasLineOfSight(w, dan)` is clear, it steers straight at Dan at `seekSpeed` (**60** — between idle `speed` 44 and `fleeSpeed` 92) to make rescue easier. Strict priority in `updateWorkers`: **flee a nearby robot > seek Dan on LOS > wander** — a robot inside `avoidRadius` always wins, so a worker never walks toward Dan through danger. LOS uses the same `hasLineOfSight` raymarch as enemy targeting, so shelves break the seek and the worker falls back to wandering. (Alt: steer toward Dan even without LOS — rejected; LOS keeps it readable and matches the GDD.)
- Feel dials: `count` 5 / `speed` 44 / `seekSpeed` 60 / `fleeSpeed` 92 / `avoidRadius` 130 / `wander` 0.7–2.0 s / `rescueBase` 100.

### Inventory Bot (L9)

- **Worker kill is centralized in `workers.js`.** `updateInventory` calls the exported `killWorker(w)` (red callout, splice, **no points / no rescue credit**) — the same module that owns `rescueWorker`, so "a worker leaves the level" lives in one place. The bot is the *only* caller; nothing else can kill a worker.
- **Hunt acquisition = proximity OR timer.** Snaps to HUNT when the nearest worker is within `proxAcquire` (150 px), or every `huntPeriod` (6 s) regardless — so it still goes looking even when no worker is close. Loses its target (rescued by Dan or already killed) → re-locks the nearest remaining, or falls back to WANDER if none. (Alt: always-hunt — rejected; the oblivious wander is half the GDD identity and gives Dan breathing room.)
- **No workers left → turns on Dan** (GDD §6.1.6). When `G.workers.length === 0` the bot pursues Dan directly at `huntDanSpeed` (**105**), dealing its usual 1-HP melee via the shared contact block. Checked at the very top of `updateInventory` every tick, so it pivots the instant the last human is gone (and stays on Dan — workers can't reappear mid-level; a rebuild reseeds enemies too). Reuses the existing **"hunt" mode** with `e.target = G.dan`, so the eye goes hot-red and faces Dan (`drawInventory` keys off `mode === "hunt" && target`). `huntDanSpeed` 105 > worker `huntSpeed` 96 (it's now the aggressor) but well under Dan's 185 — outrunnable; punishes cornering / standing still. (Alt: keep wandering with no workers — rejected; an idle worker-hunter with nothing to hunt is dead weight, and §6.1.6 wants it menacing.)
- **`huntSpeed` (96) just edges worker `fleeSpeed` (92).** Workers flee it (it's a robot inside their `avoidRadius`), so on open ground it barely gains — the kills come from **cornering** against shelves. "Slow but relentless." Tune `huntSpeed` up to make it scarier, down to make workers more survivable.
- **Melee = 1 HP to Dan** (`dmgContact`, explicit branch in the melee block; takes the berserk/alarm bonus like other melee units). HP 1 — trivially killed, but you have to *notice* it peeling off toward a worker.

### Mixed sandbox level ("mixed", L10+)

- **A pseudo-type, not an enemy.** `levelType()` returns `"mixed"`; `ENEMY["mixed"]` deliberately does **not** exist. The two generic code paths that index `ENEMY[type]` are special-cased: `buildLevel` branches to seed one terminal of every real type, and `update.js` uses `CFG.MIXED_INTERVAL` for the spawn cadence. `spawnEnemy`/`spawnWave` are only ever called with real types (the terminals' own types), so no other code needs to know about `"mixed"`. (Alt: add a synthetic `ENEMY.mixed` entry — rejected; polluting the stat table with a non-enemy invites `updateX`/`drawX` lookups that don't exist.)
- **Reuses the generalized multi-type spawn loop** (built for the Manager/Scanner mixed levels): each global tick emits one of every terminal type present, each capped by its own `max`. The sandbox is just "every terminal type at once."
- **Endless tail.** It's the last `LEVEL_PLAN` entry, so all levels ≥ L10 are mixed — the game's endless mode becomes the all-types arena. Inventory bots + workers make the rescue/hunt subplot run there too.

### Audio (GDD §10)

- **Live synthesis, no assets.** Every SFX is built per call from oscillators + filtered noise + gain envelopes (`tone`/`noise`/`sequence` helpers in `audio.js`). No sample files — keeps the single-file/ES-module constraint and makes sounds tunable as code. Nodes are fire-and-forget (`stop()` + `onended` disconnect); no pooling.
- **`audio.js` is a leaf, called like `addFloat`.** It imports only `CFG` (no game state), so wiring is a one-line `sfx.x()` at each event's source module — no central event bus. This mirrors how `effects.js` is used and avoids threading audio through `update.js`. (Alt: an event queue drained each frame — more indirection for no benefit at this scale.)
- **Sounds fire at the state change, not in the renderer.** Kept out of `render*.js` so they trigger once per event (e.g. `killEnemy`, not per-frame while a death animation plays). Scanner `alarm` is **edge-triggered** (`alarming && !wasAlarming`) so it sounds once when LOS opens, not every frame it holds. `shoot` fires in `fireVolley` (once per trigger), **not** per pellet, so a Triple shot is one bloop.
- **Damage = one `hurt` for all three paths.** `meleeContact` / `hitDanRanged` / `hitDanArea` each call `sfx.hurt()`; the i-frame guard in `meleeContact` means a blocked touch is silent, matching the no-damage behavior. `enemyFire` covers all four ranged `kind`s with one zap (per-kind variants deferred — flagged, not built).
- **Escalating rescue pitch.** `sfx.rescue(G.rescued)` is called *before* `G.rescued++`, so the 0-based step (0→4) raises the pitch with each of the 5 rescues — an audio analogue of the doubling score (capped at step 5 in `audio.js`).
- **Autoplay policy.** AudioContext starts suspended; `unlock()` (resume) is called from the first keydown/mousedown/touchstart in `input.js`. The context is also lazily created on the first `sfx.*` call, so a sound fired before any gesture simply no-ops until unlocked rather than throwing.
- **Throttling, not voice-capping.** A min-interval per noisy sound (`shoot` 0.05 / `pop` 0.04 / `enemyFire` 0.05 / `hurt` 0.12 s) drops duplicates fired the same frame (e.g. a Triple volley popping 3 enemies). Cheaper than counting concurrent voices; one-shot jingles aren't throttled.
- **`workerLost` is a dramatic, prominent death sting** (GDD §10): a low-pass noise **thud** the instant the worker drops, an alarming **two-tone descending sawtooth klaxon** (330→120 then 247→90 Hz), and a sustained **low sine sub-boom** (130→48 Hz, ~0.85 s tail) underneath — deliberately longer, lower, and louder than the generic `hurt`/`pop` so a worker loss reads unmistakably. It is **deliberately kept out of `THROTTLE`** (it's a rare, important one-shot), so it always plays in full and never gets clipped by rapid combat sounds. (Replaced the old short sine down-tone.)
- **Mute = `M` key** (`input.js`), toggling `master.gain` between `CFG.AUDIO.master` (0.35) and 0. `CFG.AUDIO.enabled` is the startup state.
- **`noWorkers` fires when the LAST worker leaves the level** — a hollow descending sine motif over a low drone (GDD §7, §10), distinct from the bright `rescue` blip, the dramatic `workerLost` sting, and the sawtooth `gameOver`. Wired into **both** `workers.js` removal paths (`rescueWorker` and `killWorker`) right after the `splice`, guarded by `G.workers.length === 0`. That check is **inherently once-per-depletion** (you can't splice from an empty array, and `rescueWorker`/`killWorker` are the only removers) and **never fires on level rebuild** (`buildLevel` reseeds 5 workers without going through either remover). On the 5th rescue it co-occurs with `sfx.rescue` and the visual "ALL 5 SAVED!" float — intended; they're distinct cues. Not throttled.
- **Divergence from GDD §10:** the GDD specifies only the 3 SFX above; the other 14 are additions for game feel (approved). Nothing in §10 was contradicted — only extended. A sustained vortex-hum during the Dustbin attract phase was considered and **deferred** (needs a managed looping voice tied to the state machine); the one-shot `deploy` whoosh ships instead.

---

## Architecture map (where things live)

> The game is now **ES modules** under `src/`, loaded by `atomic-dustbin-dan.html`
> (which only imports and runs the delta-timed loop). Run it from a static server
> (e.g. `python3 -m http.server`) — `file://` blocks module loads. All mutable
> run/level state lives on the single `G` object in `state.js`; modules read &
> mutate `G.dan`, `G.shots`, … (ES modules can't reassign an imported binding, so
> whole-value resets like `G.shots = []` happen in `level.js`).

**Module layout** (leaf-first; arrows = imports):

- **`config.js`** — `CFG` (incl. `CFG.KEYS` cardinal assignments + `CFG.GAMEPAD` deadzones/button indices), `ENEMY` (per-type stat table + ranged stats), `POWERUPS`/`POWERUP_KEYS`, `LEVEL_PLAN`. Pure data. *No imports.*
- **`palette.js`** — `COL`, `TERMINAL_TINT`. *No imports.*
- **`canvas.js`** — `canvas`, `ctx`, `VIEW_W/H`. *No imports.*
- **`audio.js`** — Web Audio SFX (GDD §10): the `sfx.*` sound library + `tone`/`noise`/`sequence` synth helpers, lazy AudioContext + `master` gain, `unlock`/`toggleMute`/`isMuted`, per-sound throttle. ← config (`CFG.AUDIO`) only. Called for its side-effects from player/combat/projectiles/enemies/dustbin/level/vending/workers/update; `unlock`+`toggleMute` from input.
- **`state.js`** — `G` (the mutable container: run meta + entities `dan/shots/enemies/terminals/pickups/marks/floats/ebolts/vending/dustbin/dustbinPickups/workers/camera/exit` + `spawnTimer`/`pickupTimer` + `inputMode`) and `levelType()`. ← config.
- **`world.js`** — `map[][]` (exported `let`, reassigned only here), `isWall`/`isBorderTile`/`generateWarehouse`/`randomFloorTile`/`randomFloorTileNearWall` (wall-adjacent tile for flush placement)/`hasLineOfSight`/`destroyShelf`, collision `bodyHitsWall`/`moveBody`, tile helpers `tileFloor`/`tileCenter`/`tileClearRun`/`rectPerimeterClear`, `clamp`. ← config, canvas, state.
- **`effects.js`** — `addFloat`, `updateEffects` (marks + floats lifetimes). ← state.
- **`combat.js`** — shared damage/death: `hitDanRanged`/`hitDanArea` (i-frame + knockback), `meleeContact` (0-dmg-safe; `berserDmgBonus` when berserk), `damageEnemy` (friendly-fire damage → no-score kill), `killEnemy(index, {score})` (points + score float unless `score:false`; Manager berserk pulse either way), `destroyTerminal`. ← config, palette, state, effects.
- **`projectiles.js`** — the `G.ebolts` pool: `fireEnemyBolt/Arc/Drop/Homing` + `updateEbolts` dispatching by `kind` (`bolt`/`arc`/`drop`/`homing`; `updateArc/Drop/Homing` helpers, `detonateHoming` blast). `bolt`/`homing` also friendly-fire ground robots (skip fliers/terminals) via `damageEnemy`. ← config, state, world, combat.
- **`enemies.js`** — `spawnEnemy` (per-type init), `updateEnemies` (dispatch + melee contact via `combat`), per-type AI `updatePicker/Forklift/Security/Sorter/Cleaner/Drone/Manager/Scanner/Inventory`, `buffSpd` (combined Manager-berserk + Scanner-alarm speed mult), Cleaner/Scanner patrol routing (`nearestWaypoint`/`buildCleanerPatrol`/`advancePatrol`) + Cleaner spray helpers (`danInSprayCone`/`coneRayDist`(exported, also clips the rendered cone)/`applySpray`). ← config, state, world, combat, projectiles, **workers** (`killWorker`, for the Inventory Bot), **dustbin** (`vortexHold`, for the attract phase).
- **`level.js`** — `newGame` (full reset) → `buildLevel` (world + terminals + exit + 5 workers + vending machines + dustbin pickup; single-type, or the `"mixed"` branch seeding one terminal of every real type; keeps HP/powerups/score/carried-dustbin) → `nextLevel`; spawner-terminal emission `spawnFromTerminal`/`spawnWave`; pickups `spawnPickup`/`updatePickups`. ← config, state, world, enemies, vending, dustbin, effects.
- **`vending.js`** — `placeVendingMachines` (per-level flush-against-wall placement) + `updateVending` (contact trigger, maxHp-capped heal, single-use depletion). ← config, state, world (`randomFloorTileNearWall`/`tileCenter`), effects, palette. Called from `level.js` (place) and `update.js` (update); drawn by `render.js`.
- **`dustbin.js`** — the Atomic Dustbin special (GDD §5): `placeDustbins` (rare floor-pickup seeding), `updateDustbin` (collect + deploy E/F + slide→attract→detonate state machine), `vortexHold` (the attract-phase pull, called from `enemies.js`). ← config, state, **input** (`keys`, and after overhaul: `isDeploySpecial`/`getMoveVec`), world, combat (`killEnemy`), effects, palette. Called from `level.js` (place) and `update.js` (update); drawn by `render.js`. NB: `dustbin → input → level → dustbin` is an import cycle, but every cross-module use is inside a function (runtime), so module evaluation is safe.
- **`workers.js`** — `updateWorkers` (wander/avoid + rescue-on-contact), `rescueWorker` (escalating points + counter + callout), and `killWorker` (exported; Inventory Bot's no-points worker kill). ← config, palette, state, world, effects.
- **`input.js`** — device-agnostic input layer. Exports `getMoveVec()`/`getFireAngle()`/`isDeploySpecial()` (route by `G.inputMode`), `pollGamepad()` (called from `update.js`), and the raw `keys`/`mouse` (mouse aim, `M` mute, debug). Registers key/mouse/touch listeners on import (side-effect), unlocks audio on the first gesture, binds `M` = mute, and starts/restarts runs via `startRun(mode)`. ← config, canvas, state, level (`newGame`), audio (`unlock`/`toggleMute`).
- **`player.js`** — `updateDan` (slow move-scaling, decays `slow`/`sprayTick`), `fireVolley`/`fireBubble`, `updateShots` (bubble↔enemy↔terminal). ← config, state, input, world, combat.
- **`update.js`** — `update(dt)` orchestrator: `pollGamepad()` first (every state), then (when playing) Dan → shots → **dustbin** → spawn → enemies → ebolts → pickups → vending → workers → effects → camera + `updateCamera` + spawn/terminal/exit/death bookkeeping. ← state, config, input (`pollGamepad`), player, enemies, projectiles, workers, vending, dustbin, level, effects, world, canvas.
- **`render-entities.js`** — `drawEnemies` (per-type sprites + berserk aura) + `drawEbolts` (bolt/arc/drop/homing). ← canvas, state, config, palette, enemies (`coneRayDist`).
- **`screens.js`** — `drawHUD` + `drawTitle` (both "SPACE — KEYBOARD" / "A / START — GAMEPAD" options + the O/P/L/K `drawFireLegend`) / `drawLevelClear` / `drawGameOver` (continue prompt keyed to `G.inputMode`). ← canvas, state, config, palette.
- **`render.js`** — `render()` compositor + world/entity draws (`drawFloor`/`drawWalls`/`drawMarks` incl. the `"blast"` detonation ring/`drawExit`/`drawExitPointer`/`drawVending`/`drawDustbins`(floor pickups + sliding canister + attract vortex, via `drawDustbinCan`)/`drawTerminals`/`drawShots`/`drawPickups`/`drawWorkers`/`drawFloats`/`drawDan` incl. carried-dustbin cue). ← canvas, state, config, palette, world, render-entities, screens.
- **`atomic-dustbin-dan.html`** — entry: imports `update` + `render` (+ `input` for its listeners) and runs the delta-timed `loop`. Nothing else.

---

## Testing scaffolding to replace with real GDD behavior later

- Power-up pickup respawn (`CFG.PICKUP_RESPAWN` / `MAX_PICKUPS`).
- Atomic Dustbin floor placement is L1-guaranteed + `CFG.DUSTBIN.spawnChance` 0.5 elsewhere (testing reach); real "rare" weighted placement comes with §8.1.
- Terminal counts + per-type `spawners`/`preplace`/`interval`/`max` are test tuning; real difficulty mix (multiple types per level, scaling) comes with GDD §8.3.

---

## Enemy roster — COMPLETE

All 9 GDD enemies (Picker, Forklift, Security, Sorter, Cleaner, Drone, Manager,
Scanner, Inventory) + the Dispatch Terminal are built, plus the `"mixed"` all-types
sandbox. The Atomic Dustbin special (§5) is **DONE** (`dustbin.js`) and the **audio
system (§10) is DONE** (`audio.js`). The **remaining larger GDD features** are the
next valuable work:

- **Full guaranteed-placement procgen (§8.1)** — the current world gen is the test layout; §8.1 wants guaranteed exit/worker/terminal/pickup placement with better shelf structure.
- **Sprite-art polish (§10)** — chunky pixel-art pass; the §10 *audio* half is now built.