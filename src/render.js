/* =========================================================================
   render.js — the frame compositor + world/entity draws.

   render() lays down the world under the camera transform (floor, walls, marks,
   exit, terminals, pickups, shots, enemies, ebolts, Dan, floats), then the
   screen-space overlays (exit pointer + HUD + state screens). The enemy/ebolt
   sprites live in render-entities.js; the HUD/title/end screens in screens.js.
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";
import { G } from "./state.js";
import { CFG, POWERUPS } from "./config.js";
import { COL, TERMINAL_TINT } from "./palette.js";
import { map, clamp } from "./world.js";
import { drawEnemies, drawEbolts } from "./render-entities.js";
import { drawHUD, drawTitle, drawLevelClear, drawGameOver } from "./screens.js";

/* ---- Render ------------------------------------------------------------- */
export function render(){
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  if (G.state === "title"){ drawTitle(); return; }

  ctx.save();
  ctx.translate(-Math.round(G.camera.x), -Math.round(G.camera.y));

  drawFloor();
  drawWalls();
  drawMarks();
  drawExit();
  drawTerminals();
  drawPickups();
  drawShots();
  drawEnemies();
  drawEbolts();
  drawDan();
  drawFloats();

  ctx.restore();

  if (G.state === "playing") drawExitPointer();
  drawHUD();
  if (G.state === "levelclear") drawLevelClear();
  if (G.state === "dead") drawGameOver();
}

// Glowing EXIT door — the level-end goal (GDD 8.1/8.2).
function drawExit(){
  const e = G.exit;
  const glow = 0.5 + 0.5 * Math.sin(e.pulse);
  // floor glow
  ctx.fillStyle = "rgba(93,255,143," + (0.12 + 0.10*glow).toFixed(3) + ")";
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r + 12, 0, Math.PI*2);
  ctx.fill();
  // door frame
  const w = 34, h = 40;
  ctx.fillStyle = "#1a2a1e";
  ctx.fillRect(e.x - w/2, e.y - h/2, w, h);
  ctx.strokeStyle = COL.atomic;
  ctx.lineWidth = 2;
  ctx.strokeRect(e.x - w/2 + 1, e.y - h/2 + 1, w - 2, h - 2);
  // open doorway
  ctx.fillStyle = "#0c130d";
  ctx.fillRect(e.x - w/2 + 5, e.y - h/2 + 6, w - 10, h - 11);
  // EXIT sign
  ctx.fillStyle = COL.atomic;
  ctx.globalAlpha = 0.7 + 0.3*glow;
  ctx.fillRect(e.x - 13, e.y - h/2 - 8, 26, 9);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0c130d";
  ctx.font = "bold 8px 'Arial Black', sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("EXIT", e.x, e.y - h/2 - 3);
  // downward arrow inside
  ctx.fillStyle = COL.atomic;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y + 6);
  ctx.lineTo(e.x - 6, e.y - 2);
  ctx.lineTo(e.x + 6, e.y - 2);
  ctx.closePath();
  ctx.fill();
}

// Edge arrow pointing toward the exit when it's off-screen.
function drawExitPointer(){
  const sx = G.exit.x - G.camera.x, sy = G.exit.y - G.camera.y;
  const margin = 26;
  if (sx >= margin && sx <= VIEW_W - margin && sy >= margin && sy <= VIEW_H - margin) return;
  const cx = VIEW_W/2, cy = VIEW_H/2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const px = clamp(sx, margin, VIEW_W - margin);
  const py = clamp(sy, margin, VIEW_H - margin);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.fillStyle = COL.atomic;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = COL.atomic;
  ctx.font = "bold 9px 'Courier New', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("EXIT", clamp(sx, margin, VIEW_W - margin), clamp(sy, margin, VIEW_H - margin) + 16);
}

function drawFloor(){
  const T = CFG.TILE;
  const x0 = Math.floor(G.camera.x / T), x1 = Math.ceil((G.camera.x + VIEW_W) / T);
  const y0 = Math.floor(G.camera.y / T), y1 = Math.ceil((G.camera.y + VIEW_H) / T);
  for (let ty = y0; ty < y1; ty++){
    for (let tx = x0; tx < x1; tx++){
      if (tx<0||ty<0||tx>=CFG.COLS||ty>=CFG.ROWS) continue;
      if (map[ty][tx] === 1) continue;
      ctx.fillStyle = ((tx + ty) & 1) ? COL.floorA : COL.floorB;
      ctx.fillRect(tx*T, ty*T, T, T);
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx*T + 0.5, ty*T + 0.5, T-1, T-1);
    }
  }
}

function drawWalls(){
  const T = CFG.TILE;
  const x0 = Math.floor(G.camera.x / T), x1 = Math.ceil((G.camera.x + VIEW_W) / T);
  const y0 = Math.floor(G.camera.y / T), y1 = Math.ceil((G.camera.y + VIEW_H) / T);
  for (let ty = y0; ty < y1; ty++){
    for (let tx = x0; tx < x1; tx++){
      if (tx<0||ty<0||tx>=CFG.COLS||ty>=CFG.ROWS) continue;
      if (map[ty][tx] !== 1) continue;
      const px = tx*T, py = ty*T;
      // steel base
      ctx.fillStyle = COL.steel;
      ctx.fillRect(px, py, T, T);
      // cardboard box stack on top
      ctx.fillStyle = COL.shelfSide;
      ctx.fillRect(px+2, py+2, T-4, T-4);
      ctx.fillStyle = COL.shelfTop;
      ctx.fillRect(px+2, py+2, T-4, (T-4)*0.6);
      ctx.strokeStyle = COL.shelfEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(px+2.5, py+2.5, T-5, T-5);
      // tape seam
      ctx.fillStyle = COL.shelfEdge;
      ctx.fillRect(px + T/2 - 1, py+2, 2, T-4);
    }
  }
}

function drawTerminals(){
  for (const t of G.terminals){
    const glow = 0.5 + 0.5 * Math.sin(t.pulse);
    const flash = t.hitFlash > 0;
    const emit = t.spawnFlash > 0;
    const tint = TERMINAL_TINT[t.type] || COL.terminalLit;
    ctx.fillStyle = flash ? "#ffffff" : COL.terminal;
    ctx.fillRect(t.x - 14, t.y - 14, 28, 28);
    ctx.strokeStyle = "#2a313c";
    ctx.lineWidth = 2;
    ctx.strokeRect(t.x - 14, t.y - 14, 28, 28);
    // emitter light — tinted to the enemy type this terminal produces
    ctx.fillStyle = emit ? "#ffffff" : tint;
    ctx.globalAlpha = emit ? 1 : (0.35 + 0.45 * glow);
    ctx.fillRect(t.x - 8, t.y - 8, 16, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0c0e12";
    ctx.fillRect(t.x - 9, t.y + 3, 18, 3);
    ctx.fillRect(t.x - 9, t.y + 7, 18, 2);
    // HP pips above (destroyable — GDD 6)
    for (let h = 0; h < CFG.TERMINAL.hp; h++){
      ctx.fillStyle = h < t.hp ? COL.atomic : "#2a313c";
      ctx.fillRect(t.x - 13 + h*7, t.y - 21, 5, 3);
    }
  }
}

function drawShots(){
  for (const s of G.shots){
    const wob = 1 + Math.sin(s.wob) * 0.12;
    // Triple Shot = opaque cleaning pod; base = translucent soap bubble.
    const fill = s.big ? "rgba(150,225,255,0.85)" : COL.bubbleFill;
    // soft glow
    ctx.fillStyle = s.big ? "rgba(120,210,255,0.45)" : COL.bubbleFill;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 1.6 * wob, 0, Math.PI*2);
    ctx.fill();
    // bubble / pod body
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * wob, 0, Math.PI*2);
    ctx.fill();
    // iridescent rim (violet tint when bouncing)
    ctx.strokeStyle = s.bounce ? "rgba(200,150,255,0.95)" : COL.bubbleRim;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // highlight
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(s.x - s.r*0.35, s.y - s.r*0.35, s.r*0.28, 0, Math.PI*2);
    ctx.fill();
  }
}

function drawMarks(){
  for (const m of G.marks){
    if (m.kind === "berserk"){
      // Expanding orange ring: Manager's on-death pulse made visible.
      const progress = 1 - m.life / 1.5;          // 0 at death -> 1 at end
      const rad = progress * 200;
      ctx.strokeStyle = "rgba(255,100,20," + (m.life / 1.5 * 0.75).toFixed(2) + ")";
      ctx.lineWidth = 4 - progress * 2.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(1, rad), 0, Math.PI*2);
      ctx.stroke();
    } else if (m.kind === "debris"){
      ctx.fillStyle = "rgba(150,108,60," + (0.7 * m.life).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(m.x, m.y, (m.size || 6) * (1.3 - m.life * 0.5), 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(150,220,255," + (0.35 * m.life).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 7 * (1.2 - m.life * 0.4), 0, Math.PI*2);
      ctx.fill();
    }
  }
}

function drawPickups(){
  for (const p of G.pickups){
    const def = POWERUPS[p.type];
    const bob = Math.sin(p.bob) * 3;
    const x = p.x, y = p.y + bob;
    // glow ring
    ctx.globalAlpha = 0.25 + 0.15 * (1 + Math.sin(p.bob*2));
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(x, y, p.r + 6, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // badge
    ctx.fillStyle = "#11141a";
    ctx.fillRect(x - p.r, y - p.r, p.r*2, p.r*2);
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - p.r + 1, y - p.r + 1, p.r*2 - 2, p.r*2 - 2);
    // glyph
    ctx.fillStyle = def.color;
    ctx.font = "bold 16px 'Arial Black', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(def.glyph, x, y + 1);
  }
}

function drawFloats(){
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 13px 'Arial Black', sans-serif";
  for (const f of G.floats){
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = "#000";
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}


function drawDan(){
  // Cleaner-slow aura: green ring + drips while the debuff is active.
  if (G.dan.slow > 0){
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = COL.spray;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(G.dan.x, G.dan.y, G.dan.r + 4, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = COL.sprayDark;
    for (let i = 0; i < 3; i++){
      const a = (G.dan.iframe + i) + performance.now() * 0.003 + i * 2.1;
      ctx.beginPath();
      ctx.arc(G.dan.x + Math.cos(a)*(G.dan.r+4), G.dan.y + Math.sin(a)*(G.dan.r+4), 1.8, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(G.dan.x, G.dan.y);

  // flash white briefly during i-frames
  const hurt = G.dan.iframe > 0 && (Math.floor(G.dan.iframe * 20) % 2 === 0);

  // mop / soap launcher pointing at cursor (drawn under body's near side)
  ctx.save();
  ctx.rotate(G.dan.angle);
  ctx.fillStyle = COL.danMop;
  ctx.fillRect(G.dan.r - 2, -3, 16, 6);          // launcher barrel
  ctx.fillStyle = COL.soap;
  ctx.fillRect(G.dan.r + 12, -2, 3, 4);          // nozzle tip
  ctx.restore();

  // body (coveralls)
  ctx.fillStyle = hurt ? "#ffffff" : COL.danBody;
  ctx.beginPath();
  ctx.arc(0, 0, G.dan.r, 0, Math.PI*2);
  ctx.fill();
  ctx.fillStyle = hurt ? "#ffffff" : COL.danTrim;
  ctx.beginPath();
  ctx.arc(0, 0, G.dan.r, Math.PI*0.15, Math.PI*0.85);
  ctx.fill();
  // head
  ctx.fillStyle = hurt ? "#ffffff" : COL.danSkin;
  ctx.beginPath();
  ctx.arc(0, -2, G.dan.r*0.5, 0, Math.PI*2);
  ctx.fill();
  // outline
  ctx.strokeStyle = "#0f2a47";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, G.dan.r, 0, Math.PI*2);
  ctx.stroke();

  ctx.restore();
}
