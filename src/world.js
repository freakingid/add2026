/* =========================================================================
   world.js — the tilemap plus all geometry/collision queries.

   `map` is an exported `let` reassigned ONLY here (in generateWarehouse), so
   importers get a live read-only view that stays current. Everything else is a
   pure-ish query over the map or a small math helper.
   ========================================================================= */
import { CFG } from "./config.js";
import { VIEW_W, VIEW_H } from "./canvas.js";
import { G } from "./state.js";

// map[y][x]: 0 floor, 1 wall (shelf)
export let map = [];

export function isWall(tx, ty){
  if (tx < 0 || ty < 0 || tx >= CFG.COLS || ty >= CFG.ROWS) return true;
  return map[ty][tx] === 1;
}

export function generateWarehouse(){
  map = [];
  for (let y = 0; y < CFG.ROWS; y++){
    const row = [];
    for (let x = 0; x < CFG.COLS; x++){
      // perimeter walls
      row.push((x===0||y===0||x===CFG.COLS-1||y===CFG.ROWS-1) ? 1 : 0);
    }
    map.push(row);
  }
  // Shelf rows: horizontal runs with aisle gaps — reads as a warehouse.
  for (let y = 4; y < CFG.ROWS - 3; y += 4){
    let x = 3;
    while (x < CFG.COLS - 3){
      const len = 3 + Math.floor(Math.random()*4);
      for (let i = 0; i < len && x < CFG.COLS - 3; i++, x++){
        map[y][x] = 1;
      }
      x += 2 + Math.floor(Math.random()*3); // aisle gap
    }
  }
  // Carve a clear spawn pocket in the middle for Dan.
  const cx = (CFG.COLS/2)|0, cy = (CFG.ROWS/2)|0;
  for (let y = cy-2; y <= cy+2; y++)
    for (let x = cx-2; x <= cx+2; x++)
      if (x>0&&y>0&&x<CFG.COLS-1&&y<CFG.ROWS-1) map[y][x] = 0;
}

export function randomFloorTile(minDistFromCenter){
  const cx = CFG.COLS/2, cy = CFG.ROWS/2;
  for (let tries = 0; tries < 400; tries++){
    const tx = 1 + ((Math.random()*(CFG.COLS-2))|0);
    const ty = 1 + ((Math.random()*(CFG.ROWS-2))|0);
    if (map[ty][tx] !== 0) continue;
    if (minDistFromCenter){
      const d = Math.hypot(tx-cx, ty-cy);
      if (d < minDistFromCenter) continue;
    }
    return { x:(tx+0.5)*CFG.TILE, y:(ty+0.5)*CFG.TILE };
  }
  return { x:VIEW_W, y:VIEW_H };
}

// ---- Tile helpers used by Cleaner patrol routing ----
export function tileFloor(tx, ty){
  return tx > 0 && ty > 0 && tx < CFG.COLS-1 && ty < CFG.ROWS-1 && map[ty][tx] === 0;
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

// Sample along the segment; blocked if any interior wall tile lies between.
export function hasLineOfSight(x0, y0, x1, y1){
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) / (CFG.TILE * 0.4));
  for (let s = 1; s < steps; s++){
    const t = s / steps;
    const px = x0 + dx*t, py = y0 + dy*t;
    if (isWall((px/CFG.TILE)|0, (py/CFG.TILE)|0)) return false;
  }
  return true;
}

// Clear an interior shelf tile and kick up a dust puff.
export function destroyShelf(tx, ty){
  if (isBorderTile(tx, ty) || !isWall(tx, ty)) return;
  map[ty][tx] = 0;
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
