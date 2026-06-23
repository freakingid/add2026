/* =========================================================================
   input.js — keyboard + mouse + touch. Registers its listeners on import
   (side-effect module). Exposes the current key state, mouse position, and the
   active keyboard fire angle for the player module; starts a new run on
   click/space/enter from the title/dead screens.
   ========================================================================= */
import { canvas, VIEW_W, VIEW_H } from "./canvas.js";
import { G } from "./state.js";
import { newGame } from "./level.js";

/* ---- Input -------------------------------------------------------------- */
export const keys = {};
export const mouse = { sx:VIEW_W/2, sy:VIEW_H/2, down:false, moved:false };

// Keyboard directional fire grid — 3x3 block on the right hand (compass dirs).
// (Diverges from GDD 4.3; see STATUS.) Center key `l` = no-fire.
//   i  o  p        NW  N  NE
//   k  l  ;   ==>  W  (·)  E
//   ,  .  /        SW  S  SE
// Angles in screen space (y-down): right=0, down=+PI/2, up=-PI/2.
const FIRE_ANGLES = {
  "i": -Math.PI*0.75, "o": -Math.PI*0.5,  "p": -Math.PI*0.25,
  "k":  Math.PI,                          ";":  0,
  ",":  Math.PI*0.75, ".":  Math.PI*0.5,  "/":  Math.PI*0.25,
};
// Stack of currently-held fire keys; top = most recent = active.
const fireKeyStack = [];

// Every key the game consumes — preventDefault these during play so symbols
// like ' and / don't trigger the browser's quick-find.
const HANDLED_KEYS = new Set(["w","a","s","d","e","f", ...Object.keys(FIRE_ANGLES)]);

addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (G.state === "playing" && HANDLED_KEYS.has(k)) e.preventDefault();
  if (!keys[k] && k in FIRE_ANGLES){
    const i = fireKeyStack.indexOf(k);
    if (i !== -1) fireKeyStack.splice(i, 1);
    fireKeyStack.push(k);
  }
  keys[k] = true;
  if ((G.state === "title" || G.state === "dead") && (e.key === " " || e.key === "Enter")) newGame();
});
addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  keys[k] = false;
  const i = fireKeyStack.indexOf(k);
  if (i !== -1) fireKeyStack.splice(i, 1);
});

// Returns the active keyboard fire angle, or null if no fire key is held.
export function keyboardFireAngle(){
  for (let i = fireKeyStack.length - 1; i >= 0; i--){
    if (keys[fireKeyStack[i]]) return FIRE_ANGLES[fireKeyStack[i]];
  }
  return null;
}

canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  mouse.sx = (e.clientX - r.left) * (VIEW_W / r.width);
  mouse.sy = (e.clientY - r.top)  * (VIEW_H / r.height);
});
canvas.addEventListener("mousedown", () => {
  mouse.down = true;
  if (G.state === "title" || G.state === "dead") newGame();
});
addEventListener("mouseup", () => { mouse.down = false; });
// Touch fallback so it isn't dead on mobile
canvas.addEventListener("touchstart", e => {
  e.preventDefault();
  if (G.state === "title" || G.state === "dead") newGame();
}, {passive:false});
