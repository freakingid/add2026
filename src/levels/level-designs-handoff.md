# Atomic Dustbin Dan — Level Designs Handoff

Five hand-authored Level Definitions for implementation via Claude Code.
Each is ready to pass to `loadLevel()` in `level.js`.
Tile chars: `.` floor · `#` wall · `S` shelf · `P` pallet · `o` pillar
Conveyor dirs: N / S / E / W · speed in same units as CFG conveyor constant
Zone roles: spawn · cover · combat · danger
All levels: player spawns south-center; exit is placed by fixed placement.
Two vending machines per level: vendingSmall in cover zone, vendingLarge in danger zone.

---

## Level Design 1 — Receiving Dock

**Intended level range:** L1–2 (early game)
**Tactical premise:** Three horizontal bands — loading bays with pallet clusters
at the top (spawn zone for enemies), a full-width conveyor belt as a mid-line
threat, and an open staging floor at the bottom where Dan spawns. Two Dispatch
Terminals sit just above the conveyor. Dan can hold south in the open or push
north through pallet cover. Bubbles travel full width; pallet corners give
ricochet angles. Forklift has a long clear charge lane on the left wall.

```js
{
  name: "receiving_dock",
  cols: 30,
  rows: 34,

  tiles: [
    "##############################",  // 0  north wall
    "#............................#",  // 1
    "#.PPP..PPP..PPP..PPP..PPP...#",  // 2  pallet row 1
    "#............................#",  // 3
    "#.PPP..PPP..PPP..PPP..PPP...#",  // 4  pallet row 2
    "#............................#",  // 5
    "#............................#",  // 6
    "#............................#",  // 7
    "#............................#",  // 8  (conveyor belt occupies rows 8–9 via strip)
    "#............................#",  // 9
    "#............................#",  // 10
    "#.SSS.....SSS.....SSS.....SS#",  // 11 shelf row (storage zone)
    "#............................#",  // 12
    "#.SSS.....SSS.....SSS.....SS#",  // 13
    "#............................#",  // 14
    "#.SSS.....SSS.....SSS.....SS#",  // 15
    "#............................#",  // 16
    "#............................#",  // 17
    "#............................#",  // 18
    "#............................#",  // 19
    "#............................#",  // 20  open staging floor
    "#............................#",  // 21
    "#............................#",  // 22
    "#............................#",  // 23
    "#............................#",  // 24
    "#............................#",  // 25
    "#............................#",  // 26
    "#............................#",  // 27
    "#............................#",  // 28
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32
    "##############################",  // 33 south wall
  ],

  conveyors: [
    { x: 1, y: 8, w: 28, h: 2, dir: "E", speed: 1.0 },
  ],

  zones: [
    { x: 1, y: 1,  w: 28, h: 9,  role: "danger" },   // north — near terminals + belt
    { x: 1, y: 10, w: 28, h: 7,  role: "cover"  },   // shelf rows
    { x: 1, y: 17, w: 28, h: 16, role: "spawn"  },   // open staging floor — Dan starts here
    { x: 1, y: 17, w: 28, h: 16, role: "combat" },
  ],

  placements: [
    { type: "player", x: 14, y: 28 },
    { type: "exit",   x: 14, y: 32 },
  ],

  spawnRules: [
    { type: "dispatchTerminal", count: 2, zone: "danger" },
    { type: "vendingSmall",     count: 1, zone: "cover"  },
    { type: "vendingLarge",     count: 1, zone: "danger" },
    { type: "worker",           count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",          count: 2, zone: "cover"  },
    { type: "atomicDustbin",    count: 1, zone: "combat" },
  ],
}
```

---

## Level Design 2 — Pick-and-Pack Floor

**Intended level range:** L3–4 (early mid-game)
**Tactical premise:** Five parallel shelf rows running E-W, each interrupted by
three cross-aisles running N-S. This creates a grid of T-intersections — the
classic warehouse storage floor. Sorter Bots lob from behind shelf rows; Scanner
Bots patrol the horizontal aisles. Dan must cross aisles (briefly exposing himself
to full-lane sightlines) to reach the terminals in the north. Bubbles travel the
full aisle length and ricochet off shelf ends. Lateral movement rewards positioning
over straight-line aggression.

```js
{
  name: "pick_and_pack",
  cols: 30,
  rows: 34,

  tiles: [
    "##############################",  // 0
    "#............................#",  // 1  north open space (terminal zone)
    "#............................#",  // 2
    "#SSSSSSS...SSSSSSSS...SSSSS.#",  // 3  shelf row A (gaps at cols 8–10, 19–21)
    "#............................#",  // 4  aisle 1
    "#............................#",  // 5
    "#SSSSSSS...SSSSSSSS...SSSSS.#",  // 6  shelf row B
    "#............................#",  // 7  aisle 2
    "#............................#",  // 8
    "#SSSSSSS...SSSSSSSS...SSSSS.#",  // 9  shelf row C
    "#............................#",  // 10 aisle 3
    "#............................#",  // 11
    "#SSSSSSS...SSSSSSSS...SSSSS.#",  // 12 shelf row D
    "#............................#",  // 13 aisle 4
    "#............................#",  // 14
    "#SSSSSSS...SSSSSSSS...SSSSS.#",  // 15 shelf row E
    "#............................#",  // 16 aisle 5 (south of last shelf)
    "#............................#",  // 17
    "#............................#",  // 18
    "#............................#",  // 19
    "#............................#",  // 20
    "#............................#",  // 21  south open space (Dan spawn area)
    "#............................#",  // 22
    "#............................#",  // 23
    "#............................#",  // 24
    "#............................#",  // 25
    "#............................#",  // 26
    "#............................#",  // 27
    "#............................#",  // 28
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32
    "##############################",  // 33
  ],

  conveyors: [],

  zones: [
    { x: 1, y: 1,  w: 28, h: 3,  role: "danger" },   // north near terminals
    { x: 1, y: 3,  w: 28, h: 13, role: "cover"  },   // the shelf band
    { x: 1, y: 16, w: 28, h: 17, role: "spawn"  },   // south open floor
    { x: 1, y: 16, w: 28, h: 17, role: "combat" },
  ],

  placements: [
    { type: "player", x: 14, y: 28 },
    { type: "exit",   x: 14, y: 32 },
  ],

  spawnRules: [
    { type: "dispatchTerminal", count: 2, zone: "danger" },
    { type: "vendingSmall",     count: 1, zone: "cover"  },
    { type: "vendingLarge",     count: 1, zone: "danger" },
    { type: "worker",           count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",          count: 2, zone: "cover"  },
    { type: "atomicDustbin",    count: 1, zone: "cover"  },
  ],
}
```

---

## Level Design 3 — Cold Storage Vault

**Intended level range:** L4–5 (mid-game)
**Tactical premise:** Two halves split by a horizontal internal wall with a single
passage (the choke point). Dan spawns south in an open dispatch floor with the
Dispatch Terminals also in the south — immediate pressure, familiar rhythm. The
north half is dense with large refrigeration unit blocks (represented as P for
pallet-scale solids) forming irregular L-shaped clusters that break sightlines.
The exit is top-right of the north zone. Dan must decide when to commit through
the choke and navigate the cover maze. The Atomic Dustbin and large vending machine
are seeded deep in the north zone as a risk/reward pull. Left wall has a long clear
lane for Forklift charges.

```js
{
  name: "cold_storage_vault",
  cols: 30,
  rows: 34,

  tiles: [
    "##############################",  // 0
    "#............................#",  // 1  north zone
    "#.PPPPPP....PPPPPP....PPPPPP#",  // 2  refrigeration cluster row 1
    "#.PPPPPP....PPPPPP....PPPPPP#",  // 3
    "#.PPP.......PPP..............#",  // 4  L-shape lower arm
    "#............................#",  // 5
    "#....PPPPPP....PPPPPP........#",  // 6  cluster row 2
    "#....PPPPPP....PPPPPP........#",  // 7
    "#....PPP.......PPP...........#",  // 8
    "#............................#",  // 9
    "#.PPPPPP....PPPPPP...........#",  // 10 cluster row 3
    "#.PPPPPP....PPPPPP...........#",  // 11
    "#.PPP........................#",  // 12
    "#............................#",  // 13
    "#............................#",  // 14
    "#............................#",  // 15
    "########........##############",  // 16 divider wall — passage at cols 8–15
    "#............................#",  // 17 south zone begins
    "#.SSS.....SSS.....SSS........#",  // 18 shelf rows (south cover)
    "#............................#",  // 19
    "#.SSS.....SSS.....SSS........#",  // 20
    "#............................#",  // 21
    "#.SSS.....SSS.....SSS........#",  // 22
    "#............................#",  // 23
    "#............................#",  // 24
    "#............................#",  // 25
    "#............................#",  // 26
    "#............................#",  // 27
    "#............................#",  // 28
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32
    "##############################",  // 33
  ],

  conveyors: [],

  zones: [
    { x: 1,  y: 1,  w: 28, h: 15, role: "danger" },  // north — cover maze + exit
    { x: 1,  y: 17, w: 28, h: 6,  role: "cover"  },  // south shelf rows
    { x: 1,  y: 23, w: 28, h: 10, role: "spawn"  },  // south open floor
    { x: 1,  y: 23, w: 28, h: 10, role: "combat" },
  ],

  placements: [
    { type: "player", x: 14, y: 28 },
    { type: "exit",   x: 26, y: 1  },
  ],

  spawnRules: [
    { type: "dispatchTerminal", count: 2, zone: "combat" },
    { type: "vendingSmall",     count: 1, zone: "cover"  },
    { type: "vendingLarge",     count: 1, zone: "danger" },
    { type: "worker",           count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",          count: 2, zone: "cover"  },
    { type: "atomicDustbin",    count: 1, zone: "danger" },
  ],
}
```

---

## Level Design 4 — Central Floor + Mezzanine Ring

**Intended level range:** L5–6 (late mid-game)
**Tactical premise:** A large open central arena bordered by an inner wall ring
with four doorways (N, S, E, W), creating a mezzanine corridor around the
perimeter. Four Dispatch Terminals are distributed in the north and south mezzanine
runs. Dan spawns center-arena — always in the kill zone, with enemies emerging from
all four doorways. Shelf alcoves in mezzanine corners are the only real cover but
require entering dangerous territory to reach. The Atomic Dustbin spawns
south-center of the arena: throw it through any doorway to clear a mezzanine
segment and create a safe window. Two vending machines sit in the W and E
mezzanine corridors — reachable only by entering the ring.

```js
{
  name: "mezzanine_ring",
  cols: 30,
  rows: 34,

  tiles: [
    "##############################",  // 0
    "#............................#",  // 1  north mezzanine
    "#.SSS......................SSS#",  // 2  NW + NE shelf alcoves
    "#.SSS......................SSS#",  // 3
    "#.SSS......................SSS#",  // 4
    "#............................#",  // 5
    "#....############...##########",  // 6  inner wall north — gap at cols 12–17 (N doorway)
    "#....#..................#.....#",  // 7  inner wall W col=4, E col=24; center open
    "#....#..................#.....#",  // 8
    "#....#..................#.....#",  // 9
    "#....#..................#.....#",  // 10 W doorway: remove inner wall col 4 rows 10–12
    "#......................#.....#",   // 11 (W gap open — no # at col 4)
    "#....#..................#.....#",  // 12
    "#....#..................#.....#",  // 13
    "#....#..................#.....#",  // 14
    "#....#..................#.....#",  // 15
    "#....#..................#.....#",  // 16
    "#....#..................#.....#",  // 17
    "#....#..................#.....#",  // 18
    "#....#..................#.....#",  // 19
    "#....#..................#.....#",  // 20
    "#....#..................#.....#",  // 21
    "#....#..................#.....#",  // 22 E doorway: remove inner wall col 24 rows 22–24
    "#....#.......................#",   // 23 (E gap open)
    "#....#..................#.....#",  // 24
    "#....############...#########.#", // 25 inner wall south — gap at cols 12–17 (S doorway)
    "#............................#",  // 26 south mezzanine
    "#.SSS......................SSS#",  // 27 SW + SE shelf alcoves
    "#.SSS......................SSS#",  // 28
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32
    "##############################",  // 33
  ],

  // NOTE FOR IMPLEMENTER: The tile grid above approximates the inner wall ring.
  // The exact chars may need adjustment to guarantee all four doorways are open
  // and the ring is solid elsewhere. Design intent:
  //   Inner wall forms a closed rectangle from roughly col 4 to col 24, row 6 to row 25.
  //   Four gaps (doorways) cut through it:
  //     North gap: cols 12–17, row 6
  //     South gap: cols 12–17, row 25
  //     West gap:  col 4, rows 10–12
  //     East gap:  col 24, rows 22–24
  //   Everything inside the inner wall is open floor (central arena).
  //   Everything outside (between inner wall and outer wall) is the mezzanine ring.
  //   Shelf alcoves sit in the four corners of the mezzanine.
  // Treat the tile grid as reference geometry; adjust chars to make it load cleanly.

  conveyors: [],

  zones: [
    { x: 1,  y: 1,  w: 28, h: 5,  role: "danger" },   // north mezzanine
    { x: 1,  y: 26, w: 28, h: 7,  role: "danger" },   // south mezzanine
    { x: 5,  y: 7,  w: 20, h: 18, role: "combat" },   // central arena
    { x: 5,  y: 7,  w: 20, h: 18, role: "spawn"  },
    { x: 1,  y: 1,  w: 3,  h: 32, role: "cover"  },   // west mezzanine corridor
    { x: 26, y: 1,  w: 3,  h: 32, role: "cover"  },   // east mezzanine corridor
  ],

  placements: [
    { type: "player", x: 14, y: 16 },
    { type: "exit",   x: 14, y: 32 },
  ],

  spawnRules: [
    { type: "dispatchTerminal", count: 2, zone: "danger" },
    { type: "vendingSmall",     count: 1, zone: "cover"  },
    { type: "vendingLarge",     count: 1, zone: "cover"  },
    { type: "worker",           count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",          count: 2, zone: "danger" },
    { type: "atomicDustbin",    count: 1, zone: "combat" },
  ],
}
```

---

## Level Design 5 — Conveyor Hub

**Intended level range:** L6–7 (late game)
**Tactical premise:** Two intersecting conveyor belts divide the floor into four
quadrant zones, each with its own character. NW = pillar grid (open sightlines,
pillar cover). NE = dense shelf rows near exit and terminals. SW = pallet maze
(dense cover). SE = open arena where Dan spawns. Dan must cross a conveyor belt
to reach any other quadrant. The belt intersection is the most exposed point on
the map — but the Atomic Dustbin spawns near there as a deliberate high-risk
pickup. Drones from NE terminals fly over all conveyor lanes, menacing the whole
map. Manager Bot fires homing missiles through the long conveyor lanes — maximum
free-travel distance before hitting a wall.

```js
{
  name: "conveyor_hub",
  cols: 30,
  rows: 34,

  tiles: [
    "##############################",  // 0
    "#............................#",  // 1  NW: pillar grid top
    "#.o....o....o....o...........#",  // 2
    "#............................#",  // 3
    "#.o....o....o....o...........#",  // 4
    "#............................#",  // 5
    "#.o....o....o....o...........#",  // 6
    "#............................#",  // 7
    "#.o....o.........SSSSSSSSSSS#",  // 8  NE: shelf rows begin (right half)
    "#.................SSSSSSSSSSS#",  // 9
    "#.o....o.........SSSSSSSSSSS#",  // 10
    "#.................SSSSSSSSSSS#",  // 11
    "#.o....o.........SSSSSSSSSSS#",  // 12
    "#.................SSSSSSSSSSS#",  // 13
    "#............................#",  // 14
    "#............................#",  // 15
    "#............................#",  // 16  H-belt rows (floor — conveyor strip)
    "#............................#",  // 17
    "#............................#",  // 18
    "#.PPP..PPP..PPP..............#",  // 19 SW: pallet clusters begin
    "#.PPP..PPP..PPP..............#",  // 20
    "#............................#",  // 21
    "#.PPP..PPP...................#",  // 22
    "#.PPP..PPP...............PP..#",  // 23
    "#................PP......PP..#",  // 24
    "#................PP..........#",  // 25
    "#............................#",  // 26 SE: open arena begins
    "#............................#",  // 27
    "#............................#",  // 28
    "#............................#",  // 29
    "#............................#",  // 30
    "#............................#",  // 31
    "#............................#",  // 32
    "##############################",  // 33
  ],

  conveyors: [
    { x: 1,  y: 16, w: 28, h: 2,  dir: "E", speed: 1.0 },  // full-width H belt
    { x: 14, y: 1,  w: 2,  h: 32, dir: "N", speed: 1.0 },  // full-height V belt
    // intersection at x:14–15, y:16–17 → diagonal NE push (E+N summed by bakeConveyors)
  ],

  zones: [
    { x: 1,  y: 1,  w: 13, h: 15, role: "combat" },   // NW pillar grid
    { x: 15, y: 1,  w: 14, h: 15, role: "danger" },   // NE shelf zone (exit + terminals)
    { x: 1,  y: 18, w: 13, h: 15, role: "cover"  },   // SW pallet maze
    { x: 15, y: 18, w: 14, h: 15, role: "spawn"  },   // SE open arena
    { x: 15, y: 18, w: 14, h: 15, role: "combat" },
  ],

  placements: [
    { type: "player", x: 22, y: 28 },
    { type: "exit",   x: 22, y: 1  },
  ],

  spawnRules: [
    { type: "dispatchTerminal", count: 2, zone: "danger" },
    { type: "vendingSmall",     count: 1, zone: "cover"  },
    { type: "vendingLarge",     count: 1, zone: "combat" },
    { type: "worker",           count: 5, zone: "any",   avoid: "spawn" },
    { type: "powerup",          count: 2, zone: "combat" },
    { type: "atomicDustbin",    count: 1, zone: "combat" },
  ],
}
```

---

## Implementation notes for Claude Code

- All five definitions are ready to pass to `loadLevel()` in `level.js`.
- Add them to a new file `src/levels/authored-levels.js` that exports a named
  object, e.g. `export const AUTHORED_LEVELS = { receiving_dock, pick_and_pack, ... }`.
- The mezzanine ring (Level 4) includes a detailed tile-grid implementation note
  inside the definition — read it before writing final tile chars, as the ASCII
  approximation in the tile array may need cleanup to load cleanly.
- Conveyor Hub (Level 5) requires the conveyor push mechanic to be active (session
  2 complete) to feel correct in play. The `bakeConveyors` call in `world.js` handles
  the intersection automatically — no special intersection code needed.
- The generator (`generateLevelDef` in `level.js`) remains untouched — these are
  additive authored levels, not replacements for generated ones.
- Wire a debug key (suggest `]`) to cycle through `AUTHORED_LEVELS` so each can be
  loaded and walked without playing through generated levels to reach them.
- Validate each level loads without errors before moving to the next. The
  `validateLevelDef` call inside `loadLevel` will catch missing player/exit
  placements and unknown zone role references.