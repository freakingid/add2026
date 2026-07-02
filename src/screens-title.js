/* =========================================================================
   screens-title.js — title screen + its sub-phases (mode select, load,
   playlist picker, weekly achievements panel). Split from screens.js.
   All draw in screen space (no camera transform).
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";
import { G } from "./state.js";
import { COL } from "./palette.js";
import { getWeeklyAchievements, getXP } from "./achievements.js";
import { listSaves } from "./savegame.js";
import { drawOptions } from "./optionsmenu.js";
import { GOLD } from "./screens.js";

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
  drawTitleLogo(0);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
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
  // L key hint to load a saved game
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("L — LOAD GAME", VIEW_W/2, VIEW_H/2 + 198);

  // Options hints — keyboard opens with O, gamepad with X (CFG.GAMEPAD.BTN_VIEW).
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#4a5260";
  ctx.fillText("O — OPTIONS      X — OPTIONS (GAMEPAD)", VIEW_W/2, VIEW_H/2 + 216);

  if (G.high > 0){
    ctx.fillStyle = "#6f7884";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillText("HIGH SCORE  " + String(G.high).padStart(6,"0"), VIEW_W/2, VIEW_H - 22);
  }

  // XP total (Phase 7)
  {
    const xp = getXP();
    if (xp > 0) {
      ctx.fillStyle = "#ffd24a";
      ctx.font = "bold 11px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("XP  " + xp, VIEW_W/2, VIEW_H - 38);
    }
  }

  drawWeeklyPanel(VIEW_W - 300, 64);
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

// Right-side column listing this week's 5 active weekly achievements plus the
// Employee-of-the-Week meta slot (Phase 5). Reads live progress from
// achievements.js via getWeeklyAchievements(); does not overlap the centered
// title/options or the lower-left fire legend. Title-state only.
function drawWeeklyPanel(ox, oy){
  const data = getWeeklyAchievements();
  if (!data || data.length === 0) return;

  const PANEL_W = 272, ROW_H = 28;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

  // header
  ctx.fillStyle = "#9aa3ae";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillText("WEEKLY ACHIEVEMENTS", ox, oy - 8);

  for (let i = 0; i < data.length; i++){
    const e = data[i];
    const y = oy + i * ROW_H;
    const isMeta = e.id === 'meta_eotw';

    // subtle row backing; the EOTW meta row gets a faint divider above it
    if (isMeta){
      ctx.strokeStyle = "#2c333d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, y - 5.5);
      ctx.lineTo(ox + PANEL_W, y - 5.5);
      ctx.stroke();
    }

    const done = e.unlocked;
    // name (white, dimmed when complete)
    ctx.fillStyle = done ? "#b9c0c9" : (isMeta ? COL.amber : "#e8ebef");
    ctx.font = (isMeta ? "bold 13px" : "bold 12px") + " 'Courier New', monospace";
    ctx.fillText(e.name, ox, y + 4);

    // description (grey, smaller)
    ctx.fillStyle = "#727b86";
    ctx.font = "9px 'Courier New', monospace";
    ctx.fillText(e.description || "", ox, y + 15);

    // progress indicator, right-aligned
    ctx.textAlign = "right";
    if (done){
      ctx.fillStyle = GOLD;
      ctx.font = "bold 13px 'Courier New', monospace";
      ctx.fillText("✔", ox + PANEL_W, y + 6);
    } else {
      ctx.fillStyle = "#8b94a0";
      ctx.font = "bold 11px 'Courier New', monospace";
      const label = e.target > 1 ? `${e.progress} / ${e.target}` : "☐";
      ctx.fillText(label, ox + PANEL_W, y + 4);
    }
    ctx.textAlign = "left";
  }

  // "View All Achievements" text button (Phase 6: opens the lifetime modal).
  // V (keyboard) / X (gamepad) — the title's mode isn't locked yet, so both work.
  const by = oy + data.length * ROW_H + 10;
  ctx.fillStyle = COL.soap;
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillText("▸ VIEW ALL ACHIEVEMENTS  [V]", ox, by);
}
