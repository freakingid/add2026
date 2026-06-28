/* =========================================================================
   savegame.js — pure localStorage persistence layer.
   No imports from game modules. Standalone leaf.

   Keys:
     add_save_0 .. add_save_4  — five save slots (0-indexed)
     add_prefs                 — audio/volume preferences
     add_high                  — global high score
   ========================================================================= */

const SLOT_KEY  = i  => `add_save_${i}`;
const PREFS_KEY = "add_prefs";
const HIGH_KEY  = "add_high";

const DEFAULT_MASTER_VOLUME = 0.35;

// Returns array[5] of { slot:number, data: saveObject | null }.
// Corrupt JSON → null (treated as empty).
export function listSaves(){
  const result = [];
  for (let i = 0; i < 5; i++){
    const raw = localStorage.getItem(SLOT_KEY(i));
    let data = null;
    if (raw){
      try { data = JSON.parse(raw); }
      catch(e){ data = null; }
    }
    result.push({ slot: i, data });
  }
  return result;
}

// Writes a save slot. name must already be trimmed / validated by caller.
// snapshot: plain object matching the save slot schema (see spec).
export function saveGame(slot, name, snapshot){
  const record = {
    version: 1,
    name,
    savedAt: Date.now(),
    ...snapshot,
  };
  localStorage.setItem(SLOT_KEY(slot), JSON.stringify(record));
}

// Returns save object or null for empty / corrupt slots.
export function loadSave(slot){
  const raw = localStorage.getItem(SLOT_KEY(slot));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch(e){ return null; }
}

// Clears a save slot.
export function deleteSave(slot){
  localStorage.removeItem(SLOT_KEY(slot));
}

// Returns prefs object. masterVolume defaults to 0.35 if unset.
export function loadPrefs(){
  const raw = localStorage.getItem(PREFS_KEY);
  if (!raw) return { masterVolume: DEFAULT_MASTER_VOLUME };
  try {
    const p = JSON.parse(raw);
    return {
      masterVolume: typeof p.masterVolume === "number"
        ? p.masterVolume
        : DEFAULT_MASTER_VOLUME,
    };
  } catch(e){
    return { masterVolume: DEFAULT_MASTER_VOLUME };
  }
}

export function savePrefs(prefs){
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// Returns the global high score (0 if unset / corrupt).
export function loadHighScore(){
  const raw = localStorage.getItem(HIGH_KEY);
  if (!raw) return 0;
  const n = Number(raw);
  return isFinite(n) ? n : 0;
}

export function saveHighScore(n){
  localStorage.setItem(HIGH_KEY, String(n));
}
