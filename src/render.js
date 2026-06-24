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
import { isWall, clamp, pushAt } from "./world.js";
import { drawEnemies, drawEbolts } from "./render-entities.js";
import { drawHUD, drawTitle, drawLevelClear, drawGameOver } from "./screens.js";

/* ---- Render ------------------------------------------------------------- */
export function render(){
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);

  if (G.state === "title"){ drawTitle(); return; }

  ctx.save();
  ctx.translate(-Math.round(G.camera.x), -Math.round(G.camera.y));

  drawFloor();
  drawConveyors();
  drawWalls();
  drawMarks();
  drawExit();
  drawVending();
  drawDustbins();
  drawTerminals();
  drawPickups();
  drawWorkers();
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
      if (isWall(tx, ty)) continue;
      ctx.fillStyle = ((tx + ty) & 1) ? COL.floorA : COL.floorB;
      ctx.fillRect(tx*T, ty*T, T, T);
      ctx.strokeStyle = COL.grid;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx*T + 0.5, ty*T + 0.5, T-1, T-1);
    }
  }
}

// Conveyor belts (§8.1.2): any floor cell with a non-zero baked push vector is a
// belt. Drawn as a dark rubber band over the floor with bright chevrons scrolling
// in the push direction (a dash-style marquee), so the direction is readable at a
// glance and the scroll speed tracks the belt's strength. At an INTERSECTION the
// baked vector is already the diagonal sum, so the single resultant chevron set
// points diagonally — the crossing reads as "both directions" with no special case.
function drawConveyors(){
  const T = CFG.TILE;
  const t = performance.now() * 0.001;
  const x0 = Math.floor(G.camera.x / T), x1 = Math.ceil((G.camera.x + VIEW_W) / T);
  const y0 = Math.floor(G.camera.y / T), y1 = Math.ceil((G.camera.y + VIEW_H) / T);
  for (let ty = y0; ty < y1; ty++){
    for (let tx = x0; tx < x1; tx++){
      if (tx<0||ty<0||tx>=CFG.COLS||ty>=CFG.ROWS) continue;
      if (isWall(tx, ty)) continue;
      const p = pushAt(tx, ty);
      if (p.dx === 0 && p.dy === 0) continue;
      const mag = Math.hypot(p.dx, p.dy);
      const ang = Math.atan2(p.dy, p.dx);
      const px = tx*T, py = ty*T;

      // rubber band base + side rails (rails run perpendicular to motion)
      ctx.fillStyle = COL.beltBase;
      ctx.fillRect(px, py, T, T);

      ctx.save();
      ctx.beginPath(); ctx.rect(px, py, T, T); ctx.clip();   // keep chevrons inside the tile
      ctx.translate(px + T/2, py + T/2);
      ctx.rotate(ang);                                       // +x now points down-belt

      // side rails along the belt edges
      ctx.fillStyle = COL.beltRail;
      ctx.fillRect(-T, -T/2, T*2, 3);
      ctx.fillRect(-T,  T/2 - 3, T*2, 3);

      // scrolling chevrons (a marquee of ">" pointing down-belt). Scroll offset
      // advances with time * belt magnitude, so a stronger belt visibly runs faster.
      const period = 13;
      const scroll = ((t * mag) % period + period) % period;
      ctx.strokeStyle = COL.beltArrow;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let cx = -T - period + scroll; cx < T + period; cx += period){
        ctx.beginPath();
        ctx.moveTo(cx - 4, -5);
        ctx.lineTo(cx + 2, 0);
        ctx.lineTo(cx - 4, 5);
        ctx.stroke();
      }
      ctx.restore();
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
      if (!isWall(tx, ty)) continue;
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

// Vending machines (GDD 2.5): a flush-against-wall cabinet with a lit display.
// Active = colored glow (green small / blue large); depleted = dark/static, glow
// extinguished, left as a landmark. Cabinet long-axis runs parallel to its wall.
function drawVending(){
  for (const m of G.vending){
    const def = CFG.VENDING[m.variant];
    const vertical = m.dy !== 0;                 // wall above/below -> breadth horizontal
    const bw = vertical ? def.breadth : def.depth;
    const bh = vertical ? def.depth : def.breadth;
    const glowCol = m.variant === "large" ? COL.vendLarge : COL.vendSmall;
    const baseGlow = m.variant === "large" ? 0.55 : 0.32;   // large unit glows brighter
    const pulse = 0.5 + 0.5 * Math.sin(m.glow);

    // ambient floor glow + dispense flash (only while active)
    if (!m.depleted){
      const a = (baseGlow * (0.5 + 0.5*pulse)) + (m.flash > 0 ? m.flash * 1.5 : 0);
      ctx.globalAlpha = Math.min(0.6, a);
      ctx.fillStyle = glowCol;
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(bw, bh) * 0.75, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // cabinet body
    ctx.fillStyle = m.flash > 0 ? "#ffffff" : COL.vendBody;
    ctx.fillRect(m.x - bw/2, m.y - bh/2, bw, bh);
    ctx.strokeStyle = COL.vendDark;
    ctx.lineWidth = 2;
    ctx.strokeRect(m.x - bw/2 + 1, m.y - bh/2 + 1, bw - 2, bh - 2);

    // lit display screen, inset
    const pad = 4;
    ctx.fillStyle = m.depleted ? COL.vendDepleted
                  : m.flash > 0 ? "#ffffff" : glowCol;
    ctx.globalAlpha = m.depleted ? 1 : (0.55 + 0.45 * pulse);
    ctx.fillRect(m.x - bw/2 + pad, m.y - bh/2 + pad, bw - pad*2, bh*0.5 - pad);
    ctx.globalAlpha = 1;

    // dispensing slot at the base
    ctx.fillStyle = COL.vendDark;
    ctx.fillRect(m.x - bw/2 + pad, m.y + bh/2 - pad - 3, bw - pad*2, 3);

    // depleted units show a dim "static" cross-out on the dark screen
    if (m.depleted){
      ctx.strokeStyle = "rgba(120,130,145,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.x - bw/2 + pad, m.y - bh/2 + pad);
      ctx.lineTo(m.x + bw/2 - pad, m.y - bh/2 + bh*0.5 - pad);
      ctx.stroke();
    }
  }
}

// Atomic Dustbin special (GDD 5): glowing-green floor pickups + the one active
// deployed dustbin (sliding canister, or an open vortex during the attract phase).
function drawDustbins(){
  const t = performance.now() * 0.001;

  // Floor pickups — spinning, bobbing, glowing green.
  for (const p of G.dustbinPickups){
    const y = p.y + Math.sin(p.bob) * 3;
    const glow = 0.5 + 0.5 * Math.sin(p.bob * 2);
    ctx.globalAlpha = 0.22 + 0.18 * glow;
    ctx.fillStyle = COL.atomic;
    ctx.beginPath();
    ctx.arc(p.x, y, p.r + 8, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawDustbinCan(p.x, y, p.r, p.spin, true);
  }

  const b = G.dustbin;
  if (!b) return;

  if (b.state === "attract"){
    // Faint pull-radius ring so the player reads the danger zone.
    ctx.strokeStyle = "rgba(93,255,143,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, CFG.DUSTBIN.attractRadius, 0, Math.PI*2);
    ctx.stroke();

    // Swirling vortex: arms spiralling inward, accelerating as detonation nears.
    const urgency = 1 - b.timer / CFG.DUSTBIN.attractDur;     // 0 -> 1
    const spin = t * (3 + urgency * 9);
    ctx.save();
    ctx.translate(b.x, b.y);
    for (let arm = 0; arm < 4; arm++){
      ctx.strokeStyle = "rgba(93,255,143," + (0.35 + 0.4*urgency).toFixed(2) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let s = 0; s <= 1; s += 0.1){
        const rr = CFG.DUSTBIN.attractRadius * 0.85 * (1 - s);
        const aa = spin + arm * Math.PI/2 + s * 5;
        const px = Math.cos(aa) * rr, py = Math.sin(aa) * rr;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Bright pulsing core at the mouth of the open bin.
    const pulse = 0.5 + 0.5 * Math.sin(t * (8 + urgency * 16));
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.fillStyle = "#dfffe8";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * (0.5 + 0.3*pulse), 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawDustbinCan(b.x, b.y, b.r, b.spin, true, true);
  } else {
    // Sliding / settling — a thrown canister tumbling across the floor.
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = COL.atomic;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawDustbinCan(b.x, b.y, b.r, b.spin, true);
  }
}

// A small radioactive trash canister. `lit` = green glow accents; `open` lifts the
// lid (attract phase). Rotated by `spin` so it reads as spinning/tumbling.
function drawDustbinCan(x, y, r, spin, lit, open){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(spin) * 0.25);          // gentle wobble rather than full spin
  const w = r * 1.5, h = r * 1.8;
  // body
  ctx.fillStyle = "#1d3a28";
  ctx.fillRect(-w/2, -h/2, w, h);
  ctx.strokeStyle = lit ? COL.atomic : "#2a4a36";
  ctx.lineWidth = 2;
  ctx.strokeRect(-w/2 + 1, -h/2 + 1, w - 2, h - 2);
  // hazard band
  ctx.fillStyle = lit ? COL.atomic : "#3a6a4a";
  ctx.fillRect(-w/2, -h*0.12, w, h*0.24);
  // radioactive trefoil (three wedges around a hub) on the band
  ctx.fillStyle = "#0c130d";
  for (let i = 0; i < 3; i++){
    const a = i * (Math.PI*2/3) - Math.PI/2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r*0.42, a - 0.45, a + 0.45);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(0, 0, r*0.14, 0, Math.PI*2); ctx.fill();
  // lid (lifted + ajar while open/attracting)
  ctx.fillStyle = "#2a4a36";
  const lidY = open ? -h/2 - r*0.55 : -h/2 - 2;
  ctx.fillRect(-w*0.6, lidY, w*1.2, r*0.35);
  ctx.restore();
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
    } else if (m.kind === "blast"){
      // Atomic Dustbin detonation: a bright shockwave ring flashing out to blastRadius.
      const progress = 1 - m.life / 1.5;            // 0 at detonation -> 1 at end
      const rad = progress * CFG.DUSTBIN.blastRadius;
      // filled flash core, fading fast
      ctx.fillStyle = "rgba(93,255,143," + (m.life / 1.5 * 0.30).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(1, rad), 0, Math.PI*2);
      ctx.fill();
      // leading shock ring
      ctx.strokeStyle = "rgba(220,255,235," + (m.life / 1.5 * 0.9).toFixed(2) + ")";
      ctx.lineWidth = 6 - progress * 4;
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

// Human workers to rescue (GDD 7): a small hi-vis figure — clearly NOT a robot.
// Bobs as it walks; leans in its travel direction and shows alarm dashes when
// fleeing a nearby robot.
function drawWorkers(){
  for (const w of G.workers){
    const bobY = Math.sin(w.bob) * 1.6;
    const x = w.x, y = w.y + bobY, r = w.r;

    // panic marks above the head while fleeing
    if (w.fleeing){
      ctx.fillStyle = COL.chargeWarn;
      ctx.font = "bold 10px 'Arial Black', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("!", x, y - r * 2.1);
    }

    // legs
    ctx.strokeStyle = "#22303a";
    ctx.lineWidth = 2;
    const stride = Math.sin(w.bob) * r * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - r*0.3, y + r*0.4); ctx.lineTo(x - r*0.3 + stride, y + r*1.1);
    ctx.moveTo(x + r*0.3, y + r*0.4); ctx.lineTo(x + r*0.3 - stride, y + r*1.1);
    ctx.stroke();
    // torso (coveralls) + hi-vis vest
    ctx.fillStyle = COL.workerBody;
    ctx.fillRect(x - r*0.6, y - r*0.4, r*1.2, r*0.95);
    ctx.fillStyle = COL.workerVest;
    ctx.fillRect(x - r*0.45, y - r*0.35, r*0.9, r*0.8);
    ctx.fillStyle = COL.workerVestDark;
    ctx.fillRect(x - r*0.08, y - r*0.35, r*0.16, r*0.8);   // vest seam
    // head + hard hat
    ctx.fillStyle = COL.workerSkin;
    ctx.beginPath(); ctx.arc(x, y - r*0.7, r*0.42, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = COL.workerHelmet;
    ctx.beginPath(); ctx.arc(x, y - r*0.8, r*0.46, Math.PI, 0); ctx.fill();
    ctx.fillRect(x - r*0.5, y - r*0.82, r, r*0.12);        // hat brim
    // outline
    ctx.strokeStyle = "#15202a";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - r*0.6, y - r*0.4, r*1.2, r*0.95);
  }
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

  // Carried Atomic Dustbin (GDD 5): a small glowing canister bobbing over his head.
  if (G.dan.hasDustbin){
    const by = -G.dan.r - 9 + Math.sin(performance.now() * 0.005) * 1.5;
    ctx.fillStyle = "rgba(93,255,143,0.35)";
    ctx.beginPath(); ctx.arc(0, by, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1d3a28";
    ctx.fillRect(-4, by - 4, 8, 9);
    ctx.fillStyle = COL.atomic;
    ctx.fillRect(-4, by - 1, 8, 2);
    ctx.strokeStyle = COL.atomic;
    ctx.lineWidth = 1;
    ctx.strokeRect(-4, by - 4, 8, 9);
  }

  ctx.restore();
}
