# Pause Menu + Save/Load System — Implementation Spec

Canonical implementation reference. Read this fully before touching any code.
Claude Code: read this file at the start of every phase session.

---

## Overview

Two tightly-coupled features:
- **`savegame.js`** — new leaf module, pure localStorage, no game-state imports
- **`pause.js`** — new module owning all pause draw + input; sub-screens for menu,
  options, save picker, quit confirm, canvas name-entry
- Wire-in to `update.js`, `render.js`, `input.js`, `screens.js`, `level.js`

Game states after this work: `title | playing | paused | levelclear | dead`

---

## File: `src/savegame.js` (NEW)

Pure leaf module. No imports from game modules. Only imports nothing (standalone).

### localStorage keys

```
add_save_0  ..  add_save_4    — five save slots (0-indexed)
add_prefs                     — volume/audio preferences
add_high                      — global high score (single value, not per-slot)
```

### Save slot schema (JSON)

```js
{
  version: 1,                   // bump if schema changes
  name: string,                 // player-entered name, max 20 chars
  savedAt: number,              // Date.now()
  score: number,
  level: number,
  gameMode: "levelPlan" | "handAuthored",
  playlistName: string | null,
  playlistFilename: string | null,
  playlistIndex: number,
  dan: {
    hp: number,
    hasDustbin: boolean,
  },
  powerups: {
    rapid: number,
    triple: number,
    bounce: number,
  },
}
```

**Note:** `high` is NOT saved per slot. It lives separately under `add_high`
(managed by `savegame.js` but as a global, not slot data).

### Prefs schema (JSON)

```js
{
  masterVolume: number,   // 0.0 .. 1.0, default 0.35 (= CFG.AUDIO.master)
}
```

### Exported functions

```js
// Returns array of 5 entries: { slot:number, data: saveObject | null }
export function listSaves()

// Writes slot. name is already validated (trimmed, max 20 chars) by caller.
export function saveGame(slot, name, snapshot)

// Returns save object or null if slot is empty.
export function loadSave(slot)

// Clears the slot.
export function deleteSave(slot)

// Prefs (separate from slots)
export function loadPrefs()        // → { masterVolume: number }
export function savePrefs(prefs)   // → void

// High score (global)
export function loadHighScore()    // → number (0 if not set)
export function saveHighScore(n)   // → void
```

`saveGame` takes a plain `snapshot` object (the caller builds it from G fields).
`savegame.js` does NOT import state.js — it never reads G directly.

### listSaves detail

```js
export function listSaves(){
  const result = [];
  for (let i = 0; i < 5; i++){
    const raw = localStorage.getItem(`add_save_${i}`);
    let data = null;
    if (raw){
      try { data = JSON.parse(raw); }
      catch(e){ data = null; }   // corrupt slot → treat as empty
    }
    result.push({ slot: i, data });
  }
  return result;
}
```

---

## File: `src/level.js` (CHANGES)

### 1. Export `buildLevel`

Change `function buildLevel()` → `export function buildLevel()`.
No other changes to its body.

### 2. Add `resumeFromSave(saveData, availablePlaylists)`

```js
// Restores G fields from a save object, then builds the level.
// Called from pause.js after newGame() has set a clean slate.
// availablePlaylists is G.availablePlaylists (needed for playlist lookup).
export function resumeFromSave(saveData, availablePlaylists){
  // Restore run meta
  G.score  = saveData.score;
  G.level  = saveData.level;
  G.gameMode = saveData.gameMode;

  // Restore playlist if handAuthored mode
  if (saveData.gameMode === "handAuthored" && saveData.playlistFilename){
    const match = availablePlaylists.find(
      p => p.filename === saveData.playlistFilename
    );
    if (match){
      G.playlist = match;
      G.playlistIndex = saveData.playlistIndex;
    } else {
      // Playlist file gone — fall back to levelPlan gracefully
      G.gameMode = "levelPlan";
      G.playlist = null;
      G.playlistIndex = 0;
      // Caller (pause.js) is responsible for showing a notice if desired;
      // resumeFromSave just silently degrades.
    }
  } else {
    G.playlist = null;
    G.playlistIndex = 0;
  }

  // Restore persistent player state (carry-over fields, same as nextLevel)
  G.dan.hp         = Math.min(saveData.dan.hp, G.dan.maxHp);
  G.dan.hasDustbin = saveData.dan.hasDustbin;
  G.powerups       = { ...saveData.powerups };

  // Build the level at the saved level number
  buildLevel();
  G.state = "playing";
}
```

`resumeFromSave` is called AFTER `newGame()`, which already sets `G.dan` and
`G.powerups` to fresh defaults — so the overrides above are safe.

---

## File: `src/audio.js` (CHANGES)

Add ONE new export (after `isMuted`):

```js
// Set master volume (0..1). Respects mute: if muted, gain stays 0 but the
// stored volume is updated so unmute restores to the new level.
export function setMasterVolume(v){
  v = Math.max(0, Math.min(1, v));
  CFG.AUDIO.master = v;          // update the live config value
  if (master && !muted) master.gain.value = v;
}

export function getMasterVolume(){
  return CFG.AUDIO.master;
}
```

Note: `CFG` is already imported in `audio.js`. Mutating `CFG.AUDIO.master` is
intentional — it's the live source of truth the toggleMute path reads.

---

## File: `src/pause.js` (NEW)

### Imports

```js
import { ctx, VIEW_W, VIEW_H } from "./canvas.js";
import { G } from "./state.js";
import { COL } from "./palette.js";
import { sfx, isMuted, setMasterVolume, getMasterVolume } from "./audio.js";
import { buildLevel, resumeFromSave, newGame } from "./level.js";
import { listSaves, saveGame, deleteSave, loadPrefs, savePrefs } from "./savegame.js";
import { getWeeklyAchievements } from "./achievements.js";
import { emit } from "./events.js";
```

### Module-local state

```js
// Sub-screen within the pause overlay.
// "menu" | "options" | "save" | "confirm_overwrite" | "confirm_quit" | "name_entry"
let subScreen = "menu";

// Root menu cursor (0=Continue, 1=Options, 2=Save & Quit, 3=Quit)
let menuCursor = 0;
const MENU_ITEMS = ["CONTINUE", "OPTIONS", "SAVE & QUIT", "QUIT"];

// Save screen state
let saveCursor = 0;          // 0..4: which slot is highlighted
let saveSlots = [];          // cached listSaves() result; refresh on entering "save"
let pendingOverwriteSlot = -1;  // slot chosen when "confirm_overwrite" is shown

// Name entry state
let nameBuffer = "";           // characters entered so far
let nameCursorBlink = 0;       // timer for cursor blink (advances each frame)
let nameTargetSlot = -1;       // slot to write after name is confirmed

// Options state — reflect live audio values on entry
let optVolume = 0.35;          // mirrors getMasterVolume() on entry to options

// Input edge detection (keyboard + gamepad both use these)
const _prev = {
  up: false, down: false, confirm: false, back: false, char: ""
};

// Gamepad reference (refreshed by pollPause via navigator.getGamepads)
let _pad = null;
```

### `export function openPause()`

Called from input.js when ESC or START is pressed during "playing":

```js
export function openPause(){
  subScreen = "menu";
  menuCursor = 0;
  sfx.conveyor(false);    // kill belt hum immediately
  G.state = "paused";
}
```

### `export function closePause()`

Called when "CONTINUE" is selected or ESC from root menu:

```js
export function closePause(){
  G.state = "playing";
  // Belt hum will naturally resume next update() frame if Dan is on a belt.
}
```

---

### `export function pollPause(dt)`

Dispatches to sub-screen poll functions. Called every frame from update.js
while G.state === "paused".

```js
export function pollPause(dt){
  _pad = (navigator.getGamepads ? navigator.getGamepads()[0] : null) || null;
  nameCursorBlink += dt;

  switch(subScreen){
    case "menu":             _pollMenu(); break;
    case "options":          _pollOptions(); break;
    case "save":             _pollSave(); break;
    case "confirm_overwrite":_pollConfirmOverwrite(); break;
    case "confirm_quit":     _pollConfirmQuit(); break;
    case "name_entry":       _pollNameEntry(); break;
  }
}
```

#### Input helpers

```js
function _held(action){
  // Returns current held-state for keyboard or gamepad
  // action: "up" | "down" | "confirm" | "back" | "left" | "right"
  const kb = () => {
    switch(action){
      case "up":      return !!(keys["arrowup"]   || keys["w"]);
      case "down":    return !!(keys["arrowdown"]  || keys["s"]);
      case "left":    return !!(keys["arrowleft"]  || keys["a"]);
      case "right":   return !!(keys["arrowright"] || keys["d"]);
      case "confirm": return !!(keys["enter"] || keys[" "]);
      case "back":    return !!(keys["escape"] || keys["backspace"]);
    }
  };
  const gp = () => {
    if (!_pad) return false;
    const btn = i => _pad.buttons[i] && _pad.buttons[i].pressed;
    switch(action){
      case "up":      return btn(12) || (_pad.axes[1] || 0) < -0.5;
      case "down":    return btn(13) || (_pad.axes[1] || 0) > 0.5;
      case "left":    return btn(14) || (_pad.axes[0] || 0) < -0.5;
      case "right":   return btn(15) || (_pad.axes[0] || 0) > 0.5;
      case "confirm": return btn(0) || btn(9);    // A or Start
      case "back":    return btn(1);              // B
    }
  };
  // Route by inputMode when in a run; accept either pre-run (shouldn't happen but safe)
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

// Must be called at the end of each _poll* to keep _prev fresh for all actions
function _refreshEdges(){
  for (const a of ["up","down","left","right","confirm","back"]){
    _prev[a] = _held(a);
  }
}
```

NOTE: `keys` is imported from `input.js` (already exported). Add to imports:
```js
import { keys } from "./input.js";
```
This is safe — `input.js` exports `keys` as a plain object reference today.

#### `_pollMenu()`

```js
function _pollMenu(){
  if (_edge("up"))      menuCursor = (menuCursor - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
  if (_edge("down"))    menuCursor = (menuCursor + 1) % MENU_ITEMS.length;
  if (_edge("back"))  { closePause(); _refreshEdges(); return; }
  if (_edge("confirm")){
    switch(menuCursor){
      case 0: closePause(); break;                          // CONTINUE
      case 1: subScreen = "options";                        // OPTIONS
               optVolume = getMasterVolume(); break;
      case 2: subScreen = "save";                           // SAVE & QUIT
               saveSlots = listSaves();
               saveCursor = 0; break;
      case 3: subScreen = "confirm_quit"; break;            // QUIT
    }
  }
  _refreshEdges();
}
```

#### `_pollOptions()`

```js
function _pollOptions(){
  if (_edge("back")){ subScreen = "menu"; _refreshEdges(); return; }

  // Volume: left/right in small steps; also continuous-hold via dt (handled
  // by checking held state directly, not edge, for smooth slider movement).
  const leftHeld  = _held("left");
  const rightHeld = _held("right");
  if (leftHeld || rightHeld){
    const dir = rightHeld ? 1 : -1;
    optVolume = Math.max(0, Math.min(1, optVolume + dir * 0.005));
    setMasterVolume(optVolume);
    // Persist immediately so it survives without a Save
    savePrefs({ masterVolume: optVolume });
  }

  // Mute toggle: confirm key (not up/down — those are reserved for future options rows)
  if (_edge("confirm")){ sfx.toggleMute && toggleMute(); }

  _refreshEdges();
}
```

Wait — `toggleMute` is imported from audio.js not sfx. Fix:
```js
import { sfx, isMuted, setMasterVolume, getMasterVolume, toggleMute } from "./audio.js";
```
And in _pollOptions:
```js
if (_edge("confirm")){ toggleMute(); }
```

#### `_pollSave()`

```js
function _pollSave(){
  if (_edge("back")){ subScreen = "menu"; _refreshEdges(); return; }
  if (_edge("up"))   saveCursor = (saveCursor - 1 + 5) % 5;
  if (_edge("down")) saveCursor = (saveCursor + 1) % 5;

  if (_edge("confirm")){
    const slot = saveSlots[saveCursor];
    if (slot.data !== null){
      // Slot occupied — confirm overwrite
      pendingOverwriteSlot = saveCursor;
      subScreen = "confirm_overwrite";
    } else {
      // Empty slot — go straight to name entry
      nameTargetSlot = saveCursor;
      nameBuffer = "";
      nameCursorBlink = 0;
      subScreen = "name_entry";
    }
  }
  _refreshEdges();
}
```

#### `_pollConfirmOverwrite()`

```js
// YES/NO confirmation before overwriting an occupied slot.
// Cursor: 0=YES 1=NO
let _overwriteCursor = 0;

function _pollConfirmOverwrite(){
  if (_edge("back"))  { subScreen = "save"; _overwriteCursor = 0; _refreshEdges(); return; }
  if (_edge("left") || _edge("up"))   _overwriteCursor = 0;
  if (_edge("right") || _edge("down"))_overwriteCursor = 1;
  if (_edge("confirm")){
    if (_overwriteCursor === 0){
      // YES — go to name entry for the pending slot
      nameTargetSlot = pendingOverwriteSlot;
      nameBuffer = "";
      nameCursorBlink = 0;
      subScreen = "name_entry";
    } else {
      // NO — back to save picker
      subScreen = "save";
    }
    _overwriteCursor = 0;
  }
  _refreshEdges();
}
```

#### `_pollConfirmQuit()`

```js
// YES/NO confirmation before quitting without saving.
let _quitCursor = 0;   // 0=YES 1=NO

function _pollConfirmQuit(){
  if (_edge("back"))  { subScreen = "menu"; _quitCursor = 0; _refreshEdges(); return; }
  if (_edge("left") || _edge("up"))    _quitCursor = 0;
  if (_edge("right") || _edge("down")) _quitCursor = 1;
  if (_edge("confirm")){
    if (_quitCursor === 0){
      // YES — quit to title
      _doQuitToTitle();
    } else {
      // NO — back to menu
      subScreen = "menu";
    }
    _quitCursor = 0;
  }
  _refreshEdges();
}

function _doQuitToTitle(){
  G.high = Math.max(G.high, G.score);   // preserve high score before wiping
  G.state = "title";
  G._titlePhase = "input";
  sfx.conveyor(false);
  // Reset pause sub-screen for next time
  subScreen = "menu";
  menuCursor = 0;
}
```

#### `_pollNameEntry()`

Name entry uses raw keydown events. The keyboard listener in `input.js` fires on
every keydown. We need pause.js to intercept printable characters when in name_entry
sub-screen.

**Approach:** expose a function `export function handlePauseKeydown(e)` from
`pause.js`. `input.js`'s keydown listener calls it when `G.state === "paused"`.

```js
export function handlePauseKeydown(e){
  if (subScreen !== "name_entry") return;
  const k = e.key;
  if (k === "Enter"){
    _commitName();
  } else if (k === "Backspace" || k === "Delete"){
    nameBuffer = nameBuffer.slice(0, -1);
  } else if (k.length === 1 && nameBuffer.length < 20){
    // Printable character
    nameBuffer += k;
  }
}
```

For gamepad name entry: cycle through a simple character set using left/right to
change the current character and down/A to advance/confirm. **This is complex —
defer gamepad name entry for Phase 3.** Gamepad players: the game falls back to
a default name `"SAVE ${slot + 1}"` with an on-screen note. They can still confirm
with A/Start to accept that name. This keeps Phase 3 tractable.

```js
function _pollNameEntry(){
  // Gamepad path: accept default name via A/Start; B = cancel
  if (G.inputMode === "gamepad"){
    if (_edge("back"))  { subScreen = "save"; _refreshEdges(); return; }
    if (_edge("confirm")){ 
      if (nameBuffer.length === 0) nameBuffer = `SAVE ${nameTargetSlot + 1}`;
      _commitName(); 
    }
    _refreshEdges();
    return;
  }
  // Keyboard: _pollNameEntry only handles ESC/Enter via edge detection;
  // actual character input is handled by handlePauseKeydown (keydown events).
  if (_edge("back"))   { subScreen = "save"; _refreshEdges(); return; }
  if (_edge("confirm")){ _commitName(); }
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
    score:           G.score,
    level:           G.level,
    gameMode:        G.gameMode,
    playlistName:    G.playlist ? G.playlist.name     : null,
    playlistFilename:G.playlist ? G.playlist.filename : null,
    playlistIndex:   G.playlistIndex,
    dan: {
      hp:         G.dan.hp,
      hasDustbin: G.dan.hasDustbin,
    },
    powerups: { ...G.powerups },
  };
}
```

---

### `export function drawPause()`

Dispatches to sub-screen draw functions.

```js
export function drawPause(){
  // Semi-transparent overlay (50% opacity per spec)
  ctx.fillStyle = "rgba(8, 12, 18, 0.50)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  switch(subScreen){
    case "menu":              _drawMenu(); break;
    case "options":           _drawOptions(); break;
    case "save":              _drawSave(); break;
    case "confirm_overwrite": _drawConfirmOverwrite(); break;
    case "confirm_quit":      _drawConfirmQuit(); break;
    case "name_entry":        _drawNameEntry(); break;
  }
}
```

#### Panel helper

All sub-screens share a centered panel. Helper:

```js
function _panel(w, h){
  const x = (VIEW_W - w) / 2, y = (VIEW_H - h) / 2;
  ctx.fillStyle = "#0e1218";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COL.soap;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  return { x, y, w, h };
}
```

#### `_drawMenu()`

```
Panel: 380 × 380
Header: "PAUSED" in COL.amber, bold 32px Arial Black, centered at y+48
Divider: horizontal line at y+68 (soap color, 50% opacity)

Weekly achievements summary block (y+80 to ~y+200):
  Title "WEEKLY PROGRESS" in #6f7884, 11px Courier New, left-padded 28px
  For each weekly achievement (max 5):
    Name (white 12px Courier), right side: progress "n / target" or ✔ in amber
    One row each, 22px apart

Divider at y+210

Menu items (y+230 onwards, 44px apart):
  Each item: 12px left margin indicator (▶ or blank) + item label
  Selected item: COL.amber color, ▶ prefix
  Unselected: COL.text at 60% opacity
  Font: bold 18px Arial Black
  Items: CONTINUE / OPTIONS / SAVE & QUIT / QUIT

Footer: "ESC — CLOSE" in #6f7884, 11px Courier New, centered at y+h-20
  (or "B — CLOSE" if gamepad mode)
```

Draw code sketch:
```js
function _drawMenu(){
  const { x, y, w, h } = _panel(380, 380);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  // Header
  ctx.font = "bold 32px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  ctx.fillText("PAUSED", VIEW_W/2, y + 48);

  // Divider
  ctx.strokeStyle = COL.soap; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x+20, y+68); ctx.lineTo(x+w-20, y+68); ctx.stroke();
  ctx.globalAlpha = 1;

  // Weekly achievements summary
  const weekly = getWeeklyAchievements();
  ctx.textAlign = "left";
  ctx.font = "bold 10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("WEEKLY PROGRESS", x + 28, y + 88);
  let wy = y + 104;
  for (let i = 0; i < Math.min(weekly.length, 5); i++){
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

  // Divider
  ctx.strokeStyle = COL.soap; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x+20, wy+8); ctx.lineTo(x+w-20, wy+8); ctx.stroke();
  ctx.globalAlpha = 1;

  // Menu items (start after the weekly block + divider)
  const itemStartY = wy + 28;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (let i = 0; i < MENU_ITEMS.length; i++){
    const selected = (i === menuCursor);
    ctx.font = "bold 18px 'Arial Black', sans-serif";
    ctx.fillStyle = selected ? COL.amber : `rgba(232,235,239,0.55)`;
    ctx.fillText((selected ? "▶  " : "   ") + MENU_ITEMS[i], VIEW_W/2, itemStartY + i * 44);
  }

  // Footer
  const backHint = G.inputMode === "gamepad" ? "B — CLOSE" : "ESC — CLOSE";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.textAlign = "center";
  ctx.fillText(backHint, VIEW_W/2, y + h - 20);
}
```

Note: itemStartY depends on how many weekly achievements there are. The panel
height of 380 assumes ~5 weekly items. If 0 items, weekly block collapses; if
more than 5, they're capped. Adjust panel height formula:
```
panelH = 96 (header+divider) + min(weekly.length,5)*22 + 40 (extra spacing/divider)
       + MENU_ITEMS.length * 44 + 40 (footer)
```
In practice, clamp to min 320, max 480.

#### `_drawOptions()`

```
Panel: 360 × 240
Header: "OPTIONS" in COL.soap, bold 26px Arial Black
Divider

Row 1: "MASTER VOLUME"
  Left label (white, 13px Courier), right: value as "XX%" (amber)
  Below: slider track (full width minus 48px margins)
    Track: 6px tall rect, #232a34
    Fill:  6px tall rect, COL.soap, width = track_w * optVolume
    Thumb: 14px circle, COL.soap, centered on fill-end
  
Row 2: "MUTE"
  Label left, right: "ON" or "OFF" (amber if muted)
  Hint: SPACE/ENTER to toggle

Footer: "ESC — BACK" or "B — BACK"
```

Draw code sketch:
```js
function _drawOptions(){
  const { x, y, w, h } = _panel(360, 240);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  ctx.font = "bold 26px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("OPTIONS", VIEW_W/2, y + 40);

  ctx.strokeStyle = COL.soap; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x+20, y+60); ctx.lineTo(x+w-20, y+60); ctx.stroke();
  ctx.globalAlpha = 1;

  // Volume row
  const rowY = y + 92;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = "bold 13px 'Courier New', monospace";
  ctx.fillStyle = COL.text;
  ctx.fillText("MASTER VOLUME", x + 28, rowY);
  const pct = Math.round(optVolume * 100);
  ctx.textAlign = "right";
  ctx.fillStyle = COL.amber;
  ctx.fillText(pct + "%", x + w - 28, rowY);

  // Slider
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

  // Hint text
  ctx.textAlign = "left";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const volHint = G.inputMode === "gamepad"
    ? "◀ / ▶ — ADJUST"
    : "← / → — ADJUST";
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
  ctx.fillText(backHint, VIEW_W/2, y + h - 20);
}
```

#### `_drawSave()`

```
Panel: 420 × 380
Header: "CHOOSE SAVE SLOT" in COL.amber
Subheader: "Your progress will be saved here. Save & Quit to title." in dim gray
  (or: "SAVE & QUIT" path note)
Divider

5 slots, each 52px tall:
  Slot N  (N = 1..5)
  If empty:   "— EMPTY —" in dim gray; right side: blank
  If occupied: Name (white), Level + Score on second line (dim), 
               right side: date/time (small, dim gray)
  Selected slot: amber border rect around it, COL.amber label

Footer: "ESC — BACK" / "B — BACK"
```

Date format: `new Date(savedAt).toLocaleDateString()` — locale-appropriate, short.

```js
function _drawSave(){
  const { x, y, w, h } = _panel(420, 380);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";

  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  ctx.fillText("CHOOSE SAVE SLOT", VIEW_W/2, y + 36);

  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("Select a slot to save and quit to title.", VIEW_W/2, y + 56);

  ctx.strokeStyle = COL.soap; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x+20, y+70); ctx.lineTo(x+w-20, y+70); ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 5; i++){
    const slot = saveSlots[i];
    const sy = y + 84 + i * 54;
    const selected = (i === saveCursor);

    // Selection border
    if (selected){
      ctx.strokeStyle = COL.amber; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
      ctx.strokeRect(x + 16, sy - 2, w - 32, 50);
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    // Slot number
    ctx.font = "bold 11px 'Courier New', monospace";
    ctx.fillStyle = selected ? COL.amber : "#6f7884";
    ctx.fillText(`SLOT ${i + 1}`, x + 28, sy + 14);

    if (slot.data){
      // Occupied
      ctx.font = "bold 14px 'Courier New', monospace";
      ctx.fillStyle = selected ? COL.text : `rgba(232,235,239,0.8)`;
      ctx.fillText(slot.data.name, x + 28, sy + 32);
      ctx.font = "10px 'Courier New', monospace";
      ctx.fillStyle = "#6f7884";
      ctx.fillText(`LV ${slot.data.level}  ·  ${String(slot.data.score).padStart(6,"0")} PTS`, x + 28, sy + 46);
      // Date right-aligned
      const date = new Date(slot.data.savedAt).toLocaleDateString();
      ctx.textAlign = "right";
      ctx.fillText(date, x + w - 28, sy + 46);
    } else {
      // Empty
      ctx.font = "italic 13px 'Courier New', monospace";
      ctx.fillStyle = "#3a4250";
      ctx.textAlign = "center";
      ctx.fillText("— EMPTY —", VIEW_W/2, sy + 30);
    }
  }

  ctx.textAlign = "center";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const backHint = G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK";
  ctx.fillText(backHint, VIEW_W/2, y + h - 20);
}
```

#### `_drawConfirmOverwrite()`

```
Panel: 340 × 200
"OVERWRITE SAVE?" header (amber)
Slot name shown in white
YES / NO buttons side by side, selected one in amber
```

```js
function _drawConfirmOverwrite(){
  const { x, y, w, h } = _panel(340, 200);
  const slot = saveSlots[pendingOverwriteSlot];

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.amber;
  ctx.fillText("OVERWRITE SAVE?", VIEW_W/2, y + 48);

  ctx.font = "13px 'Courier New', monospace";
  ctx.fillStyle = "#aeb6c0";
  const name = slot && slot.data ? slot.data.name : `SLOT ${pendingOverwriteSlot + 1}`;
  ctx.fillText(`"${name}"`, VIEW_W/2, y + 80);

  // YES / NO
  const opts = ["YES", "NO"];
  for (let i = 0; i < 2; i++){
    const ox = VIEW_W/2 + (i === 0 ? -60 : 60);
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
  ctx.fillText(G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK", VIEW_W/2, y + h - 18);
}
```

#### `_drawConfirmQuit()`

Same structure as _drawConfirmOverwrite but "QUIT WITHOUT SAVING?" header and no
slot name line.

```js
function _drawConfirmQuit(){
  const { x, y, w, h } = _panel(360, 180);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = "#ff5b4d";
  ctx.fillText("QUIT WITHOUT SAVING?", VIEW_W/2, y + 50);

  ctx.font = "12px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("Progress will be lost.", VIEW_W/2, y + 76);

  const opts = ["YES", "NO"];
  for (let i = 0; i < 2; i++){
    const ox = VIEW_W/2 + (i === 0 ? -60 : 60);
    const selected = (_quitCursor === i);
    ctx.font = "bold 20px 'Arial Black', sans-serif";
    ctx.fillStyle = selected ? (i === 0 ? "#ff5b4d" : COL.soap) : "rgba(232,235,239,0.4)";
    ctx.fillText(opts[i], ox, y + 116);
    if (selected){
      ctx.strokeStyle = (i === 0 ? "#ff5b4d" : COL.soap);
      ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
      ctx.strokeRect(ox - 28, y + 104, 56, 28);
      ctx.globalAlpha = 1;
    }
  }

  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.textAlign = "center";
  ctx.fillText(G.inputMode === "gamepad" ? "B — BACK" : "ESC — BACK", VIEW_W/2, y + h - 18);
}
```

#### `_drawNameEntry()`

```
Panel: 400 × 220
"NAME YOUR SAVE" header (COL.soap)
"Type a name, then press ENTER to confirm" subtext (dim gray)
Divider

Name input area:
  Rect, 340px wide, 36px tall, centered
  Filled with "#1a1e26", soap stroke
  nameBuffer rendered in COL.text, bold 16px Courier
  Blinking cursor: 1px wide, 22px tall, after last char, blinks at 0.8s period
    cursor visible when (nameCursorBlink % 0.8) < 0.4

Character count: "X / 20" right-aligned, dim gray

For gamepad: "Press A or START to confirm with default name" if nameBuffer empty

Footer: "ESC — CANCEL" / "B — CANCEL" | "ENTER — CONFIRM"
```

```js
function _drawNameEntry(){
  const { x, y, w, h } = _panel(400, 220);

  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 22px 'Arial Black', sans-serif";
  ctx.fillStyle = COL.soap;
  ctx.fillText("NAME YOUR SAVE", VIEW_W/2, y + 38);

  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const hint = G.inputMode === "gamepad"
    ? "Press A / START to confirm."
    : "Type a name, then ENTER to confirm.";
  ctx.fillText(hint, VIEW_W/2, y + 60);

  // Input box
  const ibX = VIEW_W/2 - 170, ibY = y + 82, ibW = 340, ibH = 36;
  ctx.fillStyle = "#1a1e26";
  ctx.fillRect(ibX, ibY, ibW, ibH);
  ctx.strokeStyle = COL.soap; ctx.lineWidth = 1.5;
  ctx.strokeRect(ibX + 0.5, ibY + 0.5, ibW - 1, ibH - 1);

  // Text in input box
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = "bold 16px 'Courier New', monospace";
  ctx.fillStyle = COL.text;
  const textX = ibX + 10;
  ctx.fillText(nameBuffer, textX, ibY + ibH/2);

  // Cursor
  const textW = ctx.measureText(nameBuffer).width;
  const blinkOn = (nameCursorBlink % 0.8) < 0.4;
  if (blinkOn){
    ctx.fillStyle = COL.soap;
    ctx.fillRect(textX + textW + 1, ibY + 7, 2, 22);
  }

  // Char count
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillStyle = nameBuffer.length >= 20 ? "#ff5b4d" : "#6f7884";
  ctx.fillText(`${nameBuffer.length} / 20`, ibX + ibW - 4, ibY + ibH + 14);

  // Gamepad note
  if (G.inputMode === "gamepad" && nameBuffer.length === 0){
    ctx.textAlign = "center";
    ctx.font = "10px 'Courier New', monospace";
    ctx.fillStyle = "#6f7884";
    ctx.fillText(`Default: "SAVE ${nameTargetSlot + 1}"`, VIEW_W/2, y + 150);
  }

  // Footer
  ctx.textAlign = "center";
  ctx.font = "bold 11px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  const cancelHint = G.inputMode === "gamepad" ? "B — CANCEL" : "ESC — CANCEL";
  const confirmHint = G.inputMode === "gamepad" ? "A — CONFIRM" : "ENTER — CONFIRM";
  ctx.fillText(`${cancelHint}   ·   ${confirmHint}`, VIEW_W/2, y + h - 18);
}
```

---

## Changes to `src/input.js`

### 1. Import pause.js at top

```js
import { openPause, closePause, handlePauseKeydown } from "./pause.js";
```

Note: pause.js imports `keys` from input.js. This creates a potential circular
import. To break it, do NOT import `keys` in pause.js; instead pass the raw
`_held` logic in pause.js using direct DOM state, OR re-export keys via a
getter. Simplest fix: move the `keys` object to a separate tiny module
`src/input-state.js` and import from there in both `input.js` and `pause.js`.

Actually, even simpler: pause.js uses its own keydown/keyup tracking
independently. Add module-local key state to pause.js:

```js
// In pause.js — local key state for pause input, tracked via listeners
const _keys = {};
window.addEventListener("keydown", e => { _keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup",   e => { _keys[e.key.toLowerCase()] = false; });
```

Then `_held` in pause.js uses `_keys` instead of importing `keys` from input.js.
No circular dependency. The duplicate listeners are fine — both track the same
physical keys, just in different objects.

### 2. ESC key handling in keydown listener

In `input.js` keydown listener, add BEFORE the existing SPACE/ENTER handling:

```js
// ESC — pause toggle (playing) or back-navigate (paused, delegated to pause.js)
if (k === "escape"){
  if (G.state === "playing"
      && !G._showAchievementModal
      && !G._showLifetimeModal) {
    openPause();
    return;   // don't propagate to other handlers this frame
  }
  // paused state: ESC is handled by pause.js's own _keys tracking
  // (already working via _pollMenu's _edge("back") which reads _keys["escape"])
}
```

### 3. Keydown delegation to pause.js

In the keydown listener, add:

```js
if (G.state === "paused") handlePauseKeydown(e);
```

### 4. START button while playing → pause

In `pollGamepad()`, find the existing `if (start && !prevStart && ...)` block.
Add a new branch for playing state:

```js
if (start && !prevStart){
  unlock();
  if (G.state === "title"){ ... existing ... }
  else if (G.state === "playing"
           && !G._showAchievementModal
           && !G._showLifetimeModal){
    openPause();
  }
  else if (G.state === "dead" && G.inputMode === "gamepad"){
    startRun("gamepad");
  }
}
```

### 5. Title screen "load" key

In the keydown listener, add to the `G.state === "title"` section:

```js
if (G.state === "title" && G._titlePhase === "input"){
  if (k === "l") {
    G._titlePhase = "load";
    G._loadSaveCursor = 0;
  }
}
```

Add `G._loadSaveCursor` to `state.js` initial state: `_loadSaveCursor: 0`.

Also handle SPACE/ENTER from load screen (back to input phase):
```js
if (G.state === "title" && G._titlePhase === "load"){
  // Navigation: up/down handled by input.js (shared digit keys approach won't work)
  // Use arrow keys / WS to move cursor, ENTER to load, ESC to cancel
  if (k === "arrowup" || k === "w") G._loadSaveCursor = (G._loadSaveCursor - 1 + 5) % 5;
  if (k === "arrowdown" || k === "s") G._loadSaveCursor = (G._loadSaveCursor + 1) % 5;
  if (k === "escape") G._titlePhase = "input";
  if (k === "enter" || k === " "){
    // Attempt load from highlighted slot
    _tryLoadFromTitle(G._loadSaveCursor);
  }
}
```

`_tryLoadFromTitle` (in input.js):
```js
function _tryLoadFromTitle(slot){
  const { loadSave } = await import("./savegame.js");  // NO — can't use dynamic import here
  // Better: import savegame.js statically at the top of input.js
}
```

Actually: import `savegame.js` at the top of `input.js` statically:
```js
import { loadSave } from "./savegame.js";
```

And `_tryLoadFromTitle`:
```js
function _tryLoadFromTitle(slot){
  const data = loadSave(slot);
  if (!data) return;   // empty slot — no-op
  // Set input mode based on last used? Or use whatever was selected on title?
  // Resolution: always start with "keyboard" mode from a title load.
  // The player can't have set inputMode yet (they're still on "input" phase).
  // We need to set G.inputMode before resumeFromSave → newGame → buildLevel.
  newGame();   // fresh G.dan etc
  G.inputMode = "keyboard";   // default; gamepad will work in game per existing polling
  resumeFromSave(data, G.availablePlaylists);
  G._titlePhase = "input";   // reset for next visit
}
```

Import `newGame` and `resumeFromSave` at top of input.js:
```js
import { newGame, nextLevel, resumeFromSave } from "./level.js";
```
(`newGame` and `nextLevel` are already imported; add `resumeFromSave`.)

---

## Changes to `src/update.js`

### Import

```js
import { pollPause } from "./pause.js";
```

### "paused" branch in `update(dt)`

Add before the `levelclear` branch:

```js
// Paused state — world is frozen; only pause polling runs
if (G.state === "paused"){
  pollPause(dt);
  return;
}
```

`updateWipe(dt)` and `pollGamepad()` still run (they're before any branching),
so the wipe can finish and START can un-pause.

---

## Changes to `src/render.js`

### Import

```js
import { drawPause } from "./pause.js";
```

### In `render()`

After `if (G.state === "dead") drawGameOver();`, add:

```js
if (G.state === "paused") drawPause();
```

Keep `drawWipe()` as the final call after this.

---

## Changes to `src/screens.js`

### Import

```js
import { listSaves, loadSave } from "./savegame.js";
```

### In `drawTitle()`

Add new branch at the top:

```js
if (G._titlePhase === "load") { drawTitleLoadScreen(); return; }
```

### `drawTitleLoadScreen()`

```js
function drawTitleLoadScreen(){
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

    // Selection highlight
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

  // Footer
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = "bold 12px 'Courier New', monospace";
  ctx.fillStyle = "#6f7884";
  ctx.fillText("↑ / ↓ — SELECT   ·   ENTER — LOAD   ·   ESC — BACK", VIEW_W/2, VIEW_H/2 + 168);
}
```

### In `drawTitle()` (input phase), add Load Game hint

After the existing SPACE/A START hints, add:

```js
ctx.font = "bold 13px 'Courier New', monospace";
ctx.fillStyle = "#6f7884";   // dim — secondary option
ctx.fillText("L — LOAD GAME", VIEW_W/2, VIEW_H/2 + 198);
```

(Adjust the y position so it sits comfortably below the existing two prompts
without collision. Current prompts are at +150 and +174, so +198 works.)

---

## Changes to `src/state.js`

Add to the G object:

```js
_loadSaveCursor: 0,     // highlighted slot on the title load screen
```

Add `"paused"` to the state comment: `// title | playing | paused | levelclear | dead`

---

## Tests: `test-savegame.js`

Headless Node.js test (no DOM). Mock `localStorage`:

```js
// Mock localStorage
const store = {};
global.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k,v) => { store[k] = v; },
  removeItem: k => { delete store[k]; },
};
```

Import `savegame.js` and run checks:
1. `listSaves()` returns 5 entries all null when empty
2. `saveGame(0, "Test", snapshot)` → `loadSave(0)` round-trips all fields
3. `loadSave(1)` returns null (untouched slot)
4. `deleteSave(0)` → `loadSave(0)` returns null
5. `saveGame` with `version: 1` field present
6. Corrupt JSON in a slot → `loadSave` returns null (doesn't throw)
7. `loadPrefs()` returns `{ masterVolume: 0.35 }` default when unset
8. `savePrefs({ masterVolume: 0.7 })` → `loadPrefs()` returns 0.7
9. `loadHighScore()` returns 0 when unset
10. `saveHighScore(1500)` → `loadHighScore()` returns 1500
11. `saveGame` slot 4 (boundary) works correctly
12. `listSaves()` after writing slots 0 and 2 shows null for 1, 3, 4

---

## Phase sequencing for Claude Code

### Phase 1: Foundation
Files: `src/savegame.js` (new), `src/level.js` (export buildLevel, add resumeFromSave)
Tests: `test-savegame.js`
Model: Sonnet

### Phase 2: Pause shell (menu + options + quit, NO save UI)
Files: `src/pause.js` (new, subScreens: menu/options/confirm_quit only),
       `src/update.js` (paused branch), `src/render.js` (drawPause call),
       `src/input.js` (ESC + START trigger, handlePauseKeydown hookup),
       `src/state.js` (_loadSaveCursor field, paused state comment)
Verify: ESC pauses, conveyor hum stops, options slider live-updates volume,
        Quit → title works, Continue unpauses
Model: Sonnet

### Phase 3: Save/Load UI + title integration  
Files: `src/pause.js` (add save/confirm_overwrite/name_entry sub-screens),
       `src/screens.js` (drawTitleLoadScreen, L-key hint),
       `src/input.js` (title load phase key handling, _tryLoadFromTitle)
Verify: full save → quit → title → L → load → playing at correct level/score/HP
Model: Sonnet (escalate to Opus if name-entry canvas input causes problems)

---

## Edge cases and invariants

- **Wipe state during pause:** If a wipe is in progress when ESC is pressed
  (e.g. player spams ESC during level-open animation), allow it. The wipe
  completes on its own timeline since `updateWipe(dt)` still runs while paused.
  Drawback: the wipe overlay draws on top of the pause screen briefly. Acceptable.

- **Achievement modal + pause:** The ESC/START trigger is gated on
  `!G._showAchievementModal && !G._showLifetimeModal`. So you can't open the
  pause menu while those are showing. Achievement modals only appear on
  levelclear, not during playing, so this is mostly a guard against edge cases.

- **High score:** `G.high` is updated in `update.js` on level-clear and death.
  The quit path in `_doQuitToTitle` also updates it. It is NOT stored in
  save slots. It should be loaded at boot. The boot sequence (HTML file or
  level.js) should call `G.high = loadHighScore()` on startup. Add this to
  `atomic-dustbin-dan.html` or to `state.js`'s initial value via an IIFE.
  
  Simplest: in `state.js`, import `loadHighScore` from savegame.js and set:
  ```js
  high: loadHighScore(),
  ```
  BUT state.js currently has no imports from savegame.js and we want to keep
  the dependency graph clean. Better: in `atomic-dustbin-dan.html`, after
  imports but before the loop starts, call:
  ```js
  import { loadHighScore } from "./src/savegame.js";
  G.high = loadHighScore();
  ```
  Or even simpler: in the first frame of `update.js`, check
  `if (!G._highLoaded){ G.high = loadHighScore(); G._highLoaded = true; }`.
  
  **Chosen approach:** import `loadHighScore` in `atomic-dustbin-dan.html`
  and set `G.high` before the loop starts. Clean, one-time, no per-frame check.

- **Resume from save + playlist gone:** `resumeFromSave` silently falls back to
  `levelPlan`. The title load screen has no "playlist missing" notice. If we
  want one, screens.js can check `saveData.gameMode === "handAuthored" &&
  !G.availablePlaylists.find(...)` after load and show a brief flash. Defer.

- **`buildLevel` export:** `buildLevel` is currently private. It is called by
  `nextLevel` and `newGame` (via `buildLevel()`). Exporting it doesn't change
  behavior. `resumeFromSave` calls it after mutating G — same as `nextLevel`.

- **Pause in levelclear or dead states:** The pause trigger is only active
  during `G.state === "playing"`. No changes needed for other states.