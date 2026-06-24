/* test-conveyor.js — headless smoke tests for the conveyor PUSH mechanic (§8.1.2).

   Exercises the REAL modules (world / player / enemies / projectiles / dustbin /
   level) — not inlined copies — by stubbing the browser globals the import graph
   needs (canvas, AudioContext) and then dynamically importing. Verifies:
     1. the baked push field is APPLIED to ground bodies (and summed diagonally at
        an intersection) and IGNORED by fliers (drones);
     2. Dan's net (move + belt) velocity is clamped to CFG.DAN_NET_SPEED_MAX, and
        riding with the belt is faster than pushing against it;
     3. ground ENEMIES get the belt push added after their AI (via updateEnemies);
     4. projectiles (ebolts) and the Atomic Dustbin are UNAFFECTED by the belt;
     5. the hand-authored conveyor demo level loads through the same loader, with
        its E–W / N–S crossing baking a diagonal at the overlap.

   Run: node test-conveyor.js   (requires package.json "type":"module")
*/

/* ---- 1. Stub the browser globals the module graph needs at import time ---- */
const fakeCtx = { imageSmoothingEnabled: false };
const fakeCanvas = {
  width: 960, height: 640,
  getContext: () => fakeCtx,
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
};
// A fuller fake Web Audio graph than test-loader's (these tests run the sim, which
// fires sfx.* during combat / belt FX). Every node is chainable + no-op so audio
// never throws and never makes noise.
const fakeParam = () => ({
  value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){},
  linearRampToValueAtTime(){}, setTargetAtTime(){}, cancelScheduledValues(){},
});
const fakeNode = () => ({
  type: "", frequency: fakeParam(), Q: fakeParam(), gain: fakeParam(),
  buffer: null, loop: false,
  connect(dest){ return dest || fakeNode(); }, disconnect(){},
  start(){}, stop(){}, onended: null,
});
class FakeAudioContext {
  constructor(){ this.state = "suspended"; this.currentTime = 0; this.sampleRate = 44100; this.destination = fakeNode(); }
  createGain(){ return fakeNode(); }
  createOscillator(){ return fakeNode(); }
  createBufferSource(){ return fakeNode(); }
  createBiquadFilter(){ return fakeNode(); }
  createBuffer(_ch, len){ return { getChannelData: () => new Float32Array(len) }; }
  resume(){ return Promise.resolve(); }
}
globalThis.window = globalThis.window || {};
globalThis.window.AudioContext = FakeAudioContext;
globalThis.window.webkitAudioContext = FakeAudioContext;
globalThis.window.addEventListener = () => {};
globalThis.document = { getElementById: () => fakeCanvas, addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.performance = globalThis.performance || { now: () => 0 };

/* ---- 2. Import the real modules (dynamic, after stubs are set) ------------ */
const world  = await import("./src/world.js");
const level  = await import("./src/level.js");
const enemies = await import("./src/enemies.js");
const player  = await import("./src/player.js");
const projectiles = await import("./src/projectiles.js");
const dustbin = await import("./src/dustbin.js");
const input   = await import("./src/input.js");
const { G }   = await import("./src/state.js");
const { CFG } = await import("./src/config.js");

/* ---- 3. Tiny assert harness ---------------------------------------------- */
let passed = 0, failed = 0;
function check(name, ok){
  if (ok){ passed++; console.log(`  ok   ${name}`); }
  else   { failed++; console.log(`  FAIL ${name}`); }
}
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;
const tcx = (n) => (n / CFG.TILE) | 0;
const onFloor = (x, y) => !world.isWall(tcx(x), tcx(y));

// A flat w×h box: solid border, interior floor. Loaded via the real primitives.
function flat(w, h){
  const rows = [];
  for (let y = 0; y < h; y++){
    let s = "";
    for (let x = 0; x < w; x++) s += (x===0||y===0||x===w-1||y===h-1) ? "#" : ".";
    rows.push(s);
  }
  return rows;
}
const S = CFG.CONVEYOR_SPEED;

// Initialise G fully (dan, powerups, arrays, camera) once, then we override the
// geometry per-test with the same primitives the loader uses.
level.newGame();
G.inputMode = "keyboard";

/* ========================================================================= *
   1. The baked push field is applied to ground bodies, ignored by fliers,
      and sums to a diagonal at an intersection (§8.1.2 / §8.1.4).
 * ========================================================================= */
console.log("Push field application (ground vs flier vs intersection) ->");
world.loadTileGrid(flat(20, 9));
world.bakeConveyors([{ x:1, y:1, w:18, h:7, dir:"E", speed:2.0 }]);   // 120 px/s East
const cell = world.tileCenter(5, 4);

const ground = { x:cell.x, y:cell.y, r:11 };
const movedGround = world.applyBeltPush(ground, 0.1);
check("ground body is pushed by the belt (+x)", movedGround && near(ground.x, cell.x + 2*S*0.1) && near(ground.y, cell.y));

const flier = { x:cell.x, y:cell.y, r:12, flying:true };
const movedFlier = world.applyBeltPush(flier, 0.1);
check("flying body (drone) ignores the belt", movedFlier === false && flier.x === cell.x && flier.y === cell.y);

const off = world.tileCenter(5, 4);
// move a body to an UNcovered area: re-bake a smaller strip so (5,4) is off-belt
world.bakeConveyors([{ x:1, y:1, w:2, h:7, dir:"E", speed:2.0 }]);
const offBody = { x:off.x, y:off.y, r:11 };
check("body off any belt receives no push", world.applyBeltPush(offBody, 0.1) === false && offBody.x === off.x);

// Intersection: E strip crossing an N strip -> NE diagonal at the overlap.
world.bakeConveyors([
  { x:1, y:1, w:18, h:7, dir:"E", speed:2.0 },
  { x:5, y:1, w:1,  h:7, dir:"N", speed:2.0 },
]);
check("intersection cell bakes a summed NE vector", world.pushAt(5, 4).dx === 2*S && world.pushAt(5, 4).dy === -2*S);
const xbody = { x:cell.x, y:cell.y, r:11 };
world.applyBeltPush(xbody, 0.1);
check("body on an intersection is pushed diagonally", xbody.x > cell.x && xbody.y < cell.y);

/* ========================================================================= *
   2. Dan's net (move + belt) velocity is clamped; with-belt beats against-belt.
 * ========================================================================= */
console.log("Dan net-speed clamp + with/against belt ->");
const danCell = world.tileCenter(10, 4);
function resetDan(){
  G.dan.x = danCell.x; G.dan.y = danCell.y;
  G.dan.kvx = 0; G.dan.kvy = 0; G.dan.slow = 0; G.dan.iframe = 0; G.dan.cooldown = 1;
  input.keys.d = false; input.keys.a = false;
}

// Strong belt + moving WITH it -> net would be 185+600 but clamps to DAN_NET_SPEED_MAX.
world.loadTileGrid(flat(20, 9));
world.bakeConveyors([{ x:1, y:1, w:18, h:7, dir:"E", speed:10.0 }]);   // 600 px/s East
resetDan(); input.keys.d = true;
let x0 = G.dan.x;
player.updateDan(0.05);
const dispClamped = G.dan.x - x0;
check("Dan onBelt flag set on a belt", G.dan.onBelt === true);
check("net speed clamped to DAN_NET_SPEED_MAX", near(dispClamped, CFG.DAN_NET_SPEED_MAX * 0.05, 0.6));
check("clamped disp is below the raw move+belt sum", dispClamped < (CFG.DAN_SPEED + 10*S) * 0.05);

// Moderate belt (60 px/s): with the belt is faster than against it, both make headway.
world.bakeConveyors([{ x:1, y:1, w:18, h:7, dir:"E", speed:1.0 }]);    // 60 px/s East
resetDan(); input.keys.d = true;  x0 = G.dan.x; player.updateDan(0.05);
const withBelt = G.dan.x - x0;                                        // east, sped up
resetDan(); input.keys.a = true;  x0 = G.dan.x; player.updateDan(0.05);
const against = G.dan.x - x0;                                         // west, slowed
check("riding with the belt is faster than against it", withBelt > Math.abs(against));
check("with-belt ~= (move+belt) and uncapped", near(withBelt, (CFG.DAN_SPEED + S) * 0.05, 0.6));
check("against-belt still makes headway (moves west)", against < 0 && near(Math.abs(against), (CFG.DAN_SPEED - S) * 0.05, 0.6));

/* ========================================================================= *
   3. Ground ENEMIES receive the belt push after their AI (updateEnemies).
 * ========================================================================= */
console.log("Enemy belt push via updateEnemies ->");
world.loadTileGrid(flat(20, 9));
world.bakeConveyors([{ x:1, y:1, w:18, h:7, dir:"E", speed:2.0 }]);   // 120 px/s East
const ec = world.tileCenter(5, 4);
G.enemies = []; G.dustbin = null;
G.dan.x = ec.x; G.dan.y = ec.y; G.dan.iframe = 1;   // coincident -> picker AI move ~0
// High HP so it survives Dan's contact mop (we only care that the belt moves it).
G.enemies.push({ type:"picker", x:ec.x, y:ec.y, r:11, hp:9, maxHp:9, speed:108, spawn:0, bob:0, hitFlash:0 });
enemies.updateEnemies(0.1);
const pe = G.enemies[0];
check("ground enemy is carried by the belt (+x)", pe && near(pe.x, ec.x + 2*S*0.1, 0.6) && near(pe.y, ec.y, 0.6));

/* ========================================================================= *
   4. Projectiles and the Atomic Dustbin are UNAFFECTED by the belt.
 * ========================================================================= */
console.log("Projectiles + Atomic Dustbin ignore the belt ->");
world.loadTileGrid(flat(20, 9));
world.bakeConveyors([{ x:1, y:1, w:18, h:7, dir:"E", speed:5.0 }]);   // 300 px/s East
const bc = world.tileCenter(5, 4);
G.enemies = []; G.dan.x = -9999; G.dan.y = -9999;   // park Dan far away (no collisions)
G.ebolts = [{ kind:"bolt", x:bc.x, y:bc.y, vx:100, vy:0, r:5, dmg:2, traveled:0, range:99999, spin:0 }];
projectiles.updateEbolts(0.1);
const bolt = G.ebolts[0];
check("a bolt moves only by its own velocity (no belt)", bolt && bolt.x === bc.x + 100*0.1 && bolt.y === bc.y);

G.dan.hasDustbin = false; G.dustbinPickups = []; G.enemies = [];
G.dustbin = { x:bc.x, y:bc.y, r:14, spin:0, vx:0, vy:0, state:"attract", timer:1.0 };
dustbin.updateDustbin(0.1);
check("a settled Atomic Dustbin is not moved by the belt", G.dustbin && G.dustbin.x === bc.x && G.dustbin.y === bc.y);
check("dustbin attract timer still ticks down", near(G.dustbin.timer, 0.9));

/* ========================================================================= *
   5. The hand-authored conveyor demo loads through the SAME loader.
 * ========================================================================= */
console.log("Hand-authored conveyor demo level ->");
level.loadLevel(level.conveyorTestLevelDef());
check("demo: grid dims adopted (24x18)",          CFG.COLS === 24 && CFG.ROWS === 18);
check("demo: player + exit on floor tiles",       onFloor(G.dan.x, G.dan.y) && onFloor(G.exit.x, G.exit.y));
check("demo: E–W belt band pushes east",          world.pushAt(3, 8).dx > 0 && world.pushAt(3, 8).dy === 0);
check("demo: N–S belt pushes north",              world.pushAt(11, 4).dx === 0 && world.pushAt(11, 4).dy < 0);
check("demo: crossing bakes a NE diagonal",       world.pushAt(11, 8).dx > 0 && world.pushAt(11, 8).dy < 0);
check("demo: player start is OFF the belts",      world.pushAt(tcx(G.dan.x), tcx(G.dan.y)).dx === 0 && world.pushAt(tcx(G.dan.x), tcx(G.dan.y)).dy === 0);
check("demo: exit is OFF the belts",              world.pushAt(tcx(G.exit.x), tcx(G.exit.y)).dx === 0 && world.pushAt(tcx(G.exit.x), tcx(G.exit.y)).dy === 0);
check("demo: 2 picker terminals placed",          G.terminals.length === 2);
check("demo: 3 workers placed",                   G.workers.length === 3);
let demoFloor = true;
for (const arr of [G.terminals, G.workers, G.pickups, G.enemies, G.dustbinPickups, G.vending])
  for (const o of arr) if (!onFloor(o.x, o.y)) demoFloor = false;
check("demo: every spawned entity on a floor tile", demoFloor);

/* ---- summary ------------------------------------------------------------- */
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
