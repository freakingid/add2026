/* =========================================================================
   config.js — balance/tuning data tables. Pure data, no behaviour, no imports.
   Everything balance-related lives here so it can be tuned in one place.
   ========================================================================= */

/* ---- Tunable config (everything balance-related lives here) ------------- */
export const CFG = {
  TILE: 32,
  COLS: 40, ROWS: 30,            // LIVE world dims — set by the loader from each level's
                                 // tile grid (loadTileGrid). Initialised to the procgen
                                 // size so anything reading them before the first load is safe.
  GEN_COLS: 40, GEN_ROWS: 30,    // size the procedural generator emits (the loader then
                                 // sets COLS/ROWS from the grid it produces). Kept separate
                                 // so loading a differently-sized authored level can't make
                                 // the next generated level inherit that size.

  // Tile types (GDD §8.1.1). The Level-Definition grid is one char per tile; these
  // flags are the SINGLE source of truth for collision / line-of-sight / destructibility,
  // so new tile types can be added here without touching collision code (world.js reads
  // them via isWall / blocksLOS / isDestructible). Floor is the only non-solid type.
  //   .=floor  #=wall  S=shelf(destructible by Forklift charge)  P=pallet  o=pillar
  TILES: {
    ".": { name:"floor",  solid:false, blocksLOS:false, destructible:false },
    "#": { name:"wall",   solid:true,  blocksLOS:true,  destructible:false },
    "S": { name:"shelf",  solid:true,  blocksLOS:true,  destructible:true  },
    "P": { name:"pallet", solid:true,  blocksLOS:true,  destructible:false },
    "o": { name:"pillar", solid:true,  blocksLOS:true,  destructible:false },
  },
  TILE_FLOOR: ".",               // char a destroyed shelf / carved pocket resets a cell to
  CONVEYOR_SPEED: 60,            // px/s per unit of a strip's `speed` (push is BAKED only — §8.1.4;
                                 // no entity reads the push field yet, that lands next session)

  DAN_RADIUS: 12,
  DAN_SPEED: 185,               // px/sec
  DAN_HP: 20,
  DAN_IFRAME: 0.45,             // sec invulnerable after a melee hit
  KNOCKBACK_SPEED: 520,         // initial knockback velocity
  KNOCKBACK_FRICTION: 9,        // higher = stops sooner
  SLOW_FACTOR: 0.35,            // Dan's move speed multiplier while sprayed (Cleaner) — heavy slow

  SHOT_SPEED: 470,
  SHOT_RADIUS: 6,
  SHOT_RANGE: 360,              // px a bubble travels before fizzling
  SHOT_COOLDOWN: 0.16,          // sec between shots (base fire rate)
  SHOT_MAX_ON_SCREEN: 3,        // base cap
  MELEE_DMG_TO_BOT: 2,

  TERMINAL: { hp:4, points:300 },   // Dispatch Terminal — destroyable spawner

  // Controls (GDD §4) — cardinal key assignments + gamepad tuning. ALL key
  // detection routes through these (no hardcoded key strings in logic). Diagonal
  // combos are derived from the cardinals at runtime (two adjacent held), so
  // remapping a cardinal here automatically produces the right diagonals.
  //   MOVE: N=W E=D S=S W=A   FIRE: N=O E=; S=L W=K
  // (Fire East is `;`, not P per GDD §4.3 — deliberate; matches the physical
  //  O / K L ; cluster. Diagonals follow: NE=O+; SE=L+;.)
  KEYS: {
    MOVE: { N:"w", E:"d", S:"s", W:"a" },
    FIRE: { N:"o", E:";", S:"l", W:"k" },
  },
  // Browser Gamepad API standard (XInput) mapping: axes 0/1 = left stick, 2/3 =
  // right stick; buttons 9=Start 0=A, 4=LB 5=RB 6=LT 7=RT. Any push past a
  // deadzone moves/fires at full magnitude (movement isn't pressure-sensitive).
  GAMEPAD: {
    moveDeadzone: 0.2,
    fireDeadzone: 0.2,
    BTN_START:   [9, 0],          // start a run / restart (Start or A)
    BTN_SPECIAL: [4, 5, 6, 7],    // deploy the Atomic Dustbin (any bumper/trigger)
  },

  // Vending machines (GDD 2.5) — static, contact-triggered HP restoration. Sole
  // means of healing mid-run. Two variants; single-use (deplete after one touch),
  // capped at Dan's maxHp. Robots ignore them entirely. `r` = contact radius;
  // breadth/depth size the drawn cabinet (breadth runs PARALLEL to the wall it's
  // flush against, depth perpendicular). Placed by the level loader's vendingSmall
  // (cover zone) / vendingLarge (danger zone) spawn rules (§8.1.3, §2.5).
  VENDING: {
    r: 15,
    small: { heal:5,  breadth:22, depth:16 },   // dim glow, shorter unit
    large: { heal:10, breadth:28, depth:20 },   // brighter glow, taller unit
    minDistFromCenter: 4,                        // fallback wall-spot search keeps off Dan's pocket
  },

  // Atomic Dustbin special (GDD §5) — a rare, glowing-green deployable Dan carries
  // one at a time. Stationary deploy drops it in place; moving deploy THROWS it (it
  // slides with friction and bounces off walls). Once stopped it opens a vortex
  // (attract phase) pulling/holding robots in `attractRadius`, then detonates for a
  // big AoE in `blastRadius`. `blastDmg` is high enough to destroy any current type.
  DUSTBIN: {
    r: 14,                  // pickup + deployed contact/visual radius
    throwSpeed: 300,        // initial slide speed when thrown while moving (px/s)
    friction: 2.2,          // exponential velocity decay rate while sliding
    stopSpeed: 30,          // below this slide speed it settles -> attract begins
    bounce: 0.7,            // fraction of speed kept per wall bounce
    attractDur: 2.5,        // attract-phase length (GDD §5.2)
    attractRadius: 260,     // robots within this are pulled toward it and can't act
    pullSpeed: 150,         // how fast caught robots are sucked toward the vortex
    blastRadius: 200,       // detonation AoE (also large; destroys most nearby bots)
    blastDmg: 99,           // heavy enough to destroy any current robot type
    spawnChance: 0.5,       // odds of a dustbin pickup per level (L1 always seeds one)
    pickupMinDist: 6,       // keep the floor pickup off Dan's spawn pocket
  },

  // Power-ups (GDD 3) — shot-count based, fully stackable
  POWERUP_SHOTS: 75,            // enhanced shots granted per pickup
  TRIPLE_SPREAD: 0.22,         // rad between fan projectiles
  RAPID_MULT: 2,               // fire-rate multiplier while Rapid Fire active
  MAX_PICKUPS: 5,              // power-up pickups present in the level at once
  PICKUP_RESPAWN: 6,          // sec between topping the level back up to MAX
  MIXED_INTERVAL: 2.0,        // global spawn cadence on the "mixed" all-types level

  // Human workers (GDD 7) — wander slowly avoiding robots; Dan rescues by contact
  // for escalating points (rescueBase doubles each: 100/200/400/800/1600 = 3100).
  WORKER: {
    count: 5,                  // guaranteed per level (GDD 8.1)
    radius: 9,
    speed: 44,                 // slow idle wander
    fleeSpeed: 92,             // quicker scurry while avoiding a robot
    seekSpeed: 60,             // moves toward Dan on LOS when not fleeing (GDD 7.1)
    avoidRadius: 130,          // starts fleeing a robot within this range
    wanderMin: 0.7, wanderMax: 2.0,   // re-pick wander heading every [min,max] sec
    rescueBase: 100,           // 1st rescue value; doubles per rescue (GDD 7.2)
  },

  // Audio (GDD §10) — retro arcade SFX synthesized live via Web Audio (no assets,
  // single-file constraint holds). `master` is the global gain into the output;
  // `enabled` is the startup mute state (toggle live with the M key). Per-sound
  // envelopes/pitches live in audio.js (code, not balance data).
  AUDIO: {
    enabled: true,
    master: 0.35,              // global output gain (keeps the layered synth tame)
  },
};

// Power-up pickup definitions (color + glyph for the badge + HUD)
export const POWERUPS = {
  rapid:  { label:"RAPID",  glyph:"R", color:"#5fd2ff" },
  triple: { label:"TRIPLE", glyph:"3", color:"#ffb627" },
  bounce: { label:"BOUNCE", glyph:"B", color:"#b06bff" },
};
export const POWERUP_KEYS = Object.keys(POWERUPS);

/* ---- Enemy roster (GDD 6) ------------------------------------------------
   One unified table. Every type now emits from destroyable spawner-terminals
   (the "Dispatch Terminal" generalized to all enemies). Per-type tuning:
     spawners = base # of terminals on that type's level (scales with level)
     preplace = how many to emit from terminals at level start
     interval = global spawn cadence; max = per-type cap on screen
   New enemy types get added here and to LEVEL_PLAN below. */
export const ENEMY = {
  picker: {
    hp:1, speed:108, radius:11, points:50, dmg:1,
    spawners:3, max:22, interval:1.6, preplace:0,
  },
  forklift: {
    hp:5, speed:52, radius:16, points:200,
    dmgCharge:4, dmgContact:2,               // GDD 6: 4 on charge, 2 on contact
    sight:230, windup:0.45, chargeSpeed:330, maxCharge:340, recover:0.7,
    spawners:2, max:5, interval:3.4, preplace:3,
  },
  security: {
    hp:3, speed:142, radius:12, points:200,  // GDD 6: fast ranged pursuer
    dmgContact:1,                            // light zap if Dan mops into it (not in GDD; see STATUS)
    sight:360,                               // range at which it acquires Dan for LOS
    fireRange:330,                           // won't fire from further than this
    fireCd:0.85,                             // sec between bolts ("fast rate")
    firstFireMin:0.35,                       // grace before a freshly-spawned bot can fire
    windup:0.16,                             // brief telegraph; aim is latched at windup start
    // --- bolt (first user of the shared enemy-projectile system) ---
    boltSpeed:330, boltDmg:2, boltRadius:5, boltRange:430,
    spawners:2, max:6, interval:2.6, preplace:3,
  },
  sorter: {
    hp:2, speed:70, radius:12, points:100,   // GDD 6: cowardly lob attacker
    // "Always knows Dan." LOS flips mood: in cover -> advance+lob; exposed -> flee.
    fleeSpeed:168,                           // panicked scamper (much faster than advance)
    fleeJitter:2.6,                          // rad/s wander while fleeing (erratic)
    losCheckEvery:0.12,
    fireCd:1.8, firstFireMin:0.6,            // lob cadence (only while in cover)
    fireRange:140,                           // max lob distance; closes in first if farther
    // --- arc (second projectile kind: lobs OVER walls, time-based landing) ---
    arcDur:1.15,                             // flight time start->impact
    arcDmg:1, arcBlast:30,                   // impact radius around the landing point
    spawners:2, max:6, interval:2.4, preplace:3,
  },
  cleaner: {
    hp:2, speed:50, radius:13, points:100,   // GDD 6: debuffer / slow hazard
    // Patrols a FIXED route (a back-and-forth line down an aisle, or a small
    // rectangular loop) chosen at spawn and kept for life, spraying a short cone
    // AHEAD of its heading. Oblivious to Dan by default; flip aimAtDan to turn
    // toward Dan before spraying.
    aimAtDan:false,
    arriveDist:9,                            // how close counts as "reached waypoint"
    wpTimeout:5,                             // s before giving up on a stuck waypoint
    lineMinTiles:3,                          // shortest acceptable straight patrol run
    rectChance:0.35,                         // odds of trying a rectangular loop vs a line
    sprayGap:1.4, sprayWindup:0.35, sprayDur:1.6,   // off -> telegraph -> on cycle
    sprayRange:108, sprayHalfAngle:0.52,     // short ~60°-wide cone
    sprayMinClear:0.4,                       // only spray if >=40% of range is open ahead
    sprayDmg:1, tickEvery:0.6,               // 1 HP per tick while inside (GDD)
    slowDur:1.1,                             // movement-slow refreshed while inside
    spawners:2, max:6, interval:2.6, preplace:3,
  },
  drone: {
    hp:2, speed:122, radius:12, points:150,  // GDD 6: aerial bomber, ignores walls
    // FLYING: free mover (no moveBody/walls), staying inside the outer border.
    // Three-phase predatory orbit (see STATUS "Drone"): STALK (circle Dan at
    // stalkRadius, no bombs) -> COMMIT (climb to a hover spot above Dan's column;
    // abort back to STALK if Dan jukes past abortDist) -> DROP (package bomb
    // straight down its OWN column onto Dan's row, then re-STALK). Bombs ignore
    // walls / need no LOS — you can't hide, only move out from under it.
    flying:true,
    stalkRadius:180,                         // orbit standoff during STALK
    stalkMinT:1.5, stalkMaxT:3.0,            // randomised STALK duration per cycle
    abortDist:200,                           // |drone.x - Dan.x| that cancels a COMMIT
    hoverAbove:220,                          // vertical standoff ABOVE Dan when committing
    altitude:22,                             // visual elevation (shadow offset below)
    dropCd:1.7, firstFireMin:0.7,
    dropAlignX:80,                           // max |drone.x - Dan.x| to commit a drop
    // --- drop (vertical descent down the drone's OWN column) ---
    dropDur:0.9,                             // descent + telegraph window (dodge time)
    dropMinFall:46,                          // floor on the visual fall distance
    dropDmg:2, dropBlast:36,                 // GDD: 2 HP/hit; AoE around the landing
    baseR:9,                                 // bomb base size (scaled 2x->1x as it falls)
    spawners:2, max:4, interval:2.8, preplace:3,
  },
  manager: {
    hp:6, speed:72, radius:14, points:500,   // GDD 6: rare boss — slow ground pursuer
    dmgContact:0,                            // pure ranged; no contact damage
    sight:380, fireRange:340,
    fireCd:3.5, firstFireMin:1.0, windup:0.4,
    // --- homing missile (new kind; slow-tracking, outrunnable, lures into walls) ---
    missileSpeed:90, missileDmg:3, missileRadius:7,
    missileAccel:70, missileSpeedMax:310,    // spools up from missileSpeed → above Dan's 185, so a straight outrun fails once it winds up
    missileRange:580, missileTurnRate:1.4,   // rad/s max steer; sprint = outrun it (early; corner it before it spools up)
    missileBlast:24,                         // small AoE if it hits a wall or Dan
    // --- on-death berserk pulse ---
    berserRadius:220,                        // how far the pulse reaches from death point
    berserDur:7.0,                           // seconds berserk lasts on nearby robots
    berserSpeedMult:1.7,                     // speed multiplier while berserk
    berserDmgBonus:2,                        // added to melee damage while berserk
    spawners:1, max:2, interval:8.0, preplace:1,
  },
  scanner: {
    hp:2, speed:60, radius:13, points:150,   // GDD 6.1.3: support / alarm emitter
    dmgContact:0,                            // pure support — no direct attack
    // Patrols a FIXED route (reuses the Cleaner's patrol routing). While it has
    // LOS to Dan it broadcasts an ALARM: nearby robots get faster + hit harder
    // (lighter than the Manager's berserk, and CONTINUOUS while in range). The
    // buff is a short per-robot timer refreshed each frame, so it fades almost
    // instantly when the Scanner dies or the robot leaves range — kill it first.
    sight:340,                               // LOS range at which it alarms
    losCheckEvery:0.2,                       // throttled LOS poll
    alarmGrace:0.8,                          // alarm lingers this long after LOS breaks
    alarmRadius:300,                         // buff reaches robots within this radius
    alarmHold:0.25,                          // per-robot buff timer (refreshed each frame in range)
    alarmSpeedMult:1.4,                      // speed mult while alarmed (Manager berserk = 1.7)
    alarmDmgBonus:1,                         // melee dmg added while alarmed (Manager berserk = +2)
    sweepRate:3.2,                           // radar-dish sweep angular speed (visual)
    spawners:2, max:4, interval:3.0, preplace:2,
  },
  inventory: {
    hp:1, speed:50, radius:11, points:75,    // GDD 6.1.6: wanderer / worker-hunter
    dmgContact:1,                            // light melee bump to Dan
    // Dual state: WANDER (oblivious, random roam) <-> HUNT (lock the nearest
    // human worker and pursue relentlessly). The ONLY robot that can KILL a
    // worker (on contact — no points, gone for the level). Slow, but it corners
    // fleeing workers against shelves.
    huntSpeed:96,                            // pursuit speed (just edges worker fleeSpeed 92)
    huntDanSpeed:105,                         // once no workers remain, turns on Dan at this speed (outrunnable; punishes cornering)
    proxAcquire:150,                         // a worker this close snaps it into HUNT
    huntPeriod:6.0,                          // also (re)checks for a hunt target on this timer
    wanderMin:0.8, wanderMax:2.2,            // re-pick wander heading every [min,max] sec
    spawners:2, max:4, interval:3.2, preplace:2,
  },
};

// Which single enemy type populates each test level (one type per level), except
// the trailing "mixed" sandbox which seeds one terminal of EVERY real type.
// Levels beyond the list reuse the last entry ("mixed") — so L10+ stay mixed.
export const LEVEL_PLAN = ["picker", "forklift", "security", "sorter", "cleaner", "drone", "manager", "scanner", "inventory", "mixed"];
