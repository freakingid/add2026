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
import { sfx, isMuted, setMasterVolume, getMasterVolume, toggleMute } from "./audio.js";
import { getWeeklyAchievements } from "./achievements.js";

/* ---- Module-local key state (avoids circular import with input.js) ------- */
const _keys = {};
window.addEventListener("keydown", e => { _keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup",   e => { _keys[e.key.toLowerCase()] = false; });

/* ---- Sub-screen state ---------------------------------------------------- */
// "menu" | "options" | "confirm_quit"  (save/confirm_overwrite/name_entry = Phase 3)
let subScreen = "menu";

// Root menu
let menuCursor = 0;
const MENU_ITEMS = ["CONTINUE", "OPTIONS", "SAVE & QUIT", "QUIT"];

// Options
let optVolume = 0.35;

// Quit confirm cursor: 0=YES 1=NO
let _quitCursor = 0;

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
  G.state = "paused";
}

export function closePause(){
  G.state = "playing";
  // Belt hum resumes naturally next update() frame if Dan is on a belt.
}

/* ---- pollPause ----------------------------------------------------------- */

export function pollPause(dt){
  _pad = (navigator.getGamepads ? navigator.getGamepads()[0] : null) || null;

  switch(subScreen){
    case "menu":         _pollMenu(); break;
    case "options":      _pollOptions(dt); break;
    case "confirm_quit": _pollConfirmQuit(); break;
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
        optVolume = getMasterVolume();
        break;
      case 2:                                            // SAVE & QUIT — stub (Phase 3)
        subScreen = "confirm_quit";
        _quitCursor = 0;
        break;
      case 3:                                            // QUIT
        subScreen = "confirm_quit";
        _quitCursor = 0;
        break;
    }
  }
  _refreshEdges();
}

function _pollOptions(dt){
  if (_edge("back")){ subScreen = "menu"; _refreshEdges(); return; }

  // Volume: check held state (not edge) for smooth continuous adjustment.
  const leftHeld  = _held("left");
  const rightHeld = _held("right");
  if (leftHeld || rightHeld){
    const dir = rightHeld ? 1 : -1;
    optVolume = Math.max(0, Math.min(1, optVolume + dir * 0.005));
    setMasterVolume(optVolume);
  }

  // Mute toggle on confirm key.
  if (_edge("confirm")){ toggleMute(); }

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

function _doQuitToTitle(){
  G.high = Math.max(G.high, G.score);
  G.state = "title";
  G._titlePhase = "input";
  sfx.conveyor(false);
  subScreen = "menu";
  menuCursor = 0;
}

/* ---- handlePauseKeydown -------------------------------------------------- */
// Called from input.js's keydown listener when G.state === "paused".
// Used for name entry in Phase 3; currently a no-op (no name_entry sub-screen).
export function handlePauseKeydown(e){
  // Phase 3: intercept printable chars for name_entry sub-screen.
  // Nothing to do in Phase 2.
}

/* ---- drawPause ----------------------------------------------------------- */

export function drawPause(){
  // 50% dark overlay over the frozen game world.
  ctx.fillStyle = "rgba(8, 12, 18, 0.50)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  switch(subScreen){
    case "menu":         _drawMenu(); break;
    case "options":      _drawOptions(); break;
    case "confirm_quit": _drawConfirmQuit(); break;
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

/* ---- _drawOptions -------------------------------------------------------- */

function _drawOptions(){
  const { x, y, w, h } = _panel(360, 240);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 26px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("OPTIONS", VIEW_W / 2, y + 40);

  ctx.strokeStyle = COL.soap;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 60);
  ctx.lineTo(x + w - 20, y + 60);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Volume row
  const rowY = y + 92;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.fillStyle = COL.text;
  ctx.fillText("MASTER VOLUME", x + 28, rowY);
  const pct = Math.round(optVolume * 100);
  ctx.textAlign = "right";
  ctx.fillStyle = COL.amber;
  ctx.fillText(pct + "%", x + w - 28, rowY);

  // Slider track
  const slX = x + 28, slY = rowY + 20, slW = w - 56;
  ctx.fillStyle = "#232a34";
  ctx.fillRect(slX, slY, slW, 6);
  ctx.fillStyle = COL.soap;
  ctx.fillRect(slX, slY, slW * optVolume, 6);
  // Thumb
  const thumbX = slX + slW * optVolume;
  ctx.beginPath();
  ctx.arc(thumbX, slY + 3, 7, 0, Math.PI * 2);
  ctx.fillStyle = COL.soap;
  ctx.fill();

  // Volume hint
  ctx.textAlign = "left";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const volHint = G.inputMode === "gamepad" ? "◀ / ▶ — ADJUST" : "← / → — ADJUST";
  ctx.fillText(volHint, x + 28, slY + 22);

  // Mute row
  const muteY = y + 162;
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.fillStyle = COL.text;
  ctx.textAlign = "left";
  ctx.fillText("MUTE", x + 28, muteY);
  ctx.textAlign = "right";
  ctx.fillStyle = isMuted() ? "#ff5b4d" : "#5dff8f";
  ctx.fillText(isMuted() ? "ON" : "OFF", x + w - 28, muteY);
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const muteHint = G.inputMode === "gamepad" ? "A — TOGGLE" : "ENTER — TOGGLE";
  ctx.fillText(muteHint, x + 28, muteY + 18);

  // Footer
  ctx.textAlign = "center";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const backHint = G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK";
  ctx.fillText(backHint, VIEW_W / 2, y + h - 20);
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
