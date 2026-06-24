/* =========================================================================
   world.js — the tilemap plus all geometry/collision queries, plus the §8.1
   tile-grid / conveyor loader primitives (loadTileGrid, bakeConveyors).

   `map` is an exported `let` reassigned ONLY by loadTileGrid, so importers get a
   live read-only view that stays current. Collision / LOS / destructibility all
   read CFG.TILES, so geometry behaviour is data-driven (§8.1.1). Everything else
   is a pure-ish query over the map or a small math helper.
   ========================================================================= */
import { CFG } from "./config.js";
import { G } from "./state.js";

// map[y][x] holds a TILE CHAR (key into CFG.TILES); "." floor, "#" wall, "S"
// shelf, etc. Reassigned only by loadTileGrid. Collision/LOS/destructibility all
// read CFG.TILES flags below, so the grid is the single geometry source (§8.1.1).
export let map = [];

// Baked conveyor push field (§8.1.4): pushField[y][x] = {dx,dy}, the vector sum of
// every strip covering that cell. O(1) runtime lookup via pushAt. NOTHING reads it
// yet — the push mechanic lands next session; we bake it now to prove the data path.
export let pushField = [];

function tileDef(tx, ty){ return CFG.TILES[map[ty][tx]]; }

export function isWall(tx, ty){
  if (tx < 0 || ty < 0 || tx >= CFG.COLS || ty >= CFG.ROWS) return true;
  const t = tileDef(tx, ty);
  return t ? t.solid : false;
}
export function blocksLOS(tx, ty){
  if (tx < 0 || ty < 0 || tx >= CFG.COLS || ty >= CFG.ROWS) return true;
  const t = tileDef(tx, ty);
  return t ? t.blocksLOS : false;
}
export function isDestructible(tx, ty){
  if (tx < 0 || ty < 0 || tx >= CFG.COLS || ty >= CFG.ROWS) return false;
  const t = tileDef(tx, ty);
  return t ? t.destructible : false;
}

// Parse a Level Definition's tile grid (row-major equal-length strings) into the
// runtime `map`, validating rectangularity + known chars, and adopting its
// dimensions as the live world size (CFG.COLS/ROWS). The sole way `map` is built.
export function loadTileGrid(tiles){
  if (!Array.isArray(tiles) || tiles.length === 0) throw new Error("loadTileGrid: empty tile grid");
  const cols = tiles[0].length, rows = tiles.length;
  if (cols === 0) throw new Error("loadTileGrid: zero-width grid");
  const next = [];
  for (let y = 0; y < rows; y++){
    const s = tiles[y];
    if (s.length !== cols) throw new Error(`loadTileGrid: ragged row ${y} (len ${s.length}, expected ${cols})`);
    const row = [];
    for (let x = 0; x < cols; x++){
      const ch = s[x];
      if (!CFG.TILES[ch]) throw new Error(`loadTileGrid: unknown tile char '${ch}' at ${x},${y}`);
      row.push(ch);
    }
    next.push(row);
  }
  map = next;
  CFG.COLS = cols; CFG.ROWS = rows;
}

// Bake the conveyor strips into the per-cell push field (§8.1.4). Each strip is an
// axis-aligned rect with a dir + speed; the net push at a cell is the vector sum of
// every covering strip, so crossing strips yield a diagonal at the overlap with no
// special intersection type. Speed is scaled by CFG.CONVEYOR_SPEED into px/s.
const CONVEYOR_DIR = { N:[0,-1], S:[0,1], E:[1,0], W:[-1,0] };
export function bakeConveyors(conveyors){
  pushField = [];
  for (let y = 0; y < CFG.ROWS; y++){
    const row = [];
    for (let x = 0; x < CFG.COLS; x++) row.push({ dx:0, dy:0 });
    pushField.push(row);
  }
  for (const c of (conveyors || [])){
    const v = CONVEYOR_DIR[c.dir];
    if (!v) continue;                                  // unknown dir -> skip (no push)
    const sp = (c.speed == null ? 1 : c.speed) * CFG.CONVEYOR_SPEED;
    for (let y = c.y; y < c.y + c.h; y++){
      for (let x = c.x; x < c.x + c.w; x++){
        if (x < 0 || y < 0 || x >= CFG.COLS || y >= CFG.ROWS) continue;
        pushField[y][x].dx += v[0] * sp;               // SUM overlapping strips
        pushField[y][x].dy += v[1] * sp;
      }
    }
  }
}

// O(1) push lookup at a tile (zero outside the map / outside any strip).
export function pushAt(tx, ty){
  if (tx < 0 || ty < 0 || tx >= CFG.COLS || ty >= CFG.ROWS) return { dx:0, dy:0 };
  return pushField[ty][tx];
}

// A random interior non-solid tile (tile coords). Optionally at least
// `minDistFromCenter` tiles from the map centre. Falls back to a guaranteed
// interior corner tile so callers always get a placeable, non-wall tile.
export function randomFloorTileTC(minDistFromCenter){
  const cx = CFG.COLS/2, cy = CFG.ROWS/2;
  for (let tries = 0; tries < 400; tries++){
    const tx = 1 + ((Math.random()*(CFG.COLS-2))|0);
    const ty = 1 + ((Math.random()*(CFG.ROWS-2))|0);
    if (isWall(tx, ty)) continue;
    if (minDistFromCenter && Math.hypot(tx-cx, ty-cy) < minDistFromCenter) continue;
    return { tx, ty };
  }
  // Last resort: scan for any interior floor tile.
  for (let ty = 1; ty < CFG.ROWS-1; ty++)
    for (let tx = 1; tx < CFG.COLS-1; tx++)
      if (!isWall(tx, ty)) return { tx, ty };
  return { tx:1, ty:1 };
}
export function randomFloorTile(minDistFromCenter){
  const t = randomFloorTileTC(minDistFromCenter);
  return { x:(t.tx+0.5)*CFG.TILE, y:(t.ty+0.5)*CFG.TILE };
}

// Like randomFloorTile, but the tile must border a wall on at least one side.
// Returns { tx, ty, dx, dy } where (dx,dy) points from the tile toward that wall
// (so a vending machine can sit flush against it). null if none found.
export function randomFloorTileNearWall(minDistFromCenter){
  const cx = CFG.COLS/2, cy = CFG.ROWS/2;
  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  for (let tries = 0; tries < 400; tries++){
    const tx = 1 + ((Math.random()*(CFG.COLS-2))|0);
    const ty = 1 + ((Math.random()*(CFG.ROWS-2))|0);
    if (isWall(tx, ty)) continue;
    if (minDistFromCenter && Math.hypot(tx-cx, ty-cy) < minDistFromCenter) continue;
    // Try the four sides in random order; take the first that is a wall.
    for (let s = dirs.length - 1; s > 0; s--){           // Fisher–Yates shuffle
      const j = (Math.random()*(s+1))|0;
      const t = dirs[s]; dirs[s] = dirs[j]; dirs[j] = t;
    }
    for (const [dx, dy] of dirs){
      if (isWall(tx+dx, ty+dy)) return { tx, ty, dx, dy };
    }
  }
  return null;
}

// ---- Tile helpers used by Cleaner patrol routing ----
export function tileFloor(tx, ty){
  return tx > 0 && ty > 0 && tx < CFG.COLS-1 && ty < CFG.ROWS-1 && !isWall(tx, ty);
}
export function tileCenter(tx, ty){ return { x:(tx+0.5)*CFG.TILE, y:(ty+0.5)*CFG.TILE }; }
// Consecutive floor tiles from (tx,ty) stepping (dx,dy), capped at `cap`.
export function tileClearRun(tx, ty, dx, dy, cap){
  let n = 0, cx = tx + dx, cy = ty + dy;
  while (n < cap && tileFloor(cx, cy)){ n++; cx += dx; cy += dy; }
  return n;
}
// Whole rectangle perimeter (ox,oy)..(ox+w,oy+h) is floor?
export function rectPerimeterClear(ox, oy, w, h){
  for (let i = 0; i <= w; i++)
    if (!tileFloor(ox+i, oy) || !tileFloor(ox+i, oy+h)) return false;
  for (let j = 0; j <= h; j++)
    if (!tileFloor(ox, oy+j) || !tileFloor(ox+w, oy+j)) return false;
  return true;
}

/* ---- Collision helpers -------------------------------------------------- */
// Treat moving bodies as AABB (half = radius) for wall resolution.
export function bodyHitsWall(x, y, r){
  const minX = ((x - r)/CFG.TILE)|0, maxX = ((x + r)/CFG.TILE)|0;
  const minY = ((y - r)/CFG.TILE)|0, maxY = ((y + r)/CFG.TILE)|0;
  for (let ty = minY; ty <= maxY; ty++)
    for (let tx = minX; tx <= maxX; tx++)
      if (isWall(tx, ty)) return true;
  return false;
}

// Move with per-axis resolution so bodies slide along walls.
export function moveBody(b, dx, dy){
  if (dx){
    b.x += dx;
    if (bodyHitsWall(b.x, b.y, b.r)) b.x -= dx;
  }
  if (dy){
    b.y += dy;
    if (bodyHitsWall(b.x, b.y, b.r)) b.y -= dy;
  }
}

export function isBorderTile(tx, ty){
  return tx === 0 || ty === 0 || tx === CFG.COLS-1 || ty === CFG.ROWS-1;
}

// Sample along the segment; blocked if any LOS-blocking tile lies between.
export function hasLineOfSight(x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) / (CFG.TILE * 0.4));
  for (let s = 1; s < steps; s++){
    const t = s / steps;
    const px = x0 + dx*t, py = y0 + dy*t;
    if (blocksLOS((px/CFG.TILE)|0, (py/CFG.TILE)|0)) return false;
  }
  return true;
}

// Clear a DESTRUCTIBLE tile (only shelves, per CFG.TILES) and kick up a dust puff.
// Non-destructible walls/pallets/pillars and the border are left intact.
export function destroyShelf(tx, ty){
  if (!isDestructible(tx, ty)) return;
  map[ty][tx] = CFG.TILE_FLOOR;
  const cx = (tx + 0.5) * CFG.TILE, cy = (ty + 0.5) * CFG.TILE;
  for (let p = 0; p < 6; p++){
    G.marks.push({
      x: cx + (Math.random()-0.5)*22,
      y: cy + (Math.random()-0.5)*22,
      life: 1, kind:"debris", size: 6 + Math.random()*5,
    });
  }
}

export function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
