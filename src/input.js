/* =========================================================================
   input.js — device-agnostic input layer (GDD §4). Registers keyboard / mouse /
   touch listeners on import (side-effect module) and polls the gamepad each frame
   (`pollGamepad`, called from update.js — events are unreliable across browsers).

   Player-action code never reads raw keys/axes; it calls the abstracted API:
     getMoveVec()      -> {x,y} normalized move direction (mag 0 or 1)
     getFireAngle()    -> fire angle in radians, or null when not firing
     isDeploySpecial() -> edge-triggered bool: true only on the press frame
   Each routes to keyboard or gamepad based on G.inputMode (set on the title when
   the player picks a device; the opposing device is then inert for the run).

   Cardinal key assignments live in CFG.KEYS; diagonal combos are the vector sum of
   two adjacent cardinals (so O+P = NE fire, W+D = NE move) — no per-diagonal keys.
   ========================================================================= */
import { CFG } from "./config.js";
import { canvas, VIEW_W, VIEW_H } from "./canvas.js";
import { G } from "./state.js";
import { newGame, nextLevel, resumeFromSave } from "./level.js";
import { loadSave } from "./savegame.js";
import { unlock, toggleMute, music } from "./audio.js";
import { emit } from "./events.js";
import { openPause, handlePauseKeydown } from "./pause.js";
import { openOptions, handleOptionsEdge, optionsScreen } from "./optionsmenu.js";

/* ---- Raw input state (still exported: mouse aim, M mute, debug) ---------- */
export const keys = {};
export const mouse = { sx:VIEW_W/2, sy:VIEW_H/2, down:false, moved:false };

// Screen-space (y-down) unit vectors per cardinal. Diagonals are sums of these.
const DIR = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };

// Keys the game consumes during play — preventDefault so letters/symbols don't
// trigger browser shortcuts. Built from the cardinal assignments + deploy keys.
const HANDLED_KEYS = new Set([
  ...Object.values(CFG.KEYS.MOVE),
  ...Object.values(CFG.KEYS.FIRE),
  "e", "f",
]);

/* ---- Keyboard helpers --------------------------------------------------- */
// Vector sum of held cardinal keys from a {N,E,S,W} map. Opposing keys cancel.
function keyboardVec(map){
  let x = 0, y = 0;
  for (const d of ["N", "E", "S", "W"]){
    if (keys[map[d]]){ x += DIR[d][0]; y += DIR[d][1]; }
  }
  return { x, y };
}

/* ---- Gamepad polling ---------------------------------------------------- */
// Cached connected pad (index 0). Refreshed every frame by pollGamepad so the
// getters below read fresh axes/buttons. Null when nothing is connected.
let pad = null;
let prevStart = false;        // edge-detect BTN_START (start/restart a run)
let padWasNull = true;        // true until first frame a pad is visible

window.addEventListener('gamepadconnected',    () => { prevStart = false; padWasNull = false; });
window.addEventListener('gamepaddisconnected', () => { pad = null; prevStart = false; padWasNull = true; });

// Poll the first gamepad each frame, in EVERY state (so the title can be started
// by a pad). No-op when none is connected. Edge-triggers a run start/restart from
// BTN_START. Called from update.js before any state branching.
export function pollGamepad(){
  pad = (navigator.getGamepads ? navigator.getGamepads()[0] : null) || null;

  // Drive the title's Options screen every frame regardless of gamepad presence
  // (keyboard alone must be able to navigate it) — must run before the no-pad
  // early return below.
  if (G.state === "title" && G._titlePhase === "options") pollTitleOptions();

  if (!pad){ prevStart = false; padWasNull = true; return; }

  const start = CFG.GAMEPAD.BTN_START.some(i => pad.buttons[i] && pad.buttons[i].pressed);

  // First frame the pad becomes visible: seed prevStart without acting.
  // Prevents a button held at page-load time from auto-firing, and avoids
  // a missed-edge when the tap straddles the gamepadconnected boundary.
  if (padWasNull){
    prevStart = start;
    padWasNull = false;
    return;
  }

  if (start && !prevStart && !G._showLifetimeModal && !G._showAchievementModal){
    unlock();
    if (G.state === "title"){
      if (G._titlePhase === "input") advanceTitleToMode("gamepad");
      // mode/playlist phases handled by pollTitleMenu below
    } else if (G.state === "playing"){
      openPause();
    } else if (G.state === "dead" && G.inputMode === "gamepad"){
      startRun("gamepad");
    }
    // levelclear auto-advances; nothing to trigger there.
  }
  prevStart = start;

  // Title "input" phase: BTN_VIEW (X) rising edge opens Options (gamepad path).
  const view = CFG.GAMEPAD.BTN_VIEW.some(i => pad.buttons[i] && pad.buttons[i].pressed);
  if (view && !_prevView && G.state === "title" && G._titlePhase === "input"
      && !G._showLifetimeModal){
    unlock();
    G.inputMode = "gamepad";   // preview only — startRun() re-locks it for the run
    openOptions();
    G._titlePhase = "options";
  }
  _prevView = view;

  // Navigate the mode/playlist menu via d-pad when the title is past "input" phase.
  if (G.state === "title" && (G._titlePhase === "mode" || G._titlePhase === "playlist")){
    pollTitleMenu();
  }
}

/* ---- Achievement modal input (Phase 6) ----------------------------------
   Polled every frame from update.js BEFORE state branching, so it governs the
   post-level modal (over levelclear), the lifetime modal (over title or
   post-level), and the title's "View All Achievements" entry point.

   Device-agnostic: routes to keyboard or gamepad by G.inputMode, EXCEPT on the
   title before a run is started (G.inputMode === null) where either device may
   open the lifetime modal — picking a device there must NOT lock the run's mode.
   Edges are tracked per-frame against held-state for both devices uniformly. */
const _modalPrev = { confirm:false, view:false, back:false, scroll:0 };

// Held-state of an abstract modal action for the CURRENTLY routed device.
// mode === null → either device counts (title-only, pre-run).
function _modalHeld(action, mode){
  const kb = () => {
    switch (action){
      case 'confirm': return !!(keys[" "] || keys["enter"]);
      case 'view':    return !!keys["v"];
      case 'back':    return !!(keys["escape"] || keys["backspace"]);
      case 'scroll':  return (keys["arrowdown"]||keys["s"]?1:0) - (keys["arrowup"]||keys["w"]?1:0);
    }
  };
  const gp = () => {
    if (!pad) return action === 'scroll' ? 0 : false;
    const any = idxs => idxs.some(i => pad.buttons[i] && pad.buttons[i].pressed);
    switch (action){
      case 'confirm': return any(CFG.GAMEPAD.BTN_START);
      case 'view':    return any(CFG.GAMEPAD.BTN_VIEW);
      case 'back':    return any(CFG.GAMEPAD.BTN_BACK);
      case 'scroll': {
        const ay = pad.axes[1] || 0;
        return Math.abs(ay) > CFG.GAMEPAD.moveDeadzone ? Math.sign(ay) : 0;
      }
    }
  };
  if (mode === "gamepad") return gp();
  if (mode === "keyboard") return kb();
  // title pre-run: either device
  if (action === 'scroll') return kb() || gp();
  return kb() || gp();
}

export function pollModals(dt){
  const mode = G.inputMode;   // null on the title before a run is locked

  // --- Lifetime modal active: scroll + dismiss back to its opener ---
  if (G._showLifetimeModal){
    const s = _modalHeld('scroll', mode);
    G._lifetimeScrollY += s * 600 * dt;   // arrow/stick scrolling
    G._lifetimeScrollY = Math.max(0, Math.min(G._lifetimeScrollY, G._lifetimeMaxScroll));

    const back = _modalHeld('back', mode);
    if (back && !_modalPrev.back){
      G._showLifetimeModal = false;       // return to whichever surface opened it
      // _lifetimeModalFrom === 'postlevel' leaves _showAchievementModal up;
      // 'title' simply returns to the title (nothing else to restore).
    }
    _modalPrev.back = back;
    _modalPrev.confirm = _modalHeld('confirm', mode);
    _modalPrev.view = _modalHeld('view', mode);
    return;
  }

  // --- Post-level modal active: Continue / View All ---
  if (G._showAchievementModal){
    const confirm = _modalHeld('confirm', mode);
    const view = _modalHeld('view', mode);
    if (confirm && !_modalPrev.confirm){
      G._showAchievementModal = false;    // Continue → resume the normal advance
      nextLevel();
    } else if (view && !_modalPrev.view){
      G._showLifetimeModal = true;        // View All → open lifetime modal over it
      G._lifetimeModalFrom = 'postlevel';
      G._lifetimeScrollY = 0;
    }
    _modalPrev.confirm = confirm;
    _modalPrev.view = view;
    _modalPrev.back = _modalHeld('back', mode);
    return;
  }

  // --- Title screen: "View All Achievements" opens the lifetime modal ---
  if (G.state === "title"){
    const view = _modalHeld('view', mode);
    if (view && !_modalPrev.view){
      G._showLifetimeModal = true;
      G._lifetimeModalFrom = 'title';
      G._lifetimeScrollY = 0;
    }
    _modalPrev.view = view;
  }

  // Keep edges fresh when no modal owns the frame.
  _modalPrev.confirm = _modalHeld('confirm', mode);
  _modalPrev.back = _modalHeld('back', mode);
}

/* ---- Abstracted input API ----------------------------------------------- */
// Normalized move direction. Keyboard: vector sum of held MOVE keys. Gamepad:
// left stick past the deadzone (full speed regardless of stick depth, GDD §4.6).
export function getMoveVec(){
  if (G.inputMode === "gamepad"){
    if (!pad) return { x:0, y:0 };
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const m = Math.hypot(ax, ay);
    if (m > CFG.GAMEPAD.moveDeadzone) return { x:ax/m, y:ay/m };
    return { x:0, y:0 };
  }
  const v = keyboardVec(CFG.KEYS.MOVE);
  const m = Math.hypot(v.x, v.y);
  if (m > 0) return { x:v.x/m, y:v.y/m };
  return { x:0, y:0 };
}

// Fire angle (radians) or null when not firing. Keyboard: vector sum of held FIRE
// keys (opposing cancel -> null), else mouse direction while the left button is
// held. Gamepad: right stick angle past the deadzone (GDD §4.3, §4.7).
export function getFireAngle(){
  if (G.inputMode === "gamepad"){
    if (!pad) return null;
    const ax = pad.axes[2] || 0, ay = pad.axes[3] || 0;
    if (Math.hypot(ax, ay) > CFG.GAMEPAD.fireDeadzone) return Math.atan2(ay, ax);
    return null;
  }
  const v = keyboardVec(CFG.KEYS.FIRE);
  if (v.x || v.y) return Math.atan2(v.y, v.x);
  if (mouse.down){
    const mwx = mouse.sx + G.camera.x, mwy = mouse.sy + G.camera.y;
    return Math.atan2(mwy - G.dan.y, mwx - G.dan.x);
  }
  return null;
}

// Edge-triggered special deploy: true only on the frame it's first pressed.
// Keyboard: E or F. Gamepad: any BTN_SPECIAL (bumper/trigger). MUST be called once
// per frame (it is, from updateDustbin) for the edge to track correctly.
let prevDeploy = false;
export function isDeploySpecial(){
  let pressed;
  if (G.inputMode === "gamepad"){
    pressed = !!pad && CFG.GAMEPAD.BTN_SPECIAL.some(i => pad.buttons[i] && pad.buttons[i].pressed);
  } else {
    pressed = !!(keys["e"] || keys["f"]);
  }
  const edge = pressed && !prevDeploy;
  prevDeploy = pressed;
  return edge;
}

/* ---- Run start / restart ------------------------------------------------ */
// Begin a run in the chosen device mode + game mode. newGame() builds the world;
// we lock the input device after so the rest of the run reads from that only
// (GDD §4.5). gameMode and playlist are set on G before newGame() so buildLevel
// can route correctly.
function startRun(inputDevice, gameMode = "levelPlan", playlist = null){
  G.gameMode = gameMode;
  G.playlist = playlist;
  G.playlistIndex = 0;
  music.stop();
  newGame();
  G.inputMode = inputDevice;
  G._titlePhase = "input";    // reset for next visit to title
  emit('run:input_mode_set', { mode: inputDevice });
  // Resolve track for level 1 (musicTrackIndex=0, playlistIndex=0 set by newGame).
  const entry = G.gameMode === "handAuthored" && G.playlist
    ? G.playlist.levels[0]
    : null;
  const startId = entry && entry.music ? entry.music : null;
  music.playGameplay(startId, 0);
}

// Load a save from the title load screen. Empty slot = no-op.
// Always uses keyboard mode — the opposing device still works in-game.
function _tryLoadFromTitle(slot){
  const data = loadSave(slot);
  if (!data) return;
  music.stop();
  newGame();
  G.inputMode = "keyboard";
  resumeFromSave(data, G.availablePlaylists);
  G._titlePhase = "input";
  // Resolve the track for the restored level (G.musicTrackIndex not in saves; default 0).
  const restoredEntry = G.gameMode === "handAuthored" && G.playlist
    ? G.playlist.levels[G.playlistIndex % G.playlist.levels.length]
    : null;
  const savedId = restoredEntry && restoredEntry.music ? restoredEntry.music : null;
  music.playGameplay(savedId, G.musicTrackIndex ?? 0);
}

// Advance _titlePhase after the player has locked an input device.
// Called from keydown (keyboard) and pollGamepad (gamepad) once device is chosen.
function advanceTitleToMode(inputDevice){
  G.inputMode = inputDevice;   // lock device for menu navigation
  G._titlePhase = "mode";
  _modeJustEntered = true;     // one-frame guard against the same-frame double-edge
  G._titleMenuCursor = 0;
}

// Handle a numeric selection [1..n] on the mode or playlist screen.
function titleMenuSelect(n){
  if (G._titlePhase === "mode"){
    if (n === 1){
      startRun(G.inputMode, "levelPlan", null);
    } else if (n === 2 && G.availablePlaylists.length > 0){
      if (G.availablePlaylists.length === 1){
        startRun(G.inputMode, "handAuthored", G.availablePlaylists[0]);
      } else {
        G._titlePhase = "playlist";
      }
    }
  } else if (G._titlePhase === "playlist"){
    const pl = G.availablePlaylists[n - 1];
    if (pl) startRun(G.inputMode, "handAuthored", pl);
  }
}

// Gamepad D-pad / cursor selection for the mode + playlist menus.
let _prevConfirm = false, _prevUp = false, _prevDown = false, _prevBack = false;
let _modeJustEntered = false;   // set when advanceTitleToMode ran this frame
function pollTitleMenu(){
  if (!pad) return;
  const confirm = CFG.GAMEPAD.BTN_START.some(i => pad.buttons[i] && pad.buttons[i].pressed);
  const up   = pad.buttons[12] && pad.buttons[12].pressed;
  const down = pad.buttons[13] && pad.buttons[13].pressed;
  const back = CFG.GAMEPAD.BTN_BACK.some(i => pad.buttons[i] && pad.buttons[i].pressed);

  // Guards the same-frame double-edge: entering "mode" during pollGamepad must not
  // let the still-held START read as a fresh confirm here. Seed all edges from the
  // current pad reads and skip acting for this one frame.
  if (_modeJustEntered){
    _prevConfirm = confirm; _prevUp = up; _prevDown = down; _prevBack = back;
    _modeJustEntered = false;
    return;
  }

  // B backs out one level: playlist → mode → input.
  if (back && !_prevBack){
    if (G._titlePhase === "playlist")   G._titlePhase = "mode";
    else if (G._titlePhase === "mode")  G._titlePhase = "input";
    G._titleMenuCursor = 0;
    _prevConfirm = confirm; _prevUp = up; _prevDown = down; _prevBack = back;
    return;
  }

  if (up && !_prevUp)   G._titleMenuCursor = Math.max(0, G._titleMenuCursor - 1);
  if (down && !_prevDown){
    const maxOpts = G._titlePhase === "mode"
      ? (G.availablePlaylists.length > 0 ? 2 : 1)
      : G.availablePlaylists.length;
    G._titleMenuCursor = Math.min(maxOpts - 1, G._titleMenuCursor + 1);
  }
  if (confirm && !_prevConfirm) titleMenuSelect(G._titleMenuCursor + 1);

  _prevConfirm = confirm; _prevUp = up; _prevDown = down; _prevBack = back;
}

/* ---- Title Options polling (Part C) --------------------------------------
   Self-contained edge tracker for the title's "options" phase — does NOT reuse
   pause.js's private _held/_edge (per CLAUDE.md instructions), following the
   same prev-state edge-detection pattern as pollTitleMenu above. */
let _optPrevUp = false, _optPrevDown = false, _optPrevLeft = false, _optPrevRight = false;
let _optPrevConfirm = false, _optPrevBack = false;
let _prevView = false;   // gamepad BTN_VIEW rising-edge (title "input" phase only)

function _titleOptionsHeld(action){
  const kb = () => {
    switch (action){
      case "up":      return !!(keys["arrowup"]    || keys["w"]);
      case "down":     return !!(keys["arrowdown"]   || keys["s"]);
      case "left":    return !!(keys["arrowleft"]   || keys["a"]);
      case "right":   return !!(keys["arrowright"]  || keys["d"]);
      case "confirm": return !!(keys["enter"] || keys[" "]);
      case "back":    return !!(keys["escape"]);
    }
    return false;
  };
  const gp = () => {
    if (!pad) return false;
    const btn = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
    switch (action){
      case "up":      return btn(12) || (pad.axes[1] || 0) < -0.5;
      case "down":    return btn(13) || (pad.axes[1] || 0) > 0.5;
      case "left":    return btn(14) || (pad.axes[0] || 0) < -0.5;
      case "right":   return btn(15) || (pad.axes[0] || 0) > 0.5;
      case "confirm": return CFG.GAMEPAD.BTN_START.some(btn);
      case "back":    return CFG.GAMEPAD.BTN_BACK.some(btn);
    }
    return false;
  };
  if (G.inputMode === "gamepad") return gp();
  if (G.inputMode === "keyboard") return kb();
  return kb() || gp();
}

// Polls the title's Options screen once G._titlePhase === "options". Builds
// fresh edges each frame and drives optionsmenu.js's handleOptionsEdge
// (mirrors pause.js's _pollOptionsScreen, minus the private _held/_edge reuse).
function pollTitleOptions(){
  const up = _titleOptionsHeld("up"), down = _titleOptionsHeld("down");
  const left = _titleOptionsHeld("left"), right = _titleOptionsHeld("right");
  const confirm = _titleOptionsHeld("confirm"), back = _titleOptionsHeld("back");
  const edgeUp = up && !_optPrevUp, edgeDown = down && !_optPrevDown;
  const edgeLeft = left && !_optPrevLeft, edgeRight = right && !_optPrevRight;
  const edgeConfirm = confirm && !_optPrevConfirm, edgeBack = back && !_optPrevBack;

  for (const [edge, action] of [[edgeUp,"up"],[edgeDown,"down"],[edgeConfirm,"confirm"],[edgeBack,"back"]]){
    if (edge){
      const result = handleOptionsEdge(action, left, right);
      if (result === "exit") G._titlePhase = "input";
    }
  }
  if (optionsScreen() === "options"){
    if (left || right) handleOptionsEdge(right ? "right" : "left", left, right);
  } else {
    if (edgeLeft || edgeRight) handleOptionsEdge("left", left, right);
  }

  _optPrevUp = up; _optPrevDown = down; _optPrevLeft = left; _optPrevRight = right;
  _optPrevConfirm = confirm; _optPrevBack = back;
}

/* ---- Listeners ---------------------------------------------------------- */
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  unlock();                          // resume AudioContext on first gesture (autoplay policy)
  if (k === "m" && !e.repeat) toggleMute();   // M = mute toggle (GDD §10 audio)
  if (G.state === "playing" && HANDLED_KEYS.has(k)) e.preventDefault();
  keys[k] = true;

  // Delegate to pause.js for name entry (Phase 3) and ESC back-navigation.
  if (G.state === "paused") handlePauseKeydown(e);

  // ESC while playing → open pause menu.
  if (e.key === "Escape"
      && G.state === "playing"
      && !G._showAchievementModal
      && !G._showLifetimeModal){
    openPause();
    return;
  }

  // Title "load" phase key handling
  if (G.state === "title" && G._titlePhase === "load" && !G._showLifetimeModal){
    if (k === "escape")                         { G._titlePhase = "input"; return; }
    if (k === "arrowup"   || k === "w")
      G._loadSaveCursor = (G._loadSaveCursor - 1 + 5) % 5;
    if (k === "arrowdown" || k === "s")
      G._loadSaveCursor = (G._loadSaveCursor + 1) % 5;
    if (k === "enter" || k === " ")             { _tryLoadFromTitle(G._loadSaveCursor); }
    return;
  }

  // Title ESC back-navigation out of mode/playlist: playlist → mode → input.
  if (G.state === "title" && k === "escape" && !G._showLifetimeModal
      && (G._titlePhase === "mode" || G._titlePhase === "playlist")){
    if (G._titlePhase === "playlist")   G._titlePhase = "mode";
    else                                G._titlePhase = "input";
    G._titleMenuCursor = 0;
    return;
  }

  // Title "input" phase: L key opens the load screen
  if (G.state === "title" && G._titlePhase === "input" && k === "l"){
    G._titlePhase = "load";
    G._loadSaveCursor = 0;
    return;
  }

  // Title "input" phase: O key opens Options (keyboard path).
  if (G.state === "title" && G._titlePhase === "input" && k === "o" && !G._showLifetimeModal){
    openOptions();
    G._titlePhase = "options";
    return;
  }

  // Title: SPACE/ENTER selects keyboard+mouse mode and starts. Dead: same key
  // restarts, but only when the run was in keyboard mode (gamepad disables it).
  if (e.key === " " || e.key === "Enter"){
    // A lifetime modal over the title swallows the start key (it's dismissed via
    // ESC/BACKSPACE, handled in pollModals), so SPACE doesn't punch into a run.
    if (G._showLifetimeModal){ /* modal owns input */ }
    else if (G.state === "title"){
      if (G._titlePhase === "input") advanceTitleToMode("keyboard");
      // mode/playlist phases use numeric keys (1/2/3…) handled below
    }
    else if (G.state === "dead" && G.inputMode === "keyboard") startRun("keyboard");
  }
  // Numeric key selection on mode/playlist screens (keyboard mode, title phase > "input")
  if (G.state === "title" && G._titlePhase !== "input" && !G._showLifetimeModal){
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= 9) titleMenuSelect(digit);
  }
});
addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  mouse.sx = (e.clientX - r.left) * (VIEW_W / r.width);
  mouse.sy = (e.clientY - r.top)  * (VIEW_H / r.height);
});
canvas.addEventListener("mousedown", () => {
  mouse.down = true;
  unlock();                          // resume AudioContext on first gesture (autoplay policy)
  if (G._showLifetimeModal) return;  // modal over the title swallows the click
  // Mouse is part of keyboard+mouse mode: clicking title advances phase like SPACE.
  if (G.state === "title" && G._titlePhase === "input") advanceTitleToMode("keyboard");
  else if (G.state === "dead" && G.inputMode === "keyboard") startRun("keyboard");
});
addEventListener("mouseup", () => { mouse.down = false; });
// Touch fallback so it isn't dead on mobile (keyboard+mouse mode).
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  unlock();                          // resume AudioContext on first gesture (autoplay policy)
  if (G.state === "title" && G._titlePhase === "input") advanceTitleToMode("keyboard");
  else if (G.state === "dead" && G.inputMode === "keyboard") startRun("keyboard");
}, {passive:false});
