/* =========================================================================
   screens-title.js — title screen + its sub-phases (mode select, load,
   playlist picker, weekly achievements panel). Split from screens.js.
   All draw in screen space (no camera transform).
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H, UI_SCALE } from "./canvas.js";
import { G } from "./state.js";
import { COL } from "./palette.js";
import { getWeeklyAchievements, getXP } from "./achievements.js";
import { listSaves } from "./savegame.js";
import { drawOptions } from "./optionsmenu.js";

// Shared title backdrop — the checkerboard warehouse floor behind all title phases.
function drawTitleBackdrop(){
  ctx.fillStyle = "#15181f";
  ctx.fillRect(0,0,VIEW_W,VIEW_H);
  ctx.fillStyle = "#1c2129";
  for (let y=0; y<VIEW_H; y+=48) for (let x=0; x<VIEW_W; x+=48)
    if (((x+y)/48)&1) ctx.fillRect(x,y,48,48);
}

// Shared title logo (ATOMIC / DUSTBIN / DAN).
function drawTitleLogo(yOffset){
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 64px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.atomic;
  ctx.fillText("ATOMIC", VIEW_W/2, VIEW_H/2 - 86 + yOffset);
  ctx.fillStyle = COL.amber;
  ctx.fillText("DUSTBIN", VIEW_W/2, VIEW_H/2 - 22 + yOffset);
  ctx.font = "bold 92px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("DAN", VIEW_W/2, VIEW_H/2 + 56 + yOffset);
}

export function drawTitle(){
  if (G._titlePhase === "options")  { drawOptions(); return; }
  if (G._titlePhase === "load")     { _drawTitleLoadScreen(); return; }
  if (G._titlePhase === "mode")     { drawTitleModeSelect(); return; }
  if (G._titlePhase === "playlist") { drawTitlePlaylistPicker(); return; }

  // --- "input" phase: device selection (original title screen) ---
  drawTitleBackdrop();

  const RAIL_W = 460 * UI_SCALE;
  const railX = VIEW_W - RAIL_W;
  const zoneW = VIEW_W - RAIL_W;
  const cx = zoneW / 2;

  // Vertical stack of left/center-zone items, gap 20*UI_SCALE between them.
  const GAP = 20 * UI_SCALE;
  let y = VIEW_H * 0.42;

  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // 1. Title (3 lines)
  const titleLH = 65 * UI_SCALE * 0.9;
  ctx.font = `bold ${65*UI_SCALE}px 'Arial Black', sans-serif`;
  ctx.fillStyle = COL.atomic;
  ctx.fillText("ATOMIC", cx, y);
  y += titleLH;
  ctx.fillStyle = COL.amber;
  ctx.fillText("DUSTBIN", cx, y);
  y += titleLH;
  ctx.fillStyle = COL.soap;
  ctx.fillText("DAN", cx, y);
  y += titleLH/2 + GAP;

  // 2. Tagline
  ctx.font = `bold ${15*UI_SCALE}px 'Courier New', monospace`;
  ctx.fillStyle = "#aeb7c1";
  ctx.fillText("THE ROBOTS HAVE TURNED. GRAB YOUR MOP.", cx, y);
  y += 13*UI_SCALE + GAP;

  // 3-4. Mode prompts — blink together as one unit (existing affordance, kept).
  const blink = (Math.floor(performance.now()/500)%2)===0;
  if (blink){
    ctx.font = `bold ${19*UI_SCALE}px 'Courier New', monospace`;
    ctx.fillStyle = COL.soap;
    ctx.fillText("SPACE — KEYBOARD", cx, y);
    y += 19*UI_SCALE + GAP;
    ctx.fillStyle = COL.atomic;
    ctx.fillText("A / START — GAMEPAD", cx, y);
    y += 19*UI_SCALE + GAP;
  } else {
    y += (19*UI_SCALE + GAP) * 2;
  }

  // 5. Load game hint
  ctx.font = `bold ${14*UI_SCALE}px 'Courier New', monospace`;
  ctx.fillStyle = "#7c8590";
  ctx.fillText("L — LOAD GAME", cx, y);
  y += 14*UI_SCALE + 30*UI_SCALE;

  // 6. Options hints
  ctx.font = `bold ${12*UI_SCALE}px 'Courier New', monospace`;
  ctx.fillStyle = "#5c6670";
  ctx.fillText("O — OPTIONS", cx, y);
  y += 12*UI_SCALE + GAP;
  ctx.fillText("X — OPTIONS (GAMEPAD)", cx, y);

  // High score, pinned near the zone's bottom.
  if (G.high > 0){
    ctx.fillStyle = "#7c8590";
    ctx.font = `bold ${12*UI_SCALE}px 'Courier New', monospace`;
    ctx.fillText("HIGH SCORE  " + String(G.high).padStart(6,"0"), cx, VIEW_H - 47*UI_SCALE);
  }

  // XP total, pinned to the zone's bottom.
  {
    const xp = getXP();
    if (xp > 0) {
      ctx.fillStyle = COL.amber;
      ctx.font = `bold ${14*UI_SCALE}px 'Courier New', monospace`;
      ctx.fillText("XP  " + xp, cx, VIEW_H - 29*UI_SCALE);
    }
  }

  drawWeeklyPanel(railX, 0, RAIL_W, VIEW_H);
}

// Title load screen — shows all 5 save slots for selection.
function _drawTitleLoadScreen(){
  drawTitleBackdrop();

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 28px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("LOAD GAME", VIEW_W/2, VIEW_H/2 - 140);

  const saves = listSaves();
  const startY = VIEW_H/2 - 96;
  for (let i = 0; i < 5; i++){
    const slot = saves[i];
    const sy = startY + i * 58;
    const selected = (G._loadSaveCursor === i);

    if (selected){
      ctx.fillStyle = "rgba(95, 210, 255, 0.08)";
      ctx.fillRect(VIEW_W/2 - 220, sy - 4, 440, 50);
      ctx.strokeStyle = COL.soap; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
      ctx.strokeRect(VIEW_W/2 - 220, sy - 4, 440, 50);
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillStyle = selected ? COL.soap : "#6f7884";
    ctx.fillText(`SLOT ${i + 1}`, VIEW_W/2 - 208, sy + 10);

    if (slot.data){
      ctx.font = "bold 15px 'Courier New', monospace";
      ctx.fillStyle = selected ? COL.text : "rgba(232,235,239,0.7)";
      ctx.fillText(slot.data.name, VIEW_W/2 - 208, sy + 28);
      ctx.font = "11px 'Courier New', monospace";
      ctx.fillStyle = "#6f7884";
      ctx.fillText(`LV ${slot.data.level}  ·  ${String(slot.data.score).padStart(6,"0")} PTS`, VIEW_W/2 - 60, sy + 28);
      ctx.textAlign = "right";
      ctx.fillText(new Date(slot.data.savedAt).toLocaleDateString(), VIEW_W/2 + 208, sy + 28);
    } else {
      ctx.font = "italic 13px 'Courier New', monospace";
      ctx.fillStyle = "#2a303a";
      ctx.textAlign = "center";
      ctx.fillText("— EMPTY —", VIEW_W/2, sy + 22);
    }
  }

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("↑ / ↓ — SELECT   ·   ENTER — LOAD   ·   ESC — BACK", VIEW_W/2, VIEW_H/2 + 168);
}

// Centered highlight rect behind a selected title-menu row (load-screen style).
// `h` lets callers size the rect to a taller row (e.g. label + description).
function _drawTitleMenuHighlight(rowCenterY, h = 34){
  ctx.fillStyle = "rgba(95, 210, 255, 0.08)";
  ctx.fillRect(VIEW_W/2 - 200, rowCenterY - h/2, 400, h);
  ctx.strokeStyle = COL.soap; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
  ctx.strokeRect(VIEW_W/2 - 200 + 0.5, rowCenterY - h/2 + 0.5, 399, h - 1);
  ctx.globalAlpha = 1;
}

// Mode select screen: ENDLESS SHIFT vs STORY ROUTE.
function drawTitleModeSelect(){
  drawTitleBackdrop();
  drawTitleLogo(-84);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  ctx.font = "bold 18px 'Courier New', monospace";
  ctx.fillStyle = "#aeb6c0";
  ctx.fillText("SELECT MODE", VIEW_W/2, VIEW_H/2 + 14);

  const row1Y = VIEW_H/2 + 50, row2Y = VIEW_H/2 + 98;
  if (G._titleMenuCursor === 0) _drawTitleMenuHighlight(row1Y + 5, 46);
  ctx.font = "bold 20px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("[1]  ENDLESS SHIFT", VIEW_W/2, row1Y);
  ctx.font = "11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("Randomized levels, one enemy type at a time. Endless.", VIEW_W/2, row1Y + 18);

  const hasPlaylists = G.availablePlaylists.length > 0;
  if (hasPlaylists && G._titleMenuCursor === 1) _drawTitleMenuHighlight(row2Y + 5, 46);
  ctx.font = "bold 20px 'Arial Black', sans-serif";
  ctx.fillStyle = hasPlaylists ? COL.atomic : "#4a5260";
  ctx.fillText("[2]  STORY ROUTE" + (hasPlaylists ? "" : "  (unavailable)"), VIEW_W/2, row2Y);
  ctx.font = "11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("Hand-built levels in a fixed order.", VIEW_W/2, row2Y + 18);

  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const gpHint = G.inputMode === "gamepad"
    ? "D-PAD UP/DOWN + A — SELECT"
    : "1 / 2 — SELECT";
  ctx.fillText(gpHint, VIEW_W/2, VIEW_H/2 + 150);
  ctx.font = "11px 'Courier New', monospace";
  ctx.fillStyle = "#4a5260";
  ctx.fillText("ESC / B — BACK", VIEW_W/2, VIEW_H/2 + 168);
}

// Playlist picker screen: list available playlists by name.
function drawTitlePlaylistPicker(){
  drawTitleBackdrop();

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 28px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.atomic;
  ctx.fillText("CHOOSE PLAYLIST", VIEW_W/2, VIEW_H/2 - 80);

  const playlists = G.availablePlaylists;
  const startY = VIEW_H/2 - 30;
  for (let i = 0; i < playlists.length; i++){
    if (i === G._titleMenuCursor) _drawTitleMenuHighlight(startY + i * 44);
    ctx.font = "bold 20px 'Arial Black', sans-serif";
    ctx.fillStyle = COL.soap;
    ctx.fillText(`[${i+1}]  ${playlists[i].name}`, VIEW_W/2, startY + i * 44);
  }

  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const gpHint = G.inputMode === "gamepad"
    ? "D-PAD UP/DOWN + A — SELECT"
    : "1-9 — SELECT";
  ctx.fillText(gpHint, VIEW_W/2, VIEW_H/2 + 120);
}

// Right rail: this week's 5 active weekly achievements plus the
// Employee-of-the-Week meta slot (Phase 5). Reads live progress from
// achievements.js via getWeeklyAchievements(). Full-height panel pinned to
// the right edge at railX, per SPEC-title-rail.md "Layout" — geometry only,
// do not re-derive the numbers below.
function drawWeeklyPanel(railX, oy, railW, railH){
  const data = getWeeklyAchievements();
  if (!data || data.length === 0) return;

  const meta = data.find(e => e.id === 'meta_eotw');
  const rows = data.filter(e => e.id !== 'meta_eotw');

  const padTop = 28*UI_SCALE, padSide = 28*UI_SCALE, padBottom = 22*UI_SCALE;

  // Panel background + 1px left border (hairline stays 1px at all UI_SCALE).
  ctx.fillStyle = "rgba(9,13,18,0.55)";
  ctx.fillRect(railX, oy, railW, railH);
  ctx.strokeStyle = "rgba(255,255,255,0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(railX + 0.5, oy);
  ctx.lineTo(railX + 0.5, oy + railH);
  ctx.stroke();

  const contentX = railX + padSide;
  const contentR = railX + railW - padSide;
  const contentW = contentR - contentX;

  // Header row: label left, "N / target" progress chip right.
  const headerY = oy + padTop;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = "#7c8590";
  ctx.font = `bold ${13*UI_SCALE}px 'Courier New', monospace`;
  ctx.fillText("WEEKLY ACHIEVEMENTS", contentX, headerY);

  if (meta){
    const chipLabel = `${meta.progress} / ${meta.target}`;
    ctx.font = `bold ${12*UI_SCALE}px 'Courier New', monospace`;
    const chipTextW = ctx.measureText(chipLabel).width;
    const chipPadX = 9*UI_SCALE, chipPadY = 3*UI_SCALE;
    const chipH = 12*UI_SCALE + chipPadY*2;
    const chipW = chipTextW + chipPadX*2;
    const chipX = contentR - chipW, chipY = headerY - chipH/2;
    ctx.fillStyle = "rgba(246,168,33,0.13)";
    _roundRect(chipX, chipY, chipW, chipH, 5*UI_SCALE);
    ctx.fill();
    ctx.fillStyle = "#f6a821";
    ctx.textAlign = "center";
    ctx.fillText(chipLabel, chipX + chipW/2, headerY);
    ctx.textAlign = "left";
  }

  // Achievement rows: 5 weekly + EOTW, vertically centered in remaining height.
  const rowGap = 15*UI_SCALE;
  const dividerPad = 14*UI_SCALE;
  const rowList = meta ? [...rows, meta] : rows;
  const rowHeights = rowList.map(e => _weeklyRowHeight(e));
  const totalH = rowHeights.reduce((a,b) => a+b, 0) + rowGap * (rowList.length - 1);
  const bodyTop = oy + padTop + 20*UI_SCALE;
  const bodyBottom = oy + railH - padBottom - (15*UI_SCALE + 14*UI_SCALE + 12*UI_SCALE);
  let ry = bodyTop + Math.max(0, (bodyBottom - bodyTop - totalH) / 2);

  for (let i = 0; i < rowList.length; i++){
    const e = rowList[i];
    const isMeta = e.id === 'meta_eotw';
    const rh = rowHeights[i];

    // 1px top divider + divider-to-content padding (orange for EOTW).
    ctx.strokeStyle = isMeta ? "rgba(246,168,33,0.25)" : "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, ry + 0.5);
    ctx.lineTo(contentR, ry + 0.5);
    ctx.stroke();

    let cy = ry + dividerPad;

    // Name (left) + fraction (right-aligned on name baseline).
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = `bold ${23*UI_SCALE}px 'Courier New', monospace`;
    ctx.fillStyle = isMeta ? "#f6a821" : "#eef2f6";
    ctx.fillText(e.name, contentX, cy + 23*UI_SCALE*0.8);

    ctx.textAlign = "right";
    ctx.font = `bold ${14*UI_SCALE}px 'Courier New', monospace`;
    ctx.fillStyle = isMeta ? "#f6a821" : "#4ee06a";
    ctx.fillText(`${e.progress} / ${e.target}`, contentR, cy + 23*UI_SCALE*0.8);
    ctx.textAlign = "left";

    cy += 23*UI_SCALE + 4*UI_SCALE;

    // Description
    ctx.font = `${13*UI_SCALE}px 'Courier New', monospace`;
    ctx.fillStyle = isMeta ? "#b79256" : "#88919b";
    ctx.textBaseline = "top";
    cy = _wrapText(e.description || "", contentX, cy, contentW, 13*UI_SCALE*1.25);
    ctx.textBaseline = "alphabetic";

    // Progress bar — weekly rows only (binary fill: target is always 1 today,
    // but written as progress/target so it degrades gracefully for target>1).
    if (!isMeta){
      cy += 8*UI_SCALE;
      const barH = 5*UI_SCALE;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      _roundRect(contentX, cy, contentW, barH, 3*UI_SCALE);
      ctx.fill();
      const frac = Math.max(0, Math.min(1, e.progress / e.target));
      if (frac > 0){
        ctx.fillStyle = "#4ee06a";
        _roundRect(contentX, cy, contentW * frac, barH, 3*UI_SCALE);
        ctx.fill();
      }
    }

    ry += rh + rowGap;
  }

  // Footer row: 1px top divider, link left, keybind hint right.
  const footerY = oy + railH - padBottom - (12*UI_SCALE);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(contentX, footerY - 15*UI_SCALE - 6);
  ctx.lineTo(contentR, footerY - 15*UI_SCALE - 6);
  ctx.stroke();

  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = `${14*UI_SCALE}px 'Courier New', monospace`;
  ctx.fillStyle = "#35b6f2";
  ctx.fillText("▸ VIEW ALL ACHIEVEMENTS", contentX, footerY);

  ctx.textAlign = "right";
  ctx.font = `${12*UI_SCALE}px 'Courier New', monospace`;
  ctx.fillStyle = "#576069";
  ctx.fillText("[V]", contentR, footerY);
  ctx.textAlign = "left";
}

// Rounded-rect path helper (fill/stroke applied by the caller).
function _roundRect(x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Word-wraps text within maxW starting at (x,y), drawing each line at lineH
// spacing (ctx.textBaseline must be "top"). Returns the y just past the last
// line drawn, for callers to continue laying out content below it.
function _wrapText(text, x, y, maxW, lineH){
  const words = text.split(" ");
  let line = "", cy = y;
  for (const word of words){
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line){
      ctx.fillText(line, x, cy);
      cy += lineH;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, cy); cy += lineH; }
  return cy;
}

// Estimated row height (name + description wrap + optional bar) used only to
// vertically center the row stack — approximate is fine, dividers/rows use
// their own absolute cy math during the actual draw pass.
function _weeklyRowHeight(e){
  const isMeta = e.id === 'meta_eotw';
  const nameH = 23*UI_SCALE + 4*UI_SCALE;
  const descLines = Math.max(1, Math.ceil((e.description || "").length / 40));
  const descH = descLines * 13*UI_SCALE*1.25;
  const barH = isMeta ? 0 : (8*UI_SCALE + 5*UI_SCALE);
  return 14*UI_SCALE /*dividerPad*/ + nameH + descH + barH;
}
