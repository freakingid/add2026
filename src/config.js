/* =========================================================================
   config.js — balance/tuning data tables. Pure data, no behaviour, no imports.
   Everything balance-related lives here so it can be tuned in one place.
   ========================================================================= */

/* ---- Tunable config (everything balance-related lives here) ------------- */
export const CFG = {
  TILE: 32,
  COLS: 40, ROWS: 30,            // world = 1280 x 960

  DAN_RADIUS: 12,
  DAN_SPEED: 185,               // px/sec
  DAN_HP: 20,
  DAN_IFRAME: 0.45,             // sec invulnerable after a melee hit
  KNOCKBACK_SPEED: 520,         // initial knockback velocity
  KNOCKBACK_FRICTION: 9,        // higher = stops sooner
  SLOW_FACTOR: 0.5,             // Dan's move speed multiplier while sprayed (Cleaner)

  SHOT_SPEED: 470,
  SHOT_RADIUS: 6,
  SHOT_RANGE: 360,              // px a bubble travels before fizzling
  SHOT_COOLDOWN: 0.16,          // sec between shots (base fire rate)
  SHOT_MAX_ON_SCREEN: 3,        // base cap
  MELEE_DMG_TO_BOT: 2,

  TERMINAL: { hp:4, points:300 },   // Dispatch Terminal — destroyable spawner

  // Power-ups (GDD 3) — shot-count based, fully stackable
  POWERUP_SHOTS: 75,            // enhanced shots granted per pickup
  TRIPLE_SPREAD: 0.22,         // rad between fan projectiles
  RAPID_MULT: 2,               // fire-rate multiplier while Rapid Fire active
  MAX_PICKUPS: 5,              // power-up pickups present in the level at once
  PICKUP_RESPAWN: 6,          // sec between topping the level back up to MAX
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
    slowDur:0.9,                             // movement-slow refreshed while inside
    spawners:2, max:6, interval:2.6, preplace:3,
  },
  drone: {
    hp:2, speed:122, radius:12, points:150,  // GDD 6: aerial bomber, ignores walls
    // FLYING: free mover (no moveBody/walls). Seeks a hover spot ABOVE Dan and
    // drops a package bomb straight down ITS OWN column (bomb x = drone x). Only
    // commits a drop when it's at/above Dan and roughly lined up over him, so the
    // bomb always falls downward onto him. Bombs ignore walls / need no LOS —
    // you can't hide, only move out from under it.
    flying:true,
    hoverAbove:220,                          // preferred vertical standoff ABOVE Dan
    weaveAmp:70, weaveRate:1.4,              // horizontal sway around Dan's column
    altitude:22,                             // visual elevation (shadow offset below)
    dropRange:300, dropCd:1.7, firstFireMin:0.7,
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
    missileRange:580, missileTurnRate:1.4,   // rad/s max steer; sprint = outrun it
    missileBlast:24,                         // small AoE if it hits a wall or Dan
    // --- on-death berserk pulse ---
    berserRadius:220,                        // how far the pulse reaches from death point
    berserDur:7.0,                           // seconds berserk lasts on nearby robots
    berserSpeedMult:1.7,                     // speed multiplier while berserk
    berserDmgBonus:2,                        // added to melee damage while berserk
    spawners:1, max:2, interval:8.0, preplace:1,
  },
};

// Which single enemy type populates each test level (one type per level).
// Extend as enemies are added; levels beyond the list reuse the last entry.
export const LEVEL_PLAN = ["picker", "forklift", "security", "sorter", "cleaner", "drone", "manager"];
