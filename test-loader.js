/* test-loader.js — headless smoke tests for the §8.1 Level Definition loader.

   Exercises the REAL modules (world.js / level.js) — not inlined copies — by
   stubbing the browser globals the import graph touches (canvas.js does
   document.getElementById; input.js registers listeners) and then dynamically
   importing after the stubs are in place. Verifies:
     1. the generator emits a level the loader accepts (valid, fully populated);
     2. spawn rules never place an entity on a solid tile;
     3. validation rejects malformed defs (no player / no exit / unknown zone role);
     4. the baked conveyor push field sums overlapping strips (and cancels opposing);
     5. a hand-authored Level Definition loads through the SAME loader.

   Run: node test-loader.js   (requires package.json "type":"module")
*/

/* ---- 1. Stub the browser globals the module graph needs at import time ---- */
const fakeCtx = { imageSmoothingEnabled: false };
const fakeCanvas = {
  width: 960, height: 640,
  getContext: () => fakeCtx,
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
};
class FakeAudioContext {
  constructor(){ this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
  createGain(){ return { gain: { value: 0, setValueAtTime(){}, linearRampToValueAtTime(){} }, connect(){}, disconnect(){} }; }
  resume(){ return Promise.resolve(); }
}
globalThis.window = globalThis.window || {};
globalThis.window.AudioContext = FakeAudioContext;
globalThis.window.webkitAudioContext = FakeAudioContext;
globalThis.window.addEventListener = () => {};
globalThis.document = { getElementById: () => fakeCanvas, addEventListener: () => {} };
globalThis.addEventListener = () => {};
// navigator is a read-only global in Node; input.js only reads navigator.getGamepads
// at runtime (pollGamepad), which these tests never call, so it needs no stub.

/* ---- 2. Import the real modules (dynamic, after stubs are set) ------------ */
const world  = await import("./src/world.js");
const level  = await import("./src/level.js");
const { G }   = await import("./src/state.js");
const { CFG } = await import("./src/config.js");

/* ---- 3. Tiny assert harness (same shape as test-input.js) ---------------- */
let passed = 0, failed = 0;
function check(name, ok){
  if (ok){ passed++; console.log(`  ok   ${name}`); }
  else   { failed++; console.log(`  FAIL ${name}`); }
}
function throws(name, fn){
  let threw = false, msg = "";
  try { fn(); } catch (e){ threw = true; msg = e.message; }
  check(`${name} -> rejects${threw ? ` ("${msg}")` : ""}`, threw);
}
const tx = (x) => (x / CFG.TILE) | 0;
const onFloor = (x, y) => !world.isWall(tx(x), tx(y));

/* ========================================================================= *
   1 + 2. The generator emits a valid level, and nothing lands on a solid.
 * ========================================================================= */
console.log("Generated level (procgen -> loader) ->");
level.newGame();   // builds level 1 via generateLevelDef() -> loadLevel()

check("map adopts the generator's dimensions", world.map.length === CFG.GEN_ROWS && world.map[0].length === CFG.GEN_COLS);
check("CFG.COLS/ROWS track the loaded grid",  CFG.COLS === CFG.GEN_COLS && CFG.ROWS === CFG.GEN_ROWS);
check("terminals placed",                     G.terminals.length > 0);
check("exactly 5 workers (GDD §8.1)",         G.workers.length === 5);
check("exit door created",                    !!G.exit);
check("power-up pickups seeded",              G.pickups.length === CFG.MAX_PICKUPS);
check("push field sized to the map",          world.pushField.length === CFG.ROWS && world.pushField[0].length === CFG.COLS);
check("no conveyors -> push field all zero",  world.pushAt(5, 5).dx === 0 && world.pushAt(5, 5).dy === 0);
check("Dan spawns on a floor tile",           onFloor(G.dan.x, G.dan.y));
check("exit is on a floor tile",              onFloor(G.exit.x, G.exit.y));

console.log("Spawn rules never place on a solid tile ->");
let allFloor = true, offenders = 0;
for (const arr of [G.terminals, G.workers, G.pickups, G.enemies, G.dustbinPickups, G.vending])
  for (const o of arr)
    if (!onFloor(o.x, o.y)){ allFloor = false; offenders++; }
check(`every spawned entity on a non-solid tile${offenders ? ` (${offenders} bad)` : ""}`, allFloor);

/* ========================================================================= *
   3. Validation rejects malformed definitions (§8.1.4).
 * ========================================================================= */
console.log("Validation (§8.1.4) ->");
const baseTiles = ["####", "#..#", "####"];   // tiny 4x3, interior floor at (1,1)(2,1)
const baseDef = (over) => Object.assign({
  tiles: baseTiles,
  zones: [{ role: "combat", x: 1, y: 1, w: 2, h: 1 }],
  placements: [{ type: "player", x: 1, y: 1 }, { type: "exit", x: 2, y: 1 }],
  spawnRules: [{ type: "worker", count: 1, zone: "combat" }],
}, over);

throws("missing player placement", () => level.loadLevel(baseDef({ placements: [{ type: "exit", x: 2, y: 1 }] })));
throws("two player placements",     () => level.loadLevel(baseDef({ placements: [{ type: "player", x: 1, y: 1 }, { type: "player", x: 2, y: 1 }, { type: "exit", x: 2, y: 1 }] })));
throws("missing exit placement",    () => level.loadLevel(baseDef({ placements: [{ type: "player", x: 1, y: 1 }] })));
throws("spawn rule unknown zone role", () => level.loadLevel(baseDef({ spawnRules: [{ type: "worker", count: 1, zone: "nope" }] })));
throws("ragged tile grid",          () => level.loadLevel(baseDef({ tiles: ["####", "#..#", "###"] })));
let okLoad = true;
try { level.loadLevel(baseDef({})); } catch (e){ okLoad = false; }
check("a well-formed def loads without throwing", okLoad);
check("'any' zone role is accepted without a matching zone", (() => {
  try { level.loadLevel(baseDef({ spawnRules: [{ type: "worker", count: 1, zone: "any" }] })); return true; }
  catch (e){ return false; }
})());

/* ========================================================================= *
   4. Conveyor push field bakes correctly (§8.1.4) — sums + cancels.
 * ========================================================================= */
console.log("Conveyor push-field bake (§8.1.4) ->");
world.loadTileGrid(["########", "#......#", "#......#", "#......#", "#......#", "########"]); // 8x6
const S = CFG.CONVEYOR_SPEED;
world.bakeConveyors([
  { x: 1, y: 2, w: 6, h: 1, dir: "E", speed: 1.0 },   // row 2, cols 1..6 -> East
  { x: 3, y: 1, w: 1, h: 4, dir: "N", speed: 1.0 },   // col 3, rows 1..4 -> North
]);
check("E-only cell pushes +x",            world.pushAt(1, 2).dx === S && world.pushAt(1, 2).dy === 0);
check("N-only cell pushes -y",            world.pushAt(3, 1).dx === 0 && world.pushAt(3, 1).dy === -S);
check("overlap sums to a NE diagonal",    world.pushAt(3, 2).dx === S && world.pushAt(3, 2).dy === -S);
check("uncovered cell stays zero",        world.pushAt(6, 4).dx === 0 && world.pushAt(6, 4).dy === 0);
world.bakeConveyors([
  { x: 1, y: 2, w: 6, h: 1, dir: "E", speed: 1.0 },
  { x: 1, y: 2, w: 6, h: 1, dir: "W", speed: 1.0 },   // opposing same strip
]);
check("opposing strips cancel to zero",   world.pushAt(3, 2).dx === 0 && world.pushAt(3, 2).dy === 0);

/* ========================================================================= *
   5. A hand-authored Level Definition loads through the SAME loader.
 * ========================================================================= */
console.log("Hand-authored level (authoring path) ->");
const authored = {
  tiles: [
    "##############",
    "#............#",
    "#...SS.......#",
    "#...SS...P...#",
    "#............#",
    "#.....o......#",
    "#............#",
    "#..#.....#...#",
    "#............#",
    "##############",
  ],
  conveyors: [
    { x: 1, y: 4, w: 12, h: 1, dir: "E", speed: 1.0 },
    { x: 6, y: 1, w: 1,  h: 8, dir: "N", speed: 1.0 },   // crosses the E strip at (6,4)
  ],
  zones: [
    { role: "spawn",  x: 1, y: 6, w: 5,  h: 3 },
    { role: "combat", x: 1, y: 1, w: 12, h: 8 },
    { role: "cover",  x: 1, y: 1, w: 12, h: 8 },
    { role: "danger", x: 1, y: 1, w: 12, h: 8 },
  ],
  placements: [
    { type: "player", x: 2, y: 8 },
    { type: "exit",   x: 11, y: 1 },
  ],
  spawnRules: [
    { type: "terminal",     enemy: "picker", count: 2, preplace: 1, zone: "danger", avoid: "spawn" },
    { type: "worker",       count: 2, zone: "combat", avoid: "spawn" },
    { type: "powerup",      count: 1, zone: "combat" },
    { type: "vendingSmall", count: 1, zone: "cover" },
    { type: "atomicDustbin",count: 1, zone: "combat", avoid: "spawn" },
  ],
};
level.loadLevel(authored);
check("authored: grid dims adopted (14x10)",  CFG.COLS === 14 && CFG.ROWS === 10);
check("authored: 2 terminals placed",          G.terminals.length === 2);
check("authored: 2 workers placed",            G.workers.length === 2);
check("authored: 1 power-up placed",           G.pickups.length === 1);
check("authored: 1 vending machine placed",    G.vending.length === 1);
check("authored: 1 dustbin pickup placed",     G.dustbinPickups.length === 1);
check("authored: 1 enemy preplaced from terminal", G.enemies.length === 1);
check("authored: Dan at the player tile (2,8)", tx(G.dan.x) === 2 && tx(G.dan.y) === 8);
check("authored: exit on a floor tile",        onFloor(G.exit.x, G.exit.y));
check("authored: conveyor overlap bakes NE diagonal", world.pushAt(6, 4).dx > 0 && world.pushAt(6, 4).dy < 0);
const v = G.vending[0];
check("authored: vending sits flush against a wall", world.isWall(tx(v.x) + v.dx, tx(v.y) + v.dy));
let authoredFloor = true;
for (const arr of [G.terminals, G.workers, G.pickups, G.enemies, G.dustbinPickups, G.vending])
  for (const o of arr) if (!onFloor(o.x, o.y)) authoredFloor = false;
check("authored: all spawned entities on floor", authoredFloor);

/* ---- summary ------------------------------------------------------------- */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
