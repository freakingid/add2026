/* =========================================================================
   test-playlist.js — unit tests for JSON playlist parsing, entry validation,
   and buildSpawnRulesFromEntry logic.

   Run:  node test-playlist.js
   ========================================================================= */
import assert from "node:assert/strict";

/* ---- Minimal stubs for browser globals ----------------------------------- */
global.window = { addEventListener: () => {} };
global.performance = { now: () => 0 };

/* ---- Data stubs (matches config.js) --------------------------------------- */
const ENEMY = {
  picker:{}, forklift:{}, security:{}, sorter:{}, cleaner:{},
  drone:{}, manager:{}, scanner:{}, inventory:{},
};
const ENEMY_KEYS = new Set(Object.keys(ENEMY));
const AUTHORED_LEVELS_KEYS = new Set(["receiving_dock","pick_and_pack","cold_storage_vault","mezzanine_ring","conveyor_hub"]);
const VALID_MAPS = new Set(["procgen", ...AUTHORED_LEVELS_KEYS]);

/* ---- Replicated from playlists.js ---------------------------------------- */
function validateEntry(entry, idx){
  if (!entry.map || !VALID_MAPS.has(entry.map))
    return `entry[${idx}] unknown map "${entry.map}"`;
  if (!Array.isArray(entry.enemies) || entry.enemies.length === 0)
    return `entry[${idx}] enemies must be a non-empty array`;
  for (const e of entry.enemies)
    if (!ENEMY_KEYS.has(e)) return `entry[${idx}] unknown enemy "${e}"`;
  if (!Number.isInteger(entry.terminalCount) || entry.terminalCount < 1)
    return `entry[${idx}] terminalCount must be a positive integer`;
  return null;
}

function validatePlaylist(raw, filename){
  if (!raw || typeof raw.name !== "string" || !Array.isArray(raw.levels))
    return null;
  const levels = [];
  for (let i = 0; i < raw.levels.length; i++){
    const warn = validateEntry(raw.levels[i], i);
    if (!warn) levels.push(raw.levels[i]);
  }
  if (levels.length === 0) return null;
  return { name: raw.name, filename, levels };
}

/* ---- Replicated from level.js -------------------------------------------- */
const ENEMY_PREPLACE = { picker:0, forklift:3, security:3, sorter:3, cleaner:3, drone:3, manager:1, scanner:2, inventory:2 };

function buildSpawnRulesFromEntry(entry){
  const rules = [];
  if (entry.mixed){
    for (const t of entry.enemies)
      rules.push({ type:"terminal", enemy:t, count:1, preplace:1, zone:"combat", avoid:"spawn" });
  } else {
    const types = entry.enemies;
    const perType = Math.max(1, Math.floor(entry.terminalCount / types.length));
    for (const t of types){
      rules.push({ type:"terminal", enemy:t, count:perType, preplace:(ENEMY_PREPLACE[t]||0), zone:"combat", avoid:"spawn" });
    }
  }
  return rules;
}

/* ---- validateEntry tests ------------------------------------------------- */
{
  const ok = validateEntry({ map:"receiving_dock", enemies:["picker"], terminalCount:3 }, 0);
  assert.equal(ok, null);
  console.log("PASS  validateEntry: valid single-enemy entry returns null");
}

{
  const warn = validateEntry({ map:"unknown_map", enemies:["picker"], terminalCount:3 }, 0);
  assert.ok(warn && warn.includes("unknown map"));
  console.log("PASS  validateEntry: unknown map key → warning string");
}

{
  const warn = validateEntry({ map:"pick_and_pack", enemies:["alien"], terminalCount:3 }, 0);
  assert.ok(warn && warn.includes("unknown enemy"));
  console.log("PASS  validateEntry: unknown enemy key → warning string");
}

{
  const warn = validateEntry({ map:"procgen", enemies:["forklift"], terminalCount:0 }, 0);
  assert.ok(warn && warn.includes("terminalCount"));
  console.log("PASS  validateEntry: terminalCount=0 → warning string");
}

{
  const warn = validateEntry({ map:"procgen", enemies:[], terminalCount:3 }, 0);
  assert.ok(warn && warn.includes("enemies"));
  console.log("PASS  validateEntry: empty enemies array → warning string");
}

{
  const warn = validateEntry({ map:"procgen", enemies:["picker"], terminalCount:2.5 }, 0);
  assert.ok(warn && warn.includes("terminalCount"), `Expected terminalCount warning, got: ${warn}`);
  console.log("PASS  validateEntry: non-integer terminalCount → warning string");
}

/* ---- validatePlaylist tests ---------------------------------------------- */
{
  const raw = { name:"Test", levels:[
    { map:"receiving_dock", enemies:["picker"], terminalCount:3 },
    { map:"bad_map", enemies:["picker"], terminalCount:2 },   // skipped
  ]};
  const pl = validatePlaylist(raw, "test.json");
  assert.ok(pl !== null);
  assert.equal(pl.levels.length, 1, "Invalid entry skipped; valid entry kept");
  assert.equal(pl.name, "Test");
  assert.equal(pl.filename, "test.json");
  console.log("PASS  validatePlaylist: invalid entry skipped, valid entry retained");
}

{
  const raw = { name:"Empty", levels:[
    { map:"nope", enemies:["picker"], terminalCount:3 },   // all bad
  ]};
  const pl = validatePlaylist(raw, "empty.json");
  assert.equal(pl, null, "All-invalid playlist returns null");
  console.log("PASS  validatePlaylist: all-invalid entries → null");
}

{
  const pl = validatePlaylist(null, "null.json");
  assert.equal(pl, null);
  console.log("PASS  validatePlaylist: null input → null");
}

{
  const pl = validatePlaylist({ name:42, levels:[] }, "bad.json");
  assert.equal(pl, null, "Non-string name → null");
  console.log("PASS  validatePlaylist: non-string name → null");
}

/* ---- buildSpawnRulesFromEntry: single-enemy non-mixed --------------------- */
{
  const entry = { map:"receiving_dock", enemies:["picker"], terminalCount:3 };
  const rules = buildSpawnRulesFromEntry(entry);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].enemy, "picker");
  assert.equal(rules[0].count, 3);   // floor(3/1) = 3
  console.log("PASS  buildSpawnRulesFromEntry(single picker, count=3): 1 rule, count=3");
}

/* ---- buildSpawnRulesFromEntry: multi-enemy non-mixed → round-robin split -- */
{
  const entry = { map:"cold_storage_vault", enemies:["forklift","security"], terminalCount:4 };
  const rules = buildSpawnRulesFromEntry(entry);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].enemy, "forklift");
  assert.equal(rules[0].count, 2);   // floor(4/2) = 2
  assert.equal(rules[1].enemy, "security");
  assert.equal(rules[1].count, 2);
  console.log("PASS  buildSpawnRulesFromEntry(forklift+security, count=4): 2 rules, 2 each");
}

/* ---- buildSpawnRulesFromEntry: mixed flag → one terminal per enemy -------- */
{
  const entry = {
    map:"mezzanine_ring",
    enemies:["picker","sorter","cleaner","drone","manager","scanner","inventory","forklift","security"],
    terminalCount:4,
    mixed:true,
  };
  const rules = buildSpawnRulesFromEntry(entry);
  assert.equal(rules.length, entry.enemies.length);
  for (const rule of rules){
    assert.equal(rule.count, 1);
    assert.equal(rule.preplace, 1);
  }
  console.log(`PASS  buildSpawnRulesFromEntry(mixed, 9 enemies): ${rules.length} rules, each count=1 preplace=1`);
}

/* ---- buildSpawnRulesFromEntry: terminalCount / types floored to min 1 ----- */
{
  // 3 types, terminalCount=2 → floor(2/3)=0 → clamped to 1 each
  const entry = { map:"procgen", enemies:["picker","forklift","security"], terminalCount:2 };
  const rules = buildSpawnRulesFromEntry(entry);
  assert.equal(rules.length, 3);
  for (const rule of rules) assert.equal(rule.count, 1, "count must be at least 1");
  console.log("PASS  buildSpawnRulesFromEntry: per-type count clamped to min 1");
}

/* ---- Warehouse Warmup playlist (the actual sample file) ------------------- */
{
  const raw = JSON.parse(`{
    "name": "Warehouse Warmup",
    "levels": [
      { "map":"receiving_dock", "enemies":["picker"], "terminalCount":3 },
      { "map":"cold_storage_vault", "enemies":["forklift","security"], "terminalCount":4 },
      { "map":"mezzanine_ring", "enemies":["picker","sorter","cleaner","drone","manager","scanner","inventory","forklift","security"], "terminalCount":4, "mixed":true }
    ]
  }`);
  const pl = validatePlaylist(raw, "warehouse-warmup.json");
  assert.ok(pl !== null);
  assert.equal(pl.levels.length, 3);
  assert.equal(pl.name, "Warehouse Warmup");

  // Entry 0: picker, 3 terminals
  const r0 = buildSpawnRulesFromEntry(pl.levels[0]);
  assert.equal(r0[0].enemy, "picker");
  assert.equal(r0[0].count, 3);

  // Entry 1: forklift+security, 2 each
  const r1 = buildSpawnRulesFromEntry(pl.levels[1]);
  assert.equal(r1.length, 2);

  // Entry 2: mixed, 9 enemy rules
  const r2 = buildSpawnRulesFromEntry(pl.levels[2]);
  assert.equal(r2.length, 9);

  console.log("PASS  warehouse-warmup.json: all 3 entries valid, spawn rules correct");
}

/* ---- playlistIndex loop behaviour ---------------------------------------- */
{
  // Simulate advancing through a 3-entry playlist and verifying wrapping
  const levels = [{},{},{}];
  let idx = 0;
  for (let step = 0; step < 7; step++){
    idx = (idx + 1) % levels.length;
  }
  assert.equal(idx, 1, "After 7 advances on 3-entry playlist: idx = 7 % 3 = 1");
  console.log("PASS  playlistIndex: modular wrap math correct over multiple loops");
}

console.log("\nAll test-playlist tests passed.");
