/* =========================================================================
   menuedge.js — shared menu edge-detection for title + pause Options/Controls
   navigation. Pure leaf: no imports from input.js or pause.js.

   CIRCULAR IMPORT NOTE (mirrors pause.js): registers its own module-local
   _keys{} via its own keydown/keyup listeners rather than importing `keys`
   from input.js. Duplicate listeners on the same events are harmless — both
   track the same physical keys independently. See pause.js's top-of-file note.
   ========================================================================= */

/* ---- Module-local key state ----------------------------------------------- */
const _keys = {};
if (typeof window !== "undefined"){
  window.addEventListener("keydown", e => { _keys[e.key.toLowerCase()] = true; });
  window.addEventListener("keyup",   e => { _keys[e.key.toLowerCase()] = false; });
}

/* ---- menuHeld -------------------------------------------------------------- */
// action: "up"|"down"|"left"|"right"|"confirm"|"back"
// pad: a Gamepad (or null); inputMode: "keyboard"|"gamepad"|null
export function menuHeld(action, pad, inputMode){
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
    if (!pad) return false;
    const btn = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
    switch(action){
      case "up":      return btn(12) || (pad.axes[1] || 0) < -0.5;
      case "down":    return btn(13) || (pad.axes[1] || 0) > 0.5;
      case "left":    return btn(14) || (pad.axes[0] || 0) < -0.5;
      case "right":   return btn(15) || (pad.axes[0] || 0) > 0.5;
      case "confirm": return btn(0) || btn(9);   // A or Start
      case "back":    return btn(1);             // B
    }
    return false;
  };
  if (inputMode === "gamepad") return gp();
  if (inputMode === "keyboard") return kb();
  return kb() || gp();
}

/* ---- makeEdgeTracker -------------------------------------------------------- */
// Returns an instance-scoped tracker so title and pause each get their own
// _prev{} without stepping on each other.
export function makeEdgeTracker(){
  const _prev = { up:false, down:false, left:false, right:false, confirm:false, back:false };

  function edge(action, pad, inputMode){
    const now = menuHeld(action, pad, inputMode);
    const isEdge = now && !_prev[action];
    _prev[action] = now;
    return isEdge;
  }

  function refresh(pad, inputMode){
    for (const a of ["up","down","left","right","confirm","back"]){
      _prev[a] = menuHeld(a, pad, inputMode);
    }
  }

  return { edge, refresh };
}
