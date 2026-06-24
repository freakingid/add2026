/* test-authored-levels.js — headless smoke tests for the five hand-authored
   Level Definitions in src/levels/authored-levels.js.

   Loads each level through the REAL loader (level.js / world.js) — the same path
   the `]` debug key uses in-game — by stubbing the browser globals the import
   graph touches, then dynamically importing after the stubs are in place. Per
   level it verifies:
     1. the tile grid is rectangular, matches its declared cols/rows, and uses
        only known tile chars (loadTileGrid throws otherwise);
     2. loadLevel() accepts the def and resolves Dan/exit onto floor tiles;
     3. spawn rules populate the level (5 workers, >=1 terminal + preplaced enemy,
        2 power-ups, >=1 vending machine) and never land an entity on a solid;
     4. the level is WALKABLE — a flood-fill from Dan's spawn reaches the exit and
        every terminal (the loader does not check reachability);
     5. conveyor levels bake a non-empty push field.

   Run: node test-authored-levels.js   (requires package.json "type":"module")
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

/* ---- 2. Import the real modules (dynamic, after stubs are set) ------------ */
const world = await import("./src/world.js");
const level = await import("./src/level.js");
const { G }   = await import("./src/state.js");
const { CFG } = await import("./src/config.js");
const { AUTHORED_LEVELS } = await import("./src/levels/authored-levels.js");

/* ---- 3. Tiny assert harness (same shape as the other test-*.js) ---------- */
let passed = 0, failed = 0;
function check(name, ok){
  if (ok){ passed++; console.log(`  ok   ${name}`); }
  else   { failed++; console.log(`  FAIL ${name}`); }
}
const tx = (x) => (x / CFG.TILE) | 0;
const onFloor = (x, y) => !world.isWall(tx(x), tx(y));

// Allocate G.dan/powerups once. The loader REPOSITIONS Dan but never allocates
// him (G.dan is null until a run starts); in-game the `]` key only fires while
// playing, so Dan already exists. newGame() mirrors that precondition here.
level.newGame();

// Flood-fill the floor tiles reachable on foot from a starting tile.
function reachableFrom(sx, sy){
  const seen = Array.from({ length: CFG.ROWS }, () => new Array(CFG.COLS).fill(false));
  const q = [[sx, sy]];
  if (sx >= 0 && sy >= 0 && sx < CFG.COLS && sy < CFG.ROWS) seen[sy][sx] = true;
  while (q.length){
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]){
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= CFG.COLS || ny >= CFG.ROWS) continue;
      if (seen[ny][nx] || world.isWall(nx, ny)) continue;
      seen[ny][nx] = true; q.push([nx, ny]);
    }
  }
  return seen;
}

for (const [key, def] of Object.entries(AUTHORED_LEVELS)){
  console.log(`\n${key} ->`);

  // 1. Grid geometry (catches a ragged row / stray char before loadLevel does).
  const w0 = def.tiles[0].length;
  const ragged = def.tiles.filter(r => r.length !== w0).length;
  check(`grid rectangular (all rows ${w0} wide)`, ragged === 0);
  check(`declared dims match grid (${def.cols}x${def.rows})`, def.cols === w0 && def.rows === def.tiles.length);
  let badChars = 0;
  for (const r of def.tiles) for (const ch of r) if (!CFG.TILES[ch]) badChars++;
  check("only known tile chars", badChars === 0);

  // 2. Loads through the real loader.
  let threw = null;
  try { level.loadLevel(def); } catch (e){ threw = e; }
  check(`loadLevel() does not throw${threw ? ` ("${threw.message}")` : ""}`, !threw);
  if (threw) continue;

  check("CFG.COLS/ROWS adopt the grid", CFG.COLS === def.cols && CFG.ROWS === def.rows);
  check("Dan on a floor tile",  onFloor(G.dan.x, G.dan.y));
  check("exit on a floor tile", onFloor(G.exit.x, G.exit.y));

  // 3. Population + nothing on a solid.
  check("5 workers (GDD §8.1)",     G.workers.length === 5);
  check("at least one terminal",    G.terminals.length >= 1);
  check("at least one preplaced enemy", G.enemies.length >= 1);
  check("2 power-up pickups",       G.pickups.length === 2);
  check("at least one vending machine", G.vending.length >= 1);
  let offenders = 0;
  for (const arr of [G.terminals, G.workers, G.pickups, G.enemies, G.dustbinPickups, G.vending])
    for (const o of arr) if (!onFloor(o.x, o.y)) offenders++;
  check(`every spawned entity on a non-solid tile${offenders ? ` (${offenders} bad)` : ""}`, offenders === 0);

  // 4. Walkable: exit + every terminal reachable on foot from Dan's spawn.
  const seen = reachableFrom(tx(G.dan.x), tx(G.dan.y));
  check("exit reachable on foot from Dan's spawn", seen[tx(G.exit.y)][tx(G.exit.x)]);
  const unreach = G.terminals.filter(t => !seen[tx(t.y)][tx(t.x)]).length;
  check(`all terminals reachable on foot${unreach ? ` (${unreach} walled off)` : ""}`, unreach === 0);

  // 5. Conveyor levels bake a push field.
  if ((def.conveyors || []).length){
    let nonzero = 0;
    for (let ty = 0; ty < CFG.ROWS; ty++) for (let txi = 0; txi < CFG.COLS; txi++){
      const p = world.pushAt(txi, ty); if (p.dx || p.dy) nonzero++;
    }
    check(`conveyor push field non-empty (${nonzero} cells)`, nonzero > 0);
  }
}

/* ---- summary ------------------------------------------------------------- */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
