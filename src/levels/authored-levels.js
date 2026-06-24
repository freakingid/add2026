/* =========================================================================
   authored-levels.js — five hand-authored Level Definitions (GDD §8.1).

   Each entry is a plain-data Level Definition ready to pass to loadLevel()
   in level.js — the SAME loader the generator feeds. The generator is NOT
   touched; these are additive, debug-loadable levels (cycle them in-game with
   the `]` key, wired in input.js).

   Source: src/levels/level-designs-handoff.md. Two faithful adaptations were
   needed to match the loader's actual spawn-rule schema (runSpawnRule):

   1. TERMINALS. The handoff used a generic `{ type:"dispatchTerminal" }` rule,
      but the loader expects `{ type:"terminal", enemy:<ENEMY key>, preplace }`
      (an unmatched `dispatchTerminal` would hit the default branch and place
      ZERO terminals — i.e. a level with no enemies). So each level's terminals
      carry the enemy type(s) NAMED IN ITS TACTICAL PREMISE; where the premise
      names two types, the two terminals split one each; otherwise both fit the
      level's intended range. `preplace:1` seeds one bot per terminal at load so
      the level isn't empty on arrival (the global cadence keeps spawning).
        L1 Receiving Dock  — picker + forklift (premise: forklift charge lane)
        L2 Pick-and-Pack   — sorter + scanner  (both named)
        L3 Cold Storage    — forklift + sorter (forklift lane; sorter lobs over the divider)
        L4 Mezzanine Ring  — security + drone   (ranged pressure + a flier over the ring)
        L5 Conveyor Hub    — drone + manager    (both named)

   2. L4 TILE GRID rebuilt from the in-design "NOTE FOR IMPLEMENTER" (the ASCII
      in the handoff was an approximation): a closed inner wall rectangle
      (cols 4..24, rows 6..25) with four doorways — N cols 12-17 @row6,
      S cols 12-17 @row25, W col4 @rows10-12, E col24 @rows22-24 — open arena
      inside, mezzanine ring outside, shelf alcoves in the four ring corners.

   Tile chars: `.` floor · `#` wall · `S` shelf(destructible) · `P` pallet · `o` pillar
   (flags in CFG.TILES). All grids are 30 wide × 34 tall; rows must stay
   rectangular or loadTileGrid throws.
   ========================================================================= */

/* ---- Level 1 — Receiving Dock (L1–2) ------------------------------------
   Three horizontal bands: pallet loading bays (N) over a full-width E conveyor
   over an open staging floor (S, Dan's spawn). Terminals sit just above the belt;
   the left wall is a clear Forklift charge lane. */
const receiving_dock = {
  name: "receiving_dock",
  cols: 30, rows: 34,
  tiles: [
    "##############################",  //  0  north wall
    "#............................#",  //  1
    "#.PPP..PPP..PPP..PPP..PPP....#",  //  2  pallet row 1
    "#............................#",  //  3
    "#.PPP..PPP..PPP..PPP..PPP....#",  //  4  pallet row 2
    "#............................#",  //  5
    "#............................#",  //  6
    "#............................#",  //  7
    "#............................#",  //  8  E–W conveyor band (rows 8–9)
    "#............................#",  //  9
    "#............................#",  // 10
    "#.SSS....SSS....SSS....SSS...#",  // 11  shelf row (storage)
    "#............................#",  // 12
    "#.SSS....SSS....SSS....SSS...#",  // 13
    "#............................#",  // 14
    "#.SSS....SSS....SSS....SSS...#",  // 15
    "#............................#",  // 16
    "#............................#",  // 17  open staging floor
    "#............................#",  // 18
    "#............................#",  // 19
    "#............................#",  // 20
    "#............................#",  // 21
    "#............................#",  // 22
    "#............................#",  // 23
    "#............................#",  // 24
    "#............................#",  // 25
    "#............................#",  // 26
    "#............................#",  // 27
    "#............................#",  // 28  Dan spawns here (14,28)
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32  exit (14,32)
    "##############################",  // 33  south wall
  ],
  conveyors: [
    { x: 1, y: 8, w: 28, h: 2, dir: "E", speed: 1.0 },
  ],
  zones: [
    { x: 1, y: 1,  w: 28, h: 9,  role: "danger" },   // north — terminals + belt
    { x: 1, y: 10, w: 28, h: 7,  role: "cover"  },   // shelf rows
    { x: 1, y: 17, w: 28, h: 16, role: "spawn"  },   // open staging floor (Dan)
    { x: 1, y: 17, w: 28, h: 16, role: "combat" },
  ],
  placements: [
    { type: "player", x: 14, y: 28 },
    { type: "exit",   x: 14, y: 32 },
  ],
  spawnRules: [
    { type: "terminal", enemy: "picker",   count: 1, preplace: 1, zone: "danger" },
    { type: "terminal", enemy: "forklift", count: 1, preplace: 1, zone: "danger" },
    { type: "vendingSmall",  count: 1, zone: "cover"  },
    { type: "vendingLarge",  count: 1, zone: "danger" },
    { type: "worker",        count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",       count: 2, zone: "cover"  },
    { type: "atomicDustbin", count: 1, zone: "combat" },
  ],
};

/* ---- Level 2 — Pick-and-Pack Floor (L3–4) -------------------------------
   Five E–W shelf rows broken by two N–S cross-aisles (gaps at cols 8-10, 19-21),
   making a grid of T-intersections. Sorters lob from behind the rows; Scanners
   patrol the aisles. Dan crosses aisles (exposed) to reach the northern terminals. */
const pick_and_pack = {
  name: "pick_and_pack",
  cols: 30, rows: 34,
  tiles: [
    "##############################",  //  0
    "#............................#",  //  1  north terminal zone
    "#............................#",  //  2
    "#SSSSSSS...SSSSSSSS...SSSSSSS#",  //  3  shelf row A
    "#............................#",  //  4  aisle 1
    "#............................#",  //  5
    "#SSSSSSS...SSSSSSSS...SSSSSSS#",  //  6  shelf row B
    "#............................#",  //  7  aisle 2
    "#............................#",  //  8
    "#SSSSSSS...SSSSSSSS...SSSSSSS#",  //  9  shelf row C
    "#............................#",  // 10  aisle 3
    "#............................#",  // 11
    "#SSSSSSS...SSSSSSSS...SSSSSSS#",  // 12  shelf row D
    "#............................#",  // 13  aisle 4
    "#............................#",  // 14
    "#SSSSSSS...SSSSSSSS...SSSSSSS#",  // 15  shelf row E
    "#............................#",  // 16  aisle 5
    "#............................#",  // 17
    "#............................#",  // 18
    "#............................#",  // 19
    "#............................#",  // 20
    "#............................#",  // 21  south open floor (Dan)
    "#............................#",  // 22
    "#............................#",  // 23
    "#............................#",  // 24
    "#............................#",  // 25
    "#............................#",  // 26
    "#............................#",  // 27
    "#............................#",  // 28  Dan spawns here (14,28)
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32  exit (14,32)
    "##############################",  // 33
  ],
  conveyors: [],
  zones: [
    { x: 1, y: 1,  w: 28, h: 3,  role: "danger" },   // north near terminals
    { x: 1, y: 3,  w: 28, h: 13, role: "cover"  },   // shelf band
    { x: 1, y: 16, w: 28, h: 17, role: "spawn"  },   // south open floor
    { x: 1, y: 16, w: 28, h: 17, role: "combat" },
  ],
  placements: [
    { type: "player", x: 14, y: 28 },
    { type: "exit",   x: 14, y: 32 },
  ],
  spawnRules: [
    { type: "terminal", enemy: "sorter",  count: 1, preplace: 1, zone: "danger" },
    { type: "terminal", enemy: "scanner", count: 1, preplace: 1, zone: "danger" },
    { type: "vendingSmall",  count: 1, zone: "cover"  },
    { type: "vendingLarge",  count: 1, zone: "danger" },
    { type: "worker",        count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",       count: 2, zone: "cover"  },
    { type: "atomicDustbin", count: 1, zone: "cover"  },
  ],
};

/* ---- Level 3 — Cold Storage Vault (L4–5) --------------------------------
   Two halves split by a horizontal divider wall with one passage (cols 8-15).
   Dan AND the terminals spawn south (immediate pressure); the north is a
   refrigeration-block (pallet) cover maze with the exit top-right. The big
   vending machine + Atomic Dustbin sit deep north as a risk/reward pull. */
const cold_storage_vault = {
  name: "cold_storage_vault",
  cols: 30, rows: 34,
  tiles: [
    "##############################",  //  0
    "#............................#",  //  1  north zone
    "#.PPPPPP....PPPPPP....PPPPPP.#",  //  2  fridge cluster row 1
    "#.PPPPPP....PPPPPP....PPPPPP.#",  //  3
    "#.PPP.......PPP..............#",  //  4  L lower arms
    "#............................#",  //  5
    "#....PPPPPP....PPPPPP........#",  //  6  cluster row 2
    "#....PPPPPP....PPPPPP........#",  //  7
    "#....PPP.......PPP...........#",  //  8
    "#............................#",  //  9
    "#.PPPPPP....PPPPPP...........#",  // 10  cluster row 3
    "#.PPPPPP....PPPPPP...........#",  // 11
    "#.PPP........................#",  // 12
    "#............................#",  // 13
    "#............................#",  // 14
    "#............................#",  // 15
    "########........##############",  // 16  divider wall — passage cols 8–15
    "#............................#",  // 17  south zone
    "#.SSS.....SSS.....SSS........#",  // 18  shelf rows (south cover)
    "#............................#",  // 19
    "#.SSS.....SSS.....SSS........#",  // 20
    "#............................#",  // 21
    "#.SSS.....SSS.....SSS........#",  // 22
    "#............................#",  // 23
    "#............................#",  // 24
    "#............................#",  // 25
    "#............................#",  // 26
    "#............................#",  // 27
    "#............................#",  // 28  Dan spawns here (14,28)
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32
    "##############################",  // 33
  ],
  conveyors: [],
  zones: [
    { x: 1,  y: 1,  w: 28, h: 15, role: "danger" },  // north cover maze + exit
    { x: 1,  y: 17, w: 28, h: 6,  role: "cover"  },  // south shelf rows
    { x: 1,  y: 23, w: 28, h: 10, role: "spawn"  },  // south open floor
    { x: 1,  y: 23, w: 28, h: 10, role: "combat" },
  ],
  placements: [
    { type: "player", x: 14, y: 28 },
    { type: "exit",   x: 26, y: 1  },
  ],
  spawnRules: [
    { type: "terminal", enemy: "forklift", count: 1, preplace: 1, zone: "combat" },
    { type: "terminal", enemy: "sorter",   count: 1, preplace: 1, zone: "combat" },
    { type: "vendingSmall",  count: 1, zone: "cover"  },
    { type: "vendingLarge",  count: 1, zone: "danger" },
    { type: "worker",        count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",       count: 2, zone: "cover"  },
    { type: "atomicDustbin", count: 1, zone: "danger" },
  ],
};

/* ---- Level 4 — Central Floor + Mezzanine Ring (L5–6) --------------------
   Rebuilt from the handoff's NOTE FOR IMPLEMENTER. A closed inner wall
   rectangle (cols 4..24, rows 6..25) encloses an open central arena (Dan spawns
   center, always in the kill zone) with four doorways onto a perimeter mezzanine
   ring; shelf alcoves sit in the ring's four corners. Doorways: N cols 12-17,
   S cols 12-17, W col 4 rows 10-12, E col 24 rows 22-24. */
const mezzanine_ring = {
  name: "mezzanine_ring",
  cols: 30, rows: 34,
  tiles: [
    "##############################",  //  0
    "#............................#",  //  1  north mezzanine
    "#SSS......................SSS#",  //  2  NW + NE shelf alcoves
    "#SSS......................SSS#",  //  3
    "#SSS......................SSS#",  //  4
    "#............................#",  //  5
    "#...########......#######....#",  //  6  inner wall N — gap cols 12–17
    "#...#...................#....#",  //  7
    "#...#...................#....#",  //  8
    "#...#...................#....#",  //  9
    "#.......................#....#",  // 10  W doorway (col 4 open) rows 10–12
    "#.......................#....#",  // 11
    "#.......................#....#",  // 12
    "#...#...................#....#",  // 13
    "#...#...................#....#",  // 14
    "#...#...................#....#",  // 15
    "#...#...................#....#",  // 16  arena center (Dan at 14,16)
    "#...#...................#....#",  // 17
    "#...#...................#....#",  // 18
    "#...#...................#....#",  // 19
    "#...#...................#....#",  // 20
    "#...#...................#....#",  // 21
    "#...#........................#",  // 22  E doorway (col 24 open) rows 22–24
    "#...#........................#",  // 23
    "#...#........................#",  // 24
    "#...########......#######....#",  // 25  inner wall S — gap cols 12–17
    "#............................#",  // 26  south mezzanine
    "#SSS......................SSS#",  // 27  SW + SE shelf alcoves
    "#SSS......................SSS#",  // 28
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32  exit (14,32)
    "##############################",  // 33
  ],
  conveyors: [],
  zones: [
    { x: 1,  y: 1,  w: 28, h: 5,  role: "danger" },   // north mezzanine
    { x: 1,  y: 26, w: 28, h: 7,  role: "danger" },   // south mezzanine
    { x: 5,  y: 7,  w: 19, h: 18, role: "combat" },   // central arena
    { x: 5,  y: 7,  w: 19, h: 18, role: "spawn"  },
    { x: 1,  y: 1,  w: 3,  h: 32, role: "cover"  },   // west mezzanine corridor
    { x: 26, y: 1,  w: 3,  h: 32, role: "cover"  },   // east mezzanine corridor
  ],
  placements: [
    { type: "player", x: 14, y: 16 },
    { type: "exit",   x: 14, y: 32 },
  ],
  spawnRules: [
    { type: "terminal", enemy: "security", count: 1, preplace: 1, zone: "danger" },
    { type: "terminal", enemy: "drone",    count: 1, preplace: 1, zone: "danger" },
    { type: "vendingSmall",  count: 1, zone: "cover"  },
    { type: "vendingLarge",  count: 1, zone: "cover"  },
    { type: "worker",        count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",       count: 2, zone: "danger" },
    { type: "atomicDustbin", count: 1, zone: "combat" },
  ],
};

/* ---- Level 5 — Conveyor Hub (L6–7) --------------------------------------
   Two intersecting belts (full-width E @rows 16-17, full-height N @cols 14-15)
   split the floor into four quadrants: NW pillar grid, NE shelf rows (exit +
   terminals), SW pallet maze, SE open arena (Dan). Crossing a belt is the only
   way between quadrants; the intersection bakes a NE diagonal push automatically.
   Needs the conveyor PUSH mechanic (already active) to feel right. */
const conveyor_hub = {
  name: "conveyor_hub",
  cols: 30, rows: 34,
  tiles: [
    "##############################",  //  0
    "#............................#",  //  1  NW pillar grid / exit corridor
    "#.o....o....o....o...........#",  //  2
    "#............................#",  //  3
    "#.o....o....o....o...........#",  //  4
    "#............................#",  //  5
    "#.o....o....o....o...........#",  //  6
    "#............................#",  //  7
    "#.o....o........SSSSSSSSSSSS.#",  //  8  NE shelf rows begin
    "#...............SSSSSSSSSSSS.#",  //  9
    "#.o....o........SSSSSSSSSSSS.#",  // 10
    "#...............SSSSSSSSSSSS.#",  // 11
    "#.o....o........SSSSSSSSSSSS.#",  // 12
    "#...............SSSSSSSSSSSS.#",  // 13
    "#............................#",  // 14
    "#............................#",  // 15
    "#............................#",  // 16  E–W conveyor band (rows 16–17)
    "#............................#",  // 17
    "#............................#",  // 18
    "#.PPP..PPP...................#",  // 19  SW pallet clusters
    "#.PPP..PPP...................#",  // 20
    "#............................#",  // 21
    "#.PPP..PPP...................#",  // 22
    "#.PPP..PPP...............PP..#",  // 23
    "#...............PP.......PP..#",  // 24
    "#...............PP...........#",  // 25
    "#............................#",  // 26  SE open arena
    "#............................#",  // 27
    "#............................#",  // 28  Dan spawns here (22,28)
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32
    "##############################",  // 33
  ],
  conveyors: [
    { x: 1,  y: 16, w: 28, h: 2,  dir: "E", speed: 1.0 },  // full-width H belt
    { x: 14, y: 1,  w: 2,  h: 32, dir: "N", speed: 1.0 },  // full-height V belt
  ],
  zones: [
    { x: 1,  y: 1,  w: 13, h: 15, role: "combat" },   // NW pillar grid
    { x: 15, y: 1,  w: 14, h: 15, role: "danger" },   // NE shelf zone (exit + terminals)
    { x: 1,  y: 18, w: 13, h: 15, role: "cover"  },   // SW pallet maze
    { x: 15, y: 18, w: 14, h: 15, role: "spawn"  },   // SE open arena (Dan)
    { x: 15, y: 18, w: 14, h: 15, role: "combat" },
  ],
  placements: [
    { type: "player", x: 22, y: 28 },
    { type: "exit",   x: 22, y: 1  },
  ],
  spawnRules: [
    { type: "terminal", enemy: "drone",   count: 1, preplace: 1, zone: "danger" },
    { type: "terminal", enemy: "manager", count: 1, preplace: 1, zone: "danger" },
    { type: "vendingSmall",  count: 1, zone: "cover"  },
    { type: "vendingLarge",  count: 1, zone: "combat" },
    { type: "worker",        count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",       count: 2, zone: "combat" },
    { type: "atomicDustbin", count: 1, zone: "combat" },
  ],
};

/* Insertion order is the cycle order of the `]` debug key. */
export const AUTHORED_LEVELS = {
  receiving_dock,
  pick_and_pack,
  cold_storage_vault,
  mezzanine_ring,
  conveyor_hub,
};
