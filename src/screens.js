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

export function drawTitle(){
  // dim warehouse backdrop
  ctx.fillStyle = "#15181f";
  ctx.fillRect(0,0,VIEW_W,VIEW_H);
  ctx.fillStyle = "#1c2129";
  for (let y=0; y<VIEW_H; y+=48) for (let x=0; x<VIEW_W; x+=48)
    if (((x+y)/48)&1) ctx.fillRect(x,y,48,48);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // ATOMIC — atomic green
  ctx.font = "bold 64px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.atomic;
  ctx.fillText("ATOMIC", VIEW_W/2, VIEW_H/2 - 86);
  // DUSTBIN — amber
  ctx.fillStyle = COL.amber;
  ctx.fillText("DUSTBIN", VIEW_W/2, VIEW_H/2 - 22);
  // DAN — soap, oversized
  ctx.font = "bold 92px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("DAN", VIEW_W/2, VIEW_H/2 + 56);

  ctx.font = "bold 14px 'Courier New', monospace";
  ctx.fillStyle = "#aeb6c0";
  ctx.fillText("THE ROBOTS HAVE TURNED. GRAB YOUR MOP.", VIEW_W/2, VIEW_H/2 + 122);

  // Both input modes offered; the player's first valid input locks the mode (GDD §4.5).
  const blink = (Math.floor(performance.now()/500)%2)===0;
  if (blink){
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.fillStyle = COL.soap;
    ctx.fillText("SPACE — KEYBOARD", VIEW_W/2, VIEW_H/2 + 150);
    ctx.fillStyle = COL.atomic;
    ctx.fillText("A / START — GAMEPAD", VIEW_W/2, VIEW_H/2 + 174);
  }
  if (G.high > 0){
    ctx.fillStyle = "#6f7884";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillText("HIGH SCORE  " + String(G.high).padStart(6,"0"), VIEW_W/2, VIEW_H - 22);
  }

  drawFireLegend(28, VIEW_H - 150);
}

// Compact 3x3 reference of the keyboard fire layout (GDD §4.3): O/P/L/K cardinals,
// diagonals = two adjacent cardinals held. Corners show the combo, center is empty.
function drawFireLegend(ox, oy){
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
