/* =========================================================================
   pause.js — pause overlay: sub-screens for menu, options, and quit confirm.
   (Phase 2: save/name_entry sub-screens deferred to Phase 3.)

   Owns all pause draw + input. Called from update.js (pollPause) and
   render.js (drawPause). Opened/closed via openPause/closePause, which
   input.js calls on ESC or gamepad START.

   CIRCULAR IMPORT NOTE: input.js imports from pause.js AND pause.js would
   normally want `keys` from input.js — that's a cycle. Fix: pause.js
   maintains its own _keys object via module-local listeners. Two listeners
   on the same events is fine; both track the same physical keys independently.
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";
import { G } from "./state.js";
import { COL } from "./palette.js";
import { sfx, music } from "./audio.js";
import { getWeeklyAchievements } from "./achievements.js";
import { listSaves, saveGame } from "./savegame.js";
import { openOptions, handleOptionsEdge, drawOptions, optionsScreen } from "./optionsmenu.js";

/* ---- Module-local key state (avoids circular import with input.js) ------- */
const _keys = {};
window.addEventListener("keydown", e => { _keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup",   e => { _keys[e.key.toLowerCase()] = false; });

/* ---- Sub-screen state ---------------------------------------------------- */
// "menu" | "options" | "save" | "confirm_overwrite" | "confirm_quit" | "name_entry"
let subScreen = "menu";

// Root menu
let menuCursor = 0;
const MENU_ITEMS = ["CONTINUE", "OPTIONS", "SAVE & QUIT", "QUIT"];

// Save screen state
let saveCursor = 0;
let saveSlots = [];
let pendingOverwriteSlot = -1;

// Overwrite confirm cursor: 0=YES 1=NO
let _overwriteCursor = 0;

// Quit confirm cursor: 0=YES 1=NO
let _quitCursor = 0;

// Name entry state
let nameBuffer = "";
let nameCursorBlink = 0;
let nameTargetSlot = -1;

/* ---- Edge detection ------------------------------------------------------ */
const _prev = { up:false, down:false, left:false, right:false, confirm:false, back:false };

// Gamepad reference, refreshed each pollPause frame.
let _pad = null;

function _held(action){
  const kb = () => {
    switch(action){
      case "up":      return !!(_keys["arrowup"]    || _keys["w"]);
      case "down":    return !!(_keys["arrowdown"]   || _keys["s"]);
      case "left":    return !!(_keys["arrowleft"]   || _keys["a"]);
      case "right":   return !!(_keys["arrowright"]  || _keys["d"]);
      case "confirm": return !!(_keys["enter"] || _keys[" "]);
      case "back":    return !!(_keys["escape"] || _keys["backspace"]);
    }
    return false;
  };
  const gp = () => {
    if (!_pad) return false;
    const btn = i => !!(_pad.buttons[i] && _pad.buttons[i].pressed);
    switch(action){
      case "up":      return btn(12) || (_pad.axes[1] || 0) < -0.5;
      case "down":    return btn(13) || (_pad.axes[1] || 0) > 0.5;
      case "left":    return btn(14) || (_pad.axes[0] || 0) < -0.5;
      case "right":   return btn(15) || (_pad.axes[0] || 0) > 0.5;
      case "confirm": return btn(0) || btn(9);   // A or Start
      case "back":    return btn(1);             // B
    }
    return false;
  };
  if (G.inputMode === "gamepad") return gp();
  if (G.inputMode === "keyboard") return kb();
  return kb() || gp();
}

function _edge(action){
  const now = _held(action);
  const edge = now && !_prev[action];
  _prev[action] = now;
  return edge;
}

function _refreshEdges(){
  for (const a of ["up","down","left","right","confirm","back"]){
    _prev[a] = _held(a);
  }
}

/* ---- Public API ---------------------------------------------------------- */

export function openPause(){
  subScreen = "menu";
  menuCursor = 0;
  sfx.conveyor(false);   // kill belt hum immediately
  music.duck();
  G.state = "paused";
}

export function closePause(){
  G.state = "playing";
  music.unduck();
  // Belt hum resumes naturally next update() frame if Dan is on a belt.
}

/* ---- pollPause ----------------------------------------------------------- */

export function pollPause(dt){
  _pad = (navigator.getGamepads ? navigator.getGamepads()[0] : null) || null;
  nameCursorBlink += dt;

  switch(subScreen){
    case "menu":              _pollMenu(); break;
    case "options":           _pollOptionsScreen(); break;
    case "save":              _pollSave(); break;
    case "confirm_overwrite": _pollConfirmOverwrite(); break;
    case "confirm_quit":      _pollConfirmQuit(); break;
    case "name_entry":        _pollNameEntry(); break;
  }
}

function _pollMenu(){
  if (_edge("up"))   menuCursor = (menuCursor - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
  if (_edge("down")) menuCursor = (menuCursor + 1) % MENU_ITEMS.length;
  if (_edge("back")){ closePause(); _refreshEdges(); return; }
  if (_edge("confirm")){
    switch(menuCursor){
      case 0: closePause(); break;                       // CONTINUE
      case 1:                                            // OPTIONS
        subScreen = "options";
        openOptions();
        break;
      case 2:                                            // SAVE & QUIT
        subScreen = "save";
        saveSlots = listSaves();
        saveCursor = 0;
        break;
      case 3:                                            // QUIT
        subScreen = "confirm_quit";
        _quitCursor = 0;
        break;
    }
  }
  _refreshEdges();
}

function _pollOptionsScreen(){
  const heldLeft  = _held("left");
  const heldRight = _held("right");
  for (const action of ["up","down","confirm","back"]){
    if (_edge(action)){
      const result = handleOptionsEdge(action, heldLeft, heldRight);
      if (result === "exit"){ subScreen = "menu"; break; }
    }
  }
  if (optionsScreen() === "options"){
    // Sliders adjust continuously while held, not just on edge.
    if (heldLeft || heldRight) handleOptionsEdge(heldRight ? "right" : "left", heldLeft, heldRight);
  } else {
    // Controls screen: left/right toggle the pane once per press.
    if (_edge("left") || _edge("right")) handleOptionsEdge("left", heldLeft, heldRight);
  }
  _refreshEdges();
}

function _pollConfirmQuit(){
  if (_edge("back"))  { subScreen = "menu"; _quitCursor = 0; _refreshEdges(); return; }
  if (_edge("left")  || _edge("up"))    _quitCursor = 0;
  if (_edge("right") || _edge("down"))  _quitCursor = 1;
  if (_edge("confirm")){
    if (_quitCursor === 0){
      _doQuitToTitle();
    } else {
      subScreen = "menu";
    }
    _quitCursor = 0;
  }
  _refreshEdges();
}

function _pollSave(){
  if (_edge("back")){ subScreen = "menu"; _refreshEdges(); return; }
  if (_edge("up"))   saveCursor = (saveCursor - 1 + 5) % 5;
  if (_edge("down")) saveCursor = (saveCursor + 1) % 5;
  if (_edge("confirm")){
    const slot = saveSlots[saveCursor];
    if (slot.data !== null){
      pendingOverwriteSlot = saveCursor;
      _overwriteCursor = 0;
      subScreen = "confirm_overwrite";
    } else {
      nameTargetSlot = saveCursor;
      nameBuffer = "";
      nameCursorBlink = 0;
      subScreen = "name_entry";
    }
  }
  _refreshEdges();
}

function _pollConfirmOverwrite(){
  if (_edge("back"))  { subScreen = "save"; _overwriteCursor = 0; _refreshEdges(); return; }
  if (_edge("left") || _edge("up"))    _overwriteCursor = 0;
  if (_edge("right") || _edge("down")) _overwriteCursor = 1;
  if (_edge("confirm")){
    if (_overwriteCursor === 0){
      nameTargetSlot = pendingOverwriteSlot;
      nameBuffer = "";
      nameCursorBlink = 0;
      subScreen = "name_entry";
    } else {
      subScreen = "save";
    }
    _overwriteCursor = 0;
  }
  _refreshEdges();
}

function _pollNameEntry(){
  // Gamepad: accept default name via A/Start; B = cancel.
  if (G.inputMode === "gamepad"){
    if (_edge("back"))    { subScreen = "save"; _refreshEdges(); return; }
    if (_edge("confirm")){
      if (nameBuffer.length === 0) nameBuffer = `SAVE ${nameTargetSlot + 1}`;
      _commitName();
    }
    _refreshEdges();
    return;
  }
  // Keyboard: ESC/Enter handled here; character input via handlePauseKeydown.
  if (_edge("back"))    { subScreen = "save"; _refreshEdges(); return; }
  if (_edge("confirm")) { _commitName(); }
  _refreshEdges();
}

function _commitName(){
  const name = nameBuffer.trim() || `SAVE ${nameTargetSlot + 1}`;
  const snapshot = _buildSnapshot();
  saveGame(nameTargetSlot, name, snapshot);
  _doQuitToTitle();
}

function _buildSnapshot(){
  return {
    score:            G.score,
    level:            G.level,
    gameMode:         G.gameMode,
    playlistName:     G.playlist ? G.playlist.name     : null,
    playlistFilename: G.playlist ? G.playlist.filename : null,
    playlistIndex:    G.playlistIndex,
    dan: {
      hp:         G.dan.hp,
      hasDustbin: G.dan.hasDustbin,
    },
    powerups: { ...G.powerups },
  };
}

function _doQuitToTitle(){
  G.high = Math.max(G.high, G.score);
  G.state = "title";
  G._titlePhase = "input";
  sfx.conveyor(false);
  music.stop();
  music.playTitle();
  subScreen = "menu";
  menuCursor = 0;
}

/* ---- handlePauseKeydown -------------------------------------------------- */
// Called from input.js's keydown listener when G.state === "paused".
// Used for name entry in Phase 3; currently a no-op (no name_entry sub-screen).
export function handlePauseKeydown(e){
  if (subScreen !== "name_entry") return;
  const k = e.key;
  if (k === "Enter"){
    _commitName();
  } else if (k === "Backspace" || k === "Delete"){
    nameBuffer = nameBuffer.slice(0, -1);
  } else if (k.length === 1 && nameBuffer.length < 20){
    nameBuffer += k;
  }
}

/* ---- drawPause ----------------------------------------------------------- */

export function drawPause(){
  // 50% dark overlay over the frozen game world.
  ctx.fillStyle = "rgba(8, 12, 18, 0.50)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  switch(subScreen){
    case "menu":              _drawMenu(); break;
    case "options":           drawOptions(); break;
    case "save":              _drawSave(); break;
    case "confirm_overwrite": _drawConfirmOverwrite(); break;
    case "confirm_quit":      _drawConfirmQuit(); break;
    case "name_entry":        _drawNameEntry(); break;
  }
}

/* ---- Panel helper -------------------------------------------------------- */

function _panel(w, h){
  const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  ctx.fillStyle = "#0e1218";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COL.soap;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  return { x, y, w, h };
}

/* ---- _drawMenu ----------------------------------------------------------- */

function _drawMenu(){
  const weekly = getWeeklyAchievements();
  const weeklyCount = Math.min(weekly.length, 5);
  const panelH = Math.max(320, Math.min(480,
    96 + weeklyCount * 22 + 40 + MENU_ITEMS.length * 44 + 40
  ));
  const { x, y, w, h } = _panel(380, panelH);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Header
  ctx.font = "bold 32px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  ctx.fillText("PAUSED", VIEW_W / 2, y + 48);

  // Divider
  ctx.strokeStyle = COL.soap;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 68);
  ctx.lineTo(x + w - 20, y + 68);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Weekly achievements summary
  ctx.textAlign = "left";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("WEEKLY PROGRESS", x + 28, y + 88);

  let wy = y + 104;
  for (let i = 0; i < weeklyCount; i++){
    const e = weekly[i];
    ctx.font = "12px 'Courier New', monospace";
    ctx.fillStyle = e.unlocked ? "#6f7884" : COL.text;
    ctx.fillText(e.name, x + 28, wy);
    ctx.textAlign = "right";
    ctx.fillStyle = e.unlocked ? "#ffb627" : "#8b94a0";
    ctx.fillText(e.unlocked ? "✔" : `${e.progress} / ${e.target}`, x + w - 28, wy);
    ctx.textAlign = "left";
    wy += 22;
  }

  if (weeklyCount === 0){
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = "#3a4250";
    ctx.textAlign = "center";
    ctx.fillText("No weekly goals yet.", VIEW_W / 2, y + 104);
    wy = y + 116;
    ctx.textAlign = "left";
  }

  // Divider after weekly block
  ctx.strokeStyle = COL.soap;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 20, wy + 8);
  ctx.lineTo(x + w - 20, wy + 8);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Menu items
  const itemStartY = wy + 28;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < MENU_ITEMS.length; i++){
    const selected = (i === menuCursor);
    ctx.font = "bold 18px 'Arial Black', sans-serif";
    ctx.fillStyle = selected ? COL.amber : "rgba(232,235,239,0.55)";
    ctx.fillText((selected ? "▶  " : "   ") + MENU_ITEMS[i], VIEW_W / 2, itemStartY + i * 44);
  }

  // Footer
  const backHint = G.inputMode === "gamepad" ? "B — CLOSE" : "ESC — CLOSE";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.textAlign = "center";
  ctx.fillText(backHint, VIEW_W / 2, y + h - 20);
}

/* ---- _drawSave ----------------------------------------------------------- */

function _drawSave(){
  const { x, y, w, h } = _panel(420, 380);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  ctx.fillText("CHOOSE SAVE SLOT", VIEW_W / 2, y + 36);

  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("Select a slot to save and quit to title.", VIEW_W / 2, y + 56);

  ctx.strokeStyle = COL.soap; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 20, y + 70); ctx.lineTo(x + w - 20, y + 70); ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 5; i++){
    const slot = saveSlots[i];
    const sy = y + 84 + i * 54;
    const selected = (i === saveCursor);

    if (selected){
      ctx.strokeStyle = COL.amber; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
      ctx.strokeRect(x + 16, sy - 2, w - 32, 50);
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillStyle = selected ? COL.amber : "#6f7884";
    ctx.fillText(`SLOT ${i + 1}`, x + 28, sy + 14);

    if (slot && slot.data){
      ctx.font = "bold 14px 'Courier New', monospace";
      ctx.fillStyle = selected ? COL.text : "rgba(232,235,239,0.8)";
      ctx.fillText(slot.data.name, x + 28, sy + 32);
      ctx.font = "10px 'Courier New', monospace";
      ctx.fillStyle = "#6f7884";
      ctx.fillText(`LV ${slot.data.level}  ·  ${String(slot.data.score).padStart(6,"0")} PTS`, x + 28, sy + 46);
      ctx.textAlign = "right";
      ctx.fillText(new Date(slot.data.savedAt).toLocaleDateString(), x + w - 28, sy + 46);
    } else {
      ctx.font = "italic 13px 'Courier New', monospace";
      ctx.fillStyle = "#3a4250";
      ctx.textAlign = "center";
      ctx.fillText("— EMPTY —", VIEW_W / 2, sy + 30);
    }
  }

  ctx.textAlign = "center";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText(G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK", VIEW_W / 2, y + h - 20);
}

/* ---- _drawConfirmOverwrite ----------------------------------------------- */

function _drawConfirmOverwrite(){
  const { x, y, w, h } = _panel(340, 200);
  const slot = saveSlots[pendingOverwriteSlot];

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  ctx.fillText("OVERWRITE SAVE?", VIEW_W / 2, y + 48);

  ctx.font = "13px 'Courier New', monospace";
  ctx.fillStyle = "#aeb6c0";
  const name = slot && slot.data ? slot.data.name : `SLOT ${pendingOverwriteSlot + 1}`;
  ctx.fillText(`"${name}"`, VIEW_W / 2, y + 80);

  const opts = ["YES", "NO"];
  for (let i = 0; i < 2; i++){
    const ox = VIEW_W / 2 + (i === 0 ? -60 : 60);
    const selected = (_overwriteCursor === i);
    ctx.font = "bold 20px 'Arial Black', sans-serif";
    ctx.fillStyle = selected ? COL.amber : "rgba(232,235,239,0.4)";
    ctx.fillText(opts[i], ox, y + 130);
    if (selected){
      ctx.strokeStyle = COL.amber; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
      ctx.strokeRect(ox - 28, y + 118, 56, 28);
      ctx.globalAlpha = 1;
    }
  }

  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText(G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK", VIEW_W / 2, y + h - 18);
}

/* ---- _drawNameEntry ------------------------------------------------------ */

function _drawNameEntry(){
  const { x, y, w, h } = _panel(400, 220);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("NAME YOUR SAVE", VIEW_W / 2, y + 38);

  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const hint = G.inputMode === "gamepad"
    ? "Press A / START to confirm."
    : "Type a name, then ENTER to confirm.";
  ctx.fillText(hint, VIEW_W / 2, y + 60);

  // Input box
  const ibX = VIEW_W / 2 - 170, ibY = y + 82, ibW = 340, ibH = 36;
  ctx.fillStyle = "#1a1e26";
  ctx.fillRect(ibX, ibY, ibW, ibH);
  ctx.strokeStyle = COL.soap; ctx.lineWidth = 1.5;
  ctx.strokeRect(ibX + 0.5, ibY + 0.5, ibW - 1, ibH - 1);

  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = "bold 16px 'Courier New', monospace";
  ctx.fillStyle = COL.text;
  const textX = ibX + 10;
  ctx.fillText(nameBuffer, textX, ibY + ibH / 2);

  const textW = ctx.measureText(nameBuffer).width;
  const blinkOn = (nameCursorBlink % 0.8) < 0.4;
  if (blinkOn){
    ctx.fillStyle = COL.soap;
    ctx.fillRect(textX + textW + 1, ibY + 7, 2, 22);
  }

  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = nameBuffer.length >= 20 ? "#ff5b4d" : "#6f7884";
  ctx.fillText(`${nameBuffer.length} / 20`, ibX + ibW - 4, ibY + ibH + 14);

  if (G.inputMode === "gamepad" && nameBuffer.length === 0){
    ctx.textAlign = "center";
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillStyle = "#6f7884";
    ctx.fillText(`Default: "SAVE ${nameTargetSlot + 1}"`, VIEW_W / 2, y + 150);
  }

  ctx.textAlign = "center";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const cancelHint = G.inputMode === "gamepad" ? "B — CANCEL" : "ESC — CANCEL";
  const confirmHint = G.inputMode === "gamepad" ? "A — CONFIRM" : "ENTER — CONFIRM";
  ctx.fillText(`${cancelHint}   ·   ${confirmHint}`, VIEW_W / 2, y + h - 18);
}

/* ---- _drawConfirmQuit ---------------------------------------------------- */

function _drawConfirmQuit(){
  const { x, y, w, h } = _panel(360, 180);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = "#ff5b4d";
  ctx.fillText("QUIT WITHOUT SAVING?", VIEW_W / 2, y + 50);

  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("Progress will be lost.", VIEW_W / 2, y + 76);

  const opts = ["YES", "NO"];
  for (let i = 0; i < 2; i++){
    const ox = VIEW_W / 2 + (i === 0 ? -60 : 60);
    const selected = (_quitCursor === i);
    ctx.font = "bold 20px 'Arial Black', sans-serif";
    ctx.fillStyle = selected
      ? (i === 0 ? "#ff5b4d" : COL.soap)
      : "rgba(232,235,239,0.4)";
    ctx.fillText(opts[i], ox, y + 116);
    if (selected){
      ctx.strokeStyle = (i === 0 ? "#ff5b4d" : COL.soap);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.6;
      ctx.strokeRect(ox - 28, y + 104, 56, 28);
      ctx.globalAlpha = 1;
    }
  }

  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.textAlign = "center";
  ctx.fillText(
    G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK",
    VIEW_W / 2, y + h - 18
  );
}
