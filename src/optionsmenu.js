/* =========================================================================
   optionsmenu.js — shared Options + Controls screens, used from pause (and
   later the title). Owns its own sub-screen/cursor state; pause.js delegates
   nav (handleOptionsEdge) and draw (drawOptions) to this module.

   Must NOT import input.js or pause.js (they import this module).
   ========================================================================= */
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";
import { COL } from "./palette.js";
import { G } from "./state.js";
import { isMuted, setMasterVolume, getMasterVolume, toggleMute,
         getMusicVolume, setMusicVolume, getSfxVolume, setSfxVolume } from "./audio.js";
import { savePrefs } from "./savegame.js";
import { drawFireLegend } from "./screens.js";

/* ---- Module-local state --------------------------------------------------- */
let _screen = "options";   // "options" | "controls"
let _pane   = "keyboard";  // "keyboard" | "gamepad"
let _optCursor = 0;        // 0=master 1=music 2=sfx 3=mute 4=CONTROLS

let optVolume = 0.35;
let optMusicVolume = 0.7;
let optSfxVolume   = 1.0;

/* ---- Public API ------------------------------------------------------------ */

export function openOptions(){
  _screen = "options";
  _optCursor = 0;
  optVolume = getMasterVolume();
  optMusicVolume = getMusicVolume();
  optSfxVolume   = getSfxVolume();
}

export function openControls(startPane){
  _screen = "controls";
  _pane = startPane;
}

export function optionsScreen(){
  return _screen;
}

export function defaultPane(){
  return G.inputMode === "gamepad" ? "gamepad" : "keyboard";
}

// Returns "exit" when backing out of the top-level options screen, else null.
export function handleOptionsEdge(action, heldLeft, heldRight){
  if (_screen === "controls"){
    if (action === "back"){ _screen = "options"; return null; }
    if (action === "confirm" || action === "left" || action === "right"){
      _pane = (_pane === "keyboard") ? "gamepad" : "keyboard";
    }
    return null;
  }

  // _screen === "options"
  if (action === "back") return "exit";

  if (action === "up")   _optCursor = (_optCursor - 1 + 5) % 5;
  if (action === "down") _optCursor = (_optCursor + 1) % 5;

  if (_optCursor < 3 && (heldLeft || heldRight)){
    const dir = heldRight ? 1 : -1;
    if (_optCursor === 0){
      optVolume = Math.max(0, Math.min(1, optVolume + dir * 0.005));
      setMasterVolume(optVolume);
    } else if (_optCursor === 1){
      optMusicVolume = Math.max(0, Math.min(1, optMusicVolume + dir * 0.005));
      setMusicVolume(optMusicVolume);
    } else {
      optSfxVolume = Math.max(0, Math.min(1, optSfxVolume + dir * 0.005));
      setSfxVolume(optSfxVolume);
    }
    savePrefs({ masterVolume: optVolume, musicVolume: optMusicVolume, sfxVolume: optSfxVolume });
  }

  if (action === "confirm"){
    if (_optCursor === 3) toggleMute();
    else if (_optCursor === 4) openControls(defaultPane());
  }

  return null;
}

export function drawOptions(){
  if (_screen === "controls") _drawControlsPane();
  else _drawOptionsPanel();
}

/* ---- Panel helper ----------------------------------------------------------- */

function _panel(w, h){
  const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  ctx.fillStyle = "#0e1218";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COL.soap;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  return { x, y, w, h };
}

/* ---- _drawOptionsPanel (moved from pause.js's _drawOptions, + CONTROLS row) - */

function _drawOptionsPanel(){
  const { x, y, w, h } = _panel(360, 380);
  const slX = x + 28, slW = w - 56;
  const adjHint = G.inputMode === "gamepad" ? "◀ / ▶ — ADJUST" : "← / → — ADJUST";
  const togHint = G.inputMode === "gamepad" ? "A — TOGGLE"      : "ENTER — TOGGLE";

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

  // Helper to draw one slider row
  function _sliderRow(label, value, labelY, trackY, hintY, focused){
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "bold 13px 'Courier New', monospace";
    ctx.fillStyle = focused ? COL.amber : COL.text;
    ctx.fillText(label, x + 28, labelY);
    ctx.textAlign = "right";
    ctx.fillStyle = COL.amber;
    ctx.fillText(Math.round(value * 100) + "%", x + w - 28, labelY);

    ctx.fillStyle = "#232a34";
    ctx.fillRect(slX, trackY, slW, 6);
    ctx.fillStyle = COL.soap;
    ctx.fillRect(slX, trackY, slW * value, 6);
    const thumbX = slX + slW * value;
    ctx.beginPath();
    ctx.arc(thumbX, trackY + 3, 7, 0, Math.PI * 2);
    ctx.fillStyle = COL.soap;
    ctx.fill();

    ctx.textAlign = "left";
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillStyle = "#6f7884";
    ctx.fillText(adjHint, x + 28, hintY);
  }

  // Row 0 — Master Volume
  _sliderRow("MASTER VOLUME", optVolume,      y + 88,  y + 106, y + 120, _optCursor === 0);
  // Row 1 — Music Volume
  _sliderRow("MUSIC VOLUME",  optMusicVolume, y + 148, y + 166, y + 180, _optCursor === 1);
  // Row 2 — SFX Volume
  _sliderRow("SFX VOLUME",    optSfxVolume,   y + 208, y + 226, y + 240, _optCursor === 2);

  // Row 3 — Mute
  const muteY = y + 272;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.fillStyle = _optCursor === 3 ? COL.amber : COL.text;
  ctx.fillText("MUTE", x + 28, muteY);
  ctx.textAlign = "right";
  ctx.fillStyle = isMuted() ? "#ff5b4d" : "#5dff8f";
  ctx.fillText(isMuted() ? "ON" : "OFF", x + w - 28, muteY);
  ctx.textAlign = "left";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText(togHint, x + 28, y + 290);

  // Row 4 — Controls
  const ctrlY = y + 324;
  const ctrlSelected = _optCursor === 4;
  if (ctrlSelected){
    ctx.strokeStyle = COL.amber; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    ctx.strokeRect(x + 16, ctrlY - 16, w - 32, 32);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "left";
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.fillStyle = ctrlSelected ? COL.amber : COL.text;
  ctx.fillText("CONTROLS", x + 28, ctrlY);
  ctx.textAlign = "right";
  ctx.fillStyle = ctrlSelected ? COL.amber : "#6f7884";
  ctx.fillText("▸", x + w - 28, ctrlY);

  // Footer
  ctx.textAlign = "center";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const backHint = G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK";
  ctx.fillText(backHint, VIEW_W / 2, y + h - 20);
}

/* ---- _drawControlsPane (Phase 4 placeholder; real art in Phases 5-6) ------- */

function _drawControlsPane(){
  const { x, y, w, h } = _panel(420, 380);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 26px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("CONTROLS", VIEW_W / 2, y + 40);

  ctx.strokeStyle = COL.soap;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 60);
  ctx.lineTo(x + w - 20, y + 60);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = "bold 14px 'Courier New', monospace";
  ctx.fillStyle = COL.amber;
  ctx.fillText(_pane === "keyboard" ? "KEYBOARD & MOUSE" : "GAMEPAD", VIEW_W / 2, y + 90);

  const tabLabel = _pane === "keyboard" ? "▸ GAMEPAD CONTROLS" : "▸ KEYBOARD CONTROLS";
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#9aa3ae";
  ctx.fillText(tabLabel, VIEW_W / 2, y + 116);

  ctx.font = "italic 12px 'Courier New', monospace";
  ctx.fillStyle = "#3a4250";
  ctx.fillText("(full control reference coming soon)", VIEW_W / 2, y + h / 2);

  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const backHint = G.inputMode === "gamepad" ? "B — BACK" : "ESC / B — BACK";
  ctx.fillText(backHint, VIEW_W / 2, y + h - 20);
}
