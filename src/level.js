/* =========================================================================
   level.js — run/level lifecycle, the Level-Definition generator, and the
   single loader that consumes a Level Definition (GDD §8.1).

   newGame (full reset) -> buildLevel -> nextLevel. buildLevel no longer builds a
   playable level directly: it GENERATES a Level Definition (generateLevelDef) and
   hands it to loadLevel — the SAME loader every hand-authored level uses, so
   generated and authored levels behave identically (GDD §8.1).

   A Level Definition is plain data with three thin layers + fixed placements:
     tiles       — row-major char grid (Layer 1, the only collision/LOS geometry)
     conveyors   — axis-aligned push strips (Layer 2; parsed + BAKED, not applied yet)
     zones       — tagged placement-hint rects (Layer 3): spawn/cover/combat/danger
     placements  — fixed set pieces with exact tile coords (always player + exit)
     spawnRules  — "drop `count` of `type` into zone `role`, optionally avoid a role"

   Also: spawner-terminal emission (spawnFromTerminal / spawnWave) and the testing
   power-up pickup seeding/collection.
   ========================================================================= */
import { CFG, ENEMY, POWERUPS, POWERUP_KEYS, LEVEL_PLAN } from "./config.js";
import { G, levelType } from "./state.js";
import {
  loadTileGrid, bakeConveyors, isWall, tileCenter,
  randomFloorTile, randomFloorTileTC, randomFloorTileNearWall,
} from "./world.js";
import { spawnEnemy } from "./enemies.js";
import { spawnVendingMachine } from "./vending.js";
import { spawnDustbinPickup } from "./dustbin.js";
import { addFloat } from "./effects.js";
import { sfx } from "./audio.js";

// Full reset — new run from level 1. HP, power-ups, score all cleared.
export function newGame(){
  G.dan = {
    x:0, y:0, r:CFG.DAN_RADIUS,
    hp:CFG.DAN_HP, maxHp:CFG.DAN_HP,
    angle:0, cooldown:0, iframe:0, kvx:0, kvy:0,
    slow:0, sprayTick:0,        // Cleaner debuff: slow timer + DoT tick gate
    hasDustbin:false,           // carrying an Atomic Dustbin special? (GDD 5)
  };
  G.powerups = { rapid:0, triple:0, bounce:0 };
  G.score = 0;
  G.level = 1;
  buildLevel();
  G.state = "playing";
}

// Advance to a fresh level — HP, power-ups, and score persist.
export function nextLevel(){
  G.level++;
  buildLevel();
  G.state = "playing";
}

// Generate this level's definition, then load it. The generator is a PRODUCER of
// Level Definitions; loadLevel is the only entry point to a playable level. Dan's
// hp/powerups/score are untouched (loadLevel only repositions him).
function buildLevel(){
  loadLevel(generateLevelDef());
}

/* =========================================================================
   The procedural generator — emits a valid Level Definition (GDD §8.1).
   Its whole job is to produce data; it never touches G's entities directly.
   ========================================================================= */
function generateLevelDef(){
  const cols = CFG.GEN_COLS, rows = CFG.GEN_ROWS;

  // --- Layer 1: tile grid — perimeter wall, horizontal shelf runs, carved pocket.
  const grid = [];
  for (let y = 0; y < rows; y++){
    const row = [];
    for (let x = 0; x < cols; x++)
      row.push((x===0 || y===0 || x===cols-1 || y===rows-1) ? "#" : ".");
    grid.push(row);
  }
  for (let y = 4; y < rows - 3; y += 4){            // shelf rows with aisle gaps
    let x = 3;
    while (x < cols - 3){
      const len = 3 + Math.floor(Math.random()*4);
      for (let i = 0; i < len && x < cols - 3; i++, x++) grid[y][x] = "S";   // destructible
      x += 2 + Math.floor(Math.random()*3);
    }
  }
  const cx = (cols/2)|0, cy = (rows/2)|0;
  for (let y = cy-2; y <= cy+2; y++)                // clear Dan's spawn pocket
    for (let x = cx-2; x <= cx+2; x++)
      if (x>0 && y>0 && x<cols-1 && y<rows-1) grid[y][x] = ".";
  const tiles = grid.map(r => r.join(""));

  // Parse now so randomFloorTileTC can choose the (fixed) exit from real floor
  // tiles. loadLevel re-parses the same grid as the authoritative step (idempotent).
  loadTileGrid(tiles);

  // --- Layer 2: conveyors — none generated yet (the push mechanic is a later session).
  const conveyors = [];

  // --- Layer 3a: zones. The spawn pocket is the avoid target; combat/cover/danger
  // blanket the interior (roles may overlap, §8.1.3) so rule placement scatters
  // map-wide while honoring avoid:"spawn" — reproducing the old minDist placement.
  const half = 6;
  const sx0 = Math.max(1, cx-half), sy0 = Math.max(1, cy-half);
  const sx1 = Math.min(cols-2, cx+half), sy1 = Math.min(rows-2, cy+half);
  const interior = { x:1, y:1, w:cols-2, h:rows-2 };
  const zones = [
    { role:"spawn", x:sx0, y:sy0, w:sx1-sx0+1, h:sy1-sy0+1 },
    { ...interior, role:"combat" },
    { ...interior, role:"cover"  },
    { ...interior, role:"danger" },
  ];

  // --- Layer 3b: fixed placements — player (pocket centre) + exit (random, far).
  const exitTC = randomFloorTileTC(8);
  const placements = [
    { type:"player", x:cx, y:cy },
    { type:"exit",   x:exitTC.tx, y:exitTC.ty },
  ];

  // --- Layer 3c: spawn rules — terminals (level composition), then the guaranteed
  // set (workers, power-ups, two vending machines, a rare Atomic Dustbin) per §8.1.3.
  const spawnRules = [];
  const type = levelType();
  if (type === "mixed"){
    // Sandbox: one terminal of EVERY real enemy type, each preplacing one.
    for (const t of LEVEL_PLAN){
      if (t === "mixed") continue;
      spawnRules.push({ type:"terminal", enemy:t, count:1, preplace:1, zone:"combat", avoid:"spawn" });
    }
  } else {
    const d = ENEMY[type];
    const termCount = Math.min((d.spawners || 3) + ((G.level - 1) / 2 | 0), 6);
    spawnRules.push({ type:"terminal", enemy:type, count:termCount, preplace:(d.preplace || 0), zone:"combat", avoid:"spawn" });
    // Manager / Scanner levels also seed a Picker cluster for the pulse/alarm to amplify.
    if (type === "manager" || type === "scanner")
      spawnRules.push({ type:"terminal", enemy:"picker", count:2, preplace:3, zone:"combat", avoid:"spawn" });
  }
  spawnRules.push({ type:"worker",       count:CFG.WORKER.count, zone:"combat", avoid:"spawn" });
  spawnRules.push({ type:"powerup",      count:CFG.MAX_PICKUPS,  zone:"combat", avoid:"spawn" });
  spawnRules.push({ type:"vendingSmall", count:1, zone:"cover",  avoid:"spawn" });   // §2.5: small in cover
  spawnRules.push({ type:"vendingLarge", count:1, zone:"danger", avoid:"spawn" });   //       large in danger (risk/reward)
  const dustCount = (G.level === 1 || Math.random() < CFG.DUSTBIN.spawnChance) ? 1 : 0;
  spawnRules.push({ type:"atomicDustbin", count:dustCount, zone:"combat", avoid:"spawn" });

  return { cols, rows, tiles, conveyors, zones, placements, spawnRules };
}

/* =========================================================================
   The loader — the ONLY entry point to a playable level (GDD §8.1.4). Consumes a
   Level Definition (generated OR hand-authored) and builds the runtime world.
   ========================================================================= */
export function loadLevel(def){
  validateLevelDef(def);                 // throws on a malformed definition

  // Layer 1 + 2: geometry into the runtime map; conveyor push field baked (no entity
  // reads it yet — proving the data path ahead of the push mechanic).
  loadTileGrid(def.tiles);
  bakeConveyors(def.conveyors || []);

  // Clear all transient per-level entity arrays (Dan's hp/powerups/score persist).
  G.shots = []; G.enemies = []; G.terminals = []; G.pickups = [];
  G.marks = []; G.floats = []; G.ebolts = []; G.vending = [];
  G.dustbin = null; G.dustbinPickups = []; G.workers = [];
  G.rescued = 0; G.spawnTimer = 0.6; G.pickupTimer = 0;

  // Fixed placements: player start + exit door. Resolve the player FIRST so any
  // preplaced enemy that reads Dan's position (e.g. the Drone's orbit bearing)
  // sees him already placed.
  const player = def.placements.find(p => p.type === "player");
  const pc = tileCenter(player.x, player.y);
  G.dan.x = pc.x; G.dan.y = pc.y;
  G.dan.cooldown = 0; G.dan.iframe = 0; G.dan.kvx = 0; G.dan.kvy = 0;
  G.dan.slow = 0; G.dan.sprayTick = 0;

  const exit = def.placements.find(p => p.type === "exit");
  const ec = tileCenter(exit.x, exit.y);
  G.exit = { x:ec.x, y:ec.y, r:18, pulse:0 };

  // Spawn rules scatter rule-based entities into their zones (honor avoid, never on a solid).
  for (const rule of (def.spawnRules || [])) runSpawnRule(rule, def);

  G.camera = { x:0, y:0 };
}

// §8.1.4 validation: exactly one `player`, at least one `exit`, and every spawn
// rule's referenced zone role must exist (or be "any"). Throws so a bad level
// fails loudly at load time rather than producing a broken world.
export function validateLevelDef(def){
  if (!def || !Array.isArray(def.tiles) || def.tiles.length === 0)
    throw new Error("level def: missing tile grid");
  const placements = def.placements || [];
  const players = placements.filter(p => p.type === "player").length;
  if (players !== 1) throw new Error(`level def: must have exactly one player placement (found ${players})`);
  const exits = placements.filter(p => p.type === "exit").length;
  if (exits < 1) throw new Error("level def: must have at least one exit placement");
  const roles = new Set((def.zones || []).map(z => z.role));
  for (const rule of (def.spawnRules || [])){
    if (rule.zone && rule.zone !== "any" && !roles.has(rule.zone))
      throw new Error(`level def: spawn rule '${rule.type}' references unknown zone role '${rule.zone}'`);
  }
}

/* ---- Spawn-rule placement ------------------------------------------------ */
// Zones carrying a given role (null for "any" -> the whole interior).
function zonesWithRole(def, role){
  if (!role || role === "any") return null;
  return (def.zones || []).filter(z => z.role === role);
}
function inAnyRect(tx, ty, rects){
  for (const r of rects) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return true;
  return false;
}
// A random tile inside one of `rects` (or the whole interior when null). Raw — the
// caller validates non-solid / avoid / wall-adjacency.
function randomTC(rects){
  if (rects && rects.length){
    const r = rects[(Math.random()*rects.length)|0];
    return { tx: r.x + ((Math.random()*r.w)|0), ty: r.y + ((Math.random()*r.h)|0) };
  }
  return { tx: 1 + ((Math.random()*(CFG.COLS-2))|0), ty: 1 + ((Math.random()*(CFG.ROWS-2))|0) };
}
// Pick a non-solid interior tile inside the rule's zone, not inside any `avoid`
// zone (§8.1.4). Falls back to any interior floor tile so a rule always places.
function pickTile(rule, def){
  const rects = zonesWithRole(def, rule.zone), avoid = zonesWithRole(def, rule.avoid);
  for (let tries = 0; tries < 400; tries++){
    const { tx, ty } = randomTC(rects);
    if (tx <= 0 || ty <= 0 || tx >= CFG.COLS-1 || ty >= CFG.ROWS-1) continue;
    if (isWall(tx, ty)) continue;                       // never place on a solid tile
    if (avoid && inAnyRect(tx, ty, avoid)) continue;    // honor avoid
    return { tx, ty };
  }
  return randomFloorTileTC(0);                          // guaranteed non-solid interior tile
}
// Like pickTile but the tile must border a wall (a vending machine sits flush against
// it). Returns {tx,ty,dx,dy} (dx/dy points to the wall) or null. Falls back to the
// global wall-adjacent finder so a machine still places if the zone has no wall edge.
function pickWallTile(rule, def){
  const rects = zonesWithRole(def, rule.zone), avoid = zonesWithRole(def, rule.avoid);
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (let tries = 0; tries < 400; tries++){
    const { tx, ty } = randomTC(rects);
    if (tx <= 0 || ty <= 0 || tx >= CFG.COLS-1 || ty >= CFG.ROWS-1) continue;
    if (isWall(tx, ty)) continue;
    if (avoid && inAnyRect(tx, ty, avoid)) continue;
    for (let s = dirs.length-1; s > 0; s--){            // Fisher–Yates shuffle the sides
      const j = (Math.random()*(s+1))|0; const t = dirs[s]; dirs[s] = dirs[j]; dirs[j] = t;
    }
    for (const [dx, dy] of dirs) if (isWall(tx+dx, ty+dy)) return { tx, ty, dx, dy };
  }
  return randomFloorTileNearWall(CFG.VENDING.minDistFromCenter);   // may be null
}
const centerOf = (t) => tileCenter(t.tx, t.ty);

// Resolve one spawn rule into entities (§8.1.3). Each entity `type` has its own
// placement strategy; unknown types are ignored (forward-compatible).
function runSpawnRule(rule, def){
  const n = rule.count || 0;
  switch (rule.type){
    case "terminal": {
      for (let i = 0; i < n; i++){
        const c = centerOf(pickTile(rule, def));
        G.terminals.push({ x:c.x, y:c.y, r:14, pulse:Math.random()*Math.PI*2,
          hp:CFG.TERMINAL.hp, hitFlash:0, type:rule.enemy });
      }
      // Initial population emerges FROM the terminals just placed (not floor-scattered),
      // preserving the old "preplace from terminal" feel.
      for (let i = 0; i < (rule.preplace || 0); i++) spawnFromTerminal(rule.enemy);
      break;
    }
    case "worker": {
      for (let i = 0; i < n; i++){
        const c = centerOf(pickTile(rule, def));
        G.workers.push({ x:c.x, y:c.y, r:CFG.WORKER.radius,
          heading:Math.random()*Math.PI*2, wanderT:0, bob:Math.random()*Math.PI*2, fleeing:false });
      }
      break;
    }
    case "powerup": {
      for (let i = 0; i < n; i++){
        const c = centerOf(pickTile(rule, def));
        const kind = rule.kind || POWERUP_KEYS[(Math.random()*POWERUP_KEYS.length)|0];
        G.pickups.push({ type:kind, x:c.x, y:c.y, r:13, bob:Math.random()*Math.PI*2 });
      }
      break;
    }
    case "vendingSmall":
    case "vendingLarge": {
      const variant = rule.type === "vendingLarge" ? "large" : "small";
      for (let i = 0; i < n; i++){
        const spot = pickWallTile(rule, def);
        if (spot) spawnVendingMachine(variant, spot);          // null -> no wall tile found
      }
      break;
    }
    case "atomicDustbin": {
      for (let i = 0; i < n; i++) spawnDustbinPickup(centerOf(pickTile(rule, def)));
      break;
    }
    default: break;     // unknown entity type — ignore
  }
}

export function spawnPickup(type){
  if (!type) type = POWERUP_KEYS[(Math.random()*POWERUP_KEYS.length)|0];
  const p = randomFloorTile(3);
  G.pickups.push({ type, x:p.x, y:p.y, r:13, bob:Math.random()*Math.PI*2 });
}


// Emit one enemy of `type` from a random matching spawner-terminal.
// Returns false if that type has no terminals left (all destroyed).
function spawnFromTerminal(type){
  const tlist = G.terminals.filter(t => t.type === type);
  if (tlist.length === 0) return false;
  const t = tlist[(Math.random()*tlist.length)|0];
  spawnEnemy(type, { x:t.x, y:t.y });
  t.spawnFlash = 0.18;        // brief emit pulse on the terminal
  return true;
}

// Spawn a wave member for the level's type, respecting that type's cap.
// All enemies now emerge from terminals; no terminals -> no spawns.
export function spawnWave(type){
  const d = ENEMY[type];
  const count = G.enemies.reduce((n, e) => n + (e.type === type ? 1 : 0), 0);
  if (count >= d.max) return;
  spawnFromTerminal(type);
}
export function updatePickups(dt){
  for (let i = G.pickups.length - 1; i >= 0; i--){
    const p = G.pickups[i];
    p.bob += dt * 3;
    if (Math.hypot(p.x - G.dan.x, p.y - G.dan.y) <= p.r + G.dan.r){
      // Stack: add a fresh batch of enhanced shots to this counter.
      G.powerups[p.type] += CFG.POWERUP_SHOTS;
      const def = POWERUPS[p.type];
      addFloat(p.x, p.y - 14, "+" + def.label, def.color);
      sfx.powerup();
      G.pickups.splice(i, 1);
    }
  }
}
