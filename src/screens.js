/* =========================================================================
   screens.js — HUD overlay + full-screen states.

   drawHUD (HP bar, active power-up pills, score, level + enemy-type banner) and
   the title / level-clear / game-over screens, plus the keyboard-fire legend
   shown on the title. All draw in screen space (no camera transform).
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";
import { G, levelType } from "./state.js";
import { POWERUPS, POWERUP_KEYS } from "./config.js";
import { COL } from "./palette.js";
import { getLevelAchievementSummary, getLifetimeAchievements } from "./achievements.js";

/* ---- HUD + screens ------------------------------------------------------ */
export function drawHUD(){
  // HP bar
  const pad = 16, barW = 220, barH = 18;
  ctx.fillStyle = "#0c0e12";
  ctx.fillRect(pad-3, pad-3, barW+6, barH+6);
  ctx.fillStyle = "#331210";
  ctx.fillRect(pad, pad, barW, barH);
  const frac = Math.max(0, G.dan.hp / G.dan.maxHp);
  const grad = ctx.createLinearGradient(pad, 0, pad+barW, 0);
  grad.addColorStop(0, "#ff5b4d");
  grad.addColorStop(1, "#ffb627");
  ctx.fillStyle = grad;
  ctx.fillRect(pad, pad, barW * frac, barH);
  ctx.strokeStyle = "#000"; ctx.lineWidth = 1;
  ctx.strokeRect(pad+0.5, pad+0.5, barW-1, barH-1);

  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.fillStyle = COL.text;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("HP " + Math.max(0, G.dan.hp) + " / " + G.dan.maxHp, pad + 6, pad + barH/2 + 1);

  // Active power-up counters (remaining enhanced shots), stacked below HP.
  let py = pad + barH + 8;
  for (const key of POWERUP_KEYS){
    const n = G.powerups[key];
    if (n <= 0) continue;
    const def = POWERUPS[key];
    const pw = 132, ph = 16;
    ctx.fillStyle = "#0c0e12";
    ctx.fillRect(pad, py, pw, ph);
    // color chip
    ctx.fillStyle = def.color;
    ctx.fillRect(pad + 2, py + 2, 12, ph - 4);
    ctx.fillStyle = "#11141a";
    ctx.font = "bold 10px 'Arial Black', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(def.glyph, pad + 8, py + ph/2 + 1);
    // label + count
    ctx.fillStyle = def.color;
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText(def.label, pad + 20, py + ph/2 + 1);
    ctx.fillStyle = COL.text;
    ctx.textAlign = "right";
    ctx.fillText("x" + n, pad + pw - 6, py + ph/2 + 1);
    py += ph + 4;
  }

  // Atomic Dustbin special carried? (GDD 5) — a green pill prompting the deploy key.
  if (G.dan.hasDustbin){
    const pw = 132, ph = 16;
    ctx.fillStyle = "#0c0e12";
    ctx.fillRect(pad, py, pw, ph);
    ctx.fillStyle = COL.atomic;
    ctx.fillRect(pad + 2, py + 2, 12, ph - 4);
    ctx.fillStyle = "#11141a";
    ctx.font = "bold 11px 'Arial Black', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("☢", pad + 8, py + ph/2 + 1);
    ctx.fillStyle = COL.atomic;
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.textAlign = "left";
    ctx.fillText("DUSTBIN", pad + 20, py + ph/2 + 1);
    ctx.fillStyle = COL.text;
    ctx.textAlign = "right";
    ctx.fillText("[E]", pad + pw - 6, py + ph/2 + 1);
    py += ph + 4;
  }

  // Score
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText(String(G.score).padStart(6, "0"), VIEW_W - pad, pad + 18);
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("SCORE", VIEW_W - pad, pad + 34);

  // Level + current enemy type (top center)
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = "bold 16px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  const typeName = { picker:"PICKER BOT", forklift:"FORKLIFT BOT", security:"SECURITY BOT", sorter:"SORTER BOT", cleaner:"CLEANER BOT", drone:"DRONE", manager:"MANAGER BOT", scanner:"SCANNER BOT", inventory:"INVENTORY BOT", mixed:"ALL UNITS" }[levelType()] || "";
  ctx.fillText("LEVEL " + G.level + "  ·  " + typeName, VIEW_W/2, pad + 14);

  // Workers rescued this level (GDD 7). Total = rescued + still-present.
  const total = G.rescued + G.workers.length;
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = G.rescued === total && total > 0 ? COL.atomic : "#aeb6c0";
  ctx.fillText("WORKERS  " + G.rescued + " / " + total + " RESCUED", VIEW_W/2, pad + 30);
}

export function drawLevelClear(){
  // When the level produced achievement progress, the modal replaces the normal
  // level-clear splash and intercepts the advance until the player hits Continue.
  if (G._showAchievementModal){ drawPostLevelModal(); return; }

  ctx.fillStyle = "rgba(8,12,9,0.72)";
  ctx.fillRect(0,0,VIEW_W,VIEW_H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  ctx.font = "bold 50px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.atomic;
  ctx.fillText("LEVEL CLEARED", VIEW_W/2, VIEW_H/2 - 28);

  ctx.font = "bold 26px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  ctx.fillText("ENTERING LEVEL " + (G.level + 1), VIEW_W/2, VIEW_H/2 + 26);

  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.fillStyle = "#aeb6c0";
  ctx.fillText("HP & POWER-UPS CARRY OVER", VIEW_W/2, VIEW_H/2 + 60);
}

// Post-level achievement modal (Phase 6). Lists every achievement that advanced
// this level (getLevelAchievementSummary) with name, description, n / target, and
// a "NEW!" badge for newly-unlocked tiers/weeklies. Footer offers Continue and
// View All Achievements. Input is handled by pollModals (input.js); this only draws.
function drawPostLevelModal(){
  const data = getLevelAchievementSummary();

  // dim backdrop
  ctx.fillStyle = "rgba(6,9,12,0.84)";
  ctx.fillRect(0,0,VIEW_W,VIEW_H);

  const PW = Math.min(560, VIEW_W - 80);
  const rows = Math.min(data.length, 6);          // cap visible rows
  const PH = 120 + rows * 46 + 64;
  const px = (VIEW_W - PW) / 2, py = (VIEW_H - PH) / 2;

  // panel
  ctx.fillStyle = "#11151c";
  ctx.fillRect(px, py, PW, PH);
  ctx.strokeStyle = COL.atomic; ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, PW - 2, PH - 2);

  // header
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = "bold 26px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.atomic;
  ctx.fillText("Achievement Progress", VIEW_W/2, py + 42);

  // list
  ctx.textAlign = "left";
  let y = py + 84;
  for (let i = 0; i < rows; i++){
    const e = data[i];
    // name + NEW! badge
    ctx.font = "bold 15px 'Courier New', monospace";
    ctx.fillStyle = "#e8ebef";
    ctx.fillText(e.name, px + 24, y);
    if (e.isNew){
      const nx = px + 24 + ctx.measureText(e.name).width + 10;
      ctx.font = "bold 11px 'Arial Black', sans-serif";
      ctx.fillStyle = "#11151c";
      const bw = 38;
      ctx.fillStyle = COL.amber;
      ctx.fillRect(nx, y - 12, bw, 16);
      ctx.fillStyle = "#11151c";
      ctx.textAlign = "center";
      ctx.fillText("NEW!", nx + bw/2, y + 1);
      ctx.textAlign = "left";
    }
    // progress n / target, right-aligned
    ctx.textAlign = "right";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillStyle = GOLD;
    ctx.fillText(`${e.progress} / ${e.target}`, px + PW - 24, y);
    ctx.textAlign = "left";
    // description
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = "#8b94a0";
    ctx.fillText(e.description || "", px + 24, y + 16);
    y += 46;
  }

  // footer buttons
  const fy = py + PH - 30;
  const contLabel = G.inputMode === "gamepad" ? "START — CONTINUE" : "SPACE / ENTER — CONTINUE";
  const viewLabel = G.inputMode === "gamepad" ? "X — VIEW ALL ACHIEVEMENTS" : "V — VIEW ALL ACHIEVEMENTS";
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = COL.soap;
  ctx.fillText("▸ " + contLabel, px + 24, fy);
  ctx.textAlign = "right";
  ctx.fillStyle = "#9aa3ae";
  ctx.fillText(viewLabel + " ◂", px + PW - 24, fy);
  ctx.textBaseline = "alphabetic";
}

export const GOLD = "#ffd24a";

// Compact 3x3 reference of the keyboard fire layout (GDD §4.3): O/P/L/K cardinals,
// diagonals = two adjacent cardinals held. Corners show the combo, center is empty.
export function drawFireLegend(ox, oy){
  const cell = 36, gap = 4;
  const labels = [
    ["O+K","↖"], ["O","↑"],   ["O+;","↗"],
    ["K","←"],   ["·","·"],   [";","→"],
    ["L+K","↙"], ["L","↓"],   ["L+;","↘"],
  ];
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#9aa3ae";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillText("KEYBOARD FIRE", ox + (cell*3 + gap*2)/2, oy - 12);

  for (let i = 0; i < 9; i++){
    const r = (i/3)|0, c = i%3;
    const x = ox + c*(cell+gap), y = oy + r*(cell+gap);
    const center = (i === 4);
    ctx.fillStyle = center ? "#15181f" : "#232a34";
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = center ? "#3a4250" : COL.soap;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    ctx.fillStyle = center ? "#5a636f" : "#dfe6ee";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillText(labels[i][0], x + cell/2, y + cell/2 - 6);
    ctx.fillStyle = center ? "#5a636f" : COL.amber;
    ctx.font = "bold 12px 'Arial', sans-serif";
    ctx.fillText(labels[i][1], x + cell/2, y + cell/2 + 8);
  }
}

// Lifetime achievements modal (Phase 6). Full registry grouped by category in
// ACHIEVEMENTS.md order, each row showing name, a 5-badge tier row (greyed until
// earned), a progress bar toward the next tier, and a short description. Scrollable
// via G._lifetimeScrollY (driven by pollModals). Overlays title or post-level.
const TIER_BADGES = ['🥉','🥈','🥇','🏆','💎'];
export function drawLifetimeModal(){
  const groups = getLifetimeAchievements();

  // full-screen dim
  ctx.fillStyle = "rgba(4,6,9,0.9)";
  ctx.fillRect(0,0,VIEW_W,VIEW_H);

  const MW = Math.min(720, VIEW_W - 48);
  const mx = (VIEW_W - MW) / 2;
  const top = 24, bottom = VIEW_H - 24;
  const MH = bottom - top;

  // panel frame
  ctx.fillStyle = "#0e1218";
  ctx.fillRect(mx, top, MW, MH);
  ctx.strokeStyle = COL.soap; ctx.lineWidth = 2;
  ctx.strokeRect(mx + 1, top + 1, MW - 2, MH - 2);

  // header (outside the clip)
  const headerH = 40;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.atomic;
  ctx.fillText("ALL ACHIEVEMENTS", VIEW_W/2, top + headerH/2 + 2);

  // dismiss hint (footer, outside the clip)
  const footerH = 26;
  const backLabel = G.inputMode === "gamepad" ? "B — BACK"
                  : "ESC / BACKSPACE — BACK";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#9aa3ae";
  ctx.fillText(backLabel + "      ↑ / ↓ SCROLL", VIEW_W/2, bottom - footerH/2);

  // scroll viewport
  const vpTop = top + headerH, vpBottom = bottom - footerH;
  const vpH = vpBottom - vpTop;
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx + 2, vpTop, MW - 4, vpH);
  ctx.clip();

  const colX = mx + 24;
  const colW = MW - 48;
  const scroll = G._lifetimeScrollY;
  let y = vpTop - scroll + 8;
  const lineTop = y;   // remember start to measure content height

  ctx.textBaseline = "alphabetic";
  for (const g of groups){
    // category header
    ctx.textAlign = "left";
    ctx.font = "bold 15px 'Arial Black', sans-serif";
    ctx.fillStyle = COL.amber;
    ctx.fillText(`${g.emoji} ${g.name}`, colX, y + 14);
    y += 30;

    for (const a of g.achievements){
      // name
      ctx.font = "bold 13px 'Courier New', monospace";
      ctx.fillStyle = a.hidden && a.tier === 0 ? "#5a636f" : "#e8ebef";
      ctx.fillText(a.name, colX, y + 12);

      // 5-tier badge row (greyed until earned), right-aligned
      ctx.textAlign = "right";
      ctx.font = "13px 'Arial', sans-serif";
      let bx = colX + colW;
      for (let t = TIER_BADGES.length - 1; t >= 0; t--){
        const earned = a.tier > t;
        ctx.globalAlpha = earned ? 1 : 0.22;
        ctx.fillText(TIER_BADGES[t], bx, y + 12);
        bx -= 22;
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";

      // progress bar toward the next tier
      const barY = y + 20, barW = colW, barH = 5;
      ctx.fillStyle = "#1d232c";
      ctx.fillRect(colX, barY, barW, barH);
      const target = a.nextTarget || 1;
      const frac = a.tier >= 5 ? 1 : Math.max(0, Math.min(1, a.progress / target));
      ctx.fillStyle = a.tier >= 5 ? GOLD : COL.atomic;
      ctx.fillRect(colX, barY, barW * frac, barH);

      // description + progress count
      ctx.font = "10px 'Courier New', monospace";
      ctx.fillStyle = "#727b86";
      ctx.fillText(a.description || "", colX, y + 38);
      ctx.textAlign = "right";
      ctx.fillStyle = "#8b94a0";
      const count = a.tier >= 5 ? "MAX" : `${a.progress} / ${target}`;
      ctx.fillText(count, colX + colW, y + 38);
      ctx.textAlign = "left";

      y += 48;
    }
    y += 10;
  }

  ctx.restore();

  // record max scroll for pollModals to clamp against next frame
  const contentH = (y + scroll) - lineTop;     // undo the scroll offset for true height
  G._lifetimeMaxScroll = Math.max(0, contentH - vpH);
}

export function drawGameOver(){
  ctx.fillStyle = "rgba(8,10,14,0.78)";
  ctx.fillRect(0,0,VIEW_W,VIEW_H);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  ctx.font = "bold 60px 'Arial Black', sans-serif";
  ctx.fillStyle = "#ff5b4d";
  ctx.fillText("DAN IS DOWN", VIEW_W/2, VIEW_H/2 - 50);

  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("SCORE  " + String(G.score).padStart(6,"0"), VIEW_W/2, VIEW_H/2 + 14);
  ctx.fillStyle = COL.amber;
  ctx.fillText("BEST   " + String(G.high).padStart(6,"0"), VIEW_W/2, VIEW_H/2 + 46);

  // Continue prompt reflects the active mode (GDD §4.5) — the opposing device is inert.
  const blink = (Math.floor(performance.now()/500)%2)===0;
  if (blink){
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px 'Courier New', monospace";
    const prompt = G.inputMode === "gamepad"
      ? "PRESS A / START to TRY AGAIN"
      : "CLICK or PRESS SPACE to TRY AGAIN";
    ctx.fillText(prompt, VIEW_W/2, VIEW_H/2 + 100);
  }
}
