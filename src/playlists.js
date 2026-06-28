/* =========================================================================
   playlists.js — boot-time playlist loader.

   Fetches data/playlists/index.json then each listed file, validates entries,
   and populates G.availablePlaylists. Called once before the game loop starts;
   playlists are advisory (failure leaves Hand Authored mode unavailable).
   ========================================================================= */
import { G } from "./state.js";
import { ENEMY } from "./config.js";
import { AUTHORED_LEVELS } from "./levels/authored-levels.js";

const VALID_MAPS = new Set(["procgen", ...Object.keys(AUTHORED_LEVELS)]);
const VALID_ENEMIES = new Set(Object.keys(ENEMY));

// Validate one playlist entry; returns a warning string or null if valid.
function validateEntry(entry, idx){
  if (!entry.map || !VALID_MAPS.has(entry.map))
    return `entry[${idx}] unknown map "${entry.map}"`;
  if (!Array.isArray(entry.enemies) || entry.enemies.length === 0)
    return `entry[${idx}] enemies must be a non-empty array`;
  for (const e of entry.enemies)
    if (!VALID_ENEMIES.has(e)) return `entry[${idx}] unknown enemy "${e}"`;
  if (!Number.isInteger(entry.terminalCount) || entry.terminalCount < 1)
    return `entry[${idx}] terminalCount must be a positive integer`;
  return null;
}

// Validate and filter a raw playlist object; returns cleaned object or null.
function validatePlaylist(raw, filename){
  if (!raw || typeof raw.name !== "string" || !Array.isArray(raw.levels)){
    console.warn(`[playlists] ${filename}: missing name or levels array`);
    return null;
  }
  const levels = [];
  for (let i = 0; i < raw.levels.length; i++){
    const warn = validateEntry(raw.levels[i], i);
    if (warn) console.warn(`[playlists] ${filename}: ${warn} — skipping`);
    else levels.push(raw.levels[i]);
  }
  if (levels.length === 0){
    console.warn(`[playlists] ${filename}: no valid entries — skipping playlist`);
    return null;
  }
  return { name: raw.name, filename, levels };
}

export async function loadPlaylists(){
  try {
    const idx = await fetch("data/playlists/index.json").then(r => r.json());
    const results = await Promise.allSettled(
      idx.map(fn =>
        fetch(`data/playlists/${fn}`)
          .then(r => r.json())
          .then(p => validatePlaylist(p, fn))
      )
    );
    G.availablePlaylists = results
      .filter(r => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value);
  } catch(e) {
    G.availablePlaylists = [];
  }
}
