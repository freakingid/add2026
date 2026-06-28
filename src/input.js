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
import { newGame, loadLevel, nextLevel } from "./level.js";
import { unlock, toggleMute } from "./audio.js";
import { AUTHORED_LEVELS } from "./levels/authored-levels.js";
import { addFloat } from "./effects.js";
import { emit } from "./events.js";

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
    if (G.state === "title") startRun("gamepad");
    else if (G.state === "dead" && G.inputMode === "gamepad") startRun("gamepad");
    // levelclear auto-advances; nothing to trigger there.
  }
  prevStart = start;
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
// Begin a run in the chosen mode. newGame() builds the world; we lock the mode
// after so the rest of the run reads input from that device only (GDD §4.5).
function startRun(mode){
  newGame();
  G.inputMode = mode;
  emit('run:input_mode_set', { mode });
}

/* ---- Debug: cycle the hand-authored levels (src/levels/authored-levels.js) --
   `]` loads the next AUTHORED_LEVELS entry through the SAME loader the game uses,
   so each can be walked/inspected without playing through generated levels to
   reach it. Playing-only: loadLevel repositions the existing Dan but never
   allocates one (G.dan is null on the title). G.level is left untouched, so the
   spawn cadence keeps running off the authored terminals' own enemy types. */
const AUTHORED_KEYS = Object.keys(AUTHORED_LEVELS);
let authoredIdx = -1;
function cycleAuthoredLevel(){
  authoredIdx = (authoredIdx + 1) % AUTHORED_KEYS.length;
  const key = AUTHORED_KEYS[authoredIdx];
  loadLevel(AUTHORED_LEVELS[key]);
  addFloat(G.dan.x, G.dan.y - 22, "▶ " + key, "#7fd1ff");
}

/* ---- Listeners ---------------------------------------------------------- */
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  unlock();                          // resume AudioContext on first gesture (autoplay policy)
  if (k === "m" && !e.repeat) toggleMute();   // M = mute toggle (GDD §10 audio)
  if (k === "]" && !e.repeat && G.state === "playing") cycleAuthoredLevel();   // debug: cycle authored levels
  if (G.state === "playing" && HANDLED_KEYS.has(k)) e.preventDefault();
  keys[k] = true;
  // Title: SPACE/ENTER selects keyboard+mouse mode and starts. Dead: same key
  // restarts, but only when the run was in keyboard mode (gamepad disables it).
  if (e.key === " " || e.key === "Enter"){
    // A lifetime modal over the title swallows the start key (it's dismissed via
    // ESC/BACKSPACE, handled in pollModals), so SPACE doesn't punch into a run.
    if (G._showLifetimeModal){ /* modal owns input */ }
    else if (G.state === "title") startRun("keyboard");
    else if (G.state === "dead" && G.inputMode === "keyboard") startRun("keyboard");
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
  // Mouse is part of keyboard+mouse mode: clicking the title/dead screen starts there.
  if (G.state === "title") startRun("keyboard");
  else if (G.state === "dead" && G.inputMode === "keyboard") startRun("keyboard");
});
addEventListener("mouseup", () => { mouse.down = false; });
// Touch fallback so it isn't dead on mobile (keyboard+mouse mode).
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  unlock();                          // resume AudioContext on first gesture (autoplay policy)
  if (G.state === "title") startRun("keyboard");
  else if (G.state === "dead" && G.inputMode === "keyboard") startRun("keyboard");
}, {passive:false});
