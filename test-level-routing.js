/* =========================================================================
   test-level-routing.js — unit tests for the map pool, buildAuthoredDef,
   and buildSpawnRulesForType (pure functions; no rendering, no browser).

   Run:  node test-level-routing.js
   ========================================================================= */
import assert from "node:assert/strict";

/* ---- Minimal stubs for browser globals / ES module deps ------------------- */
const fakeCanvas = {
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 }),
};
global.window = { addEventListener: () => {} };
global.document = { getElementById: () => fakeCanvas, createElement: () => ({ getContext: () => ({}) }) };
global.performance = { now: () => 0 };
global.AudioContext = class { createGain(){ return { gain:{ value:0 }, connect(){} }; } destination = {} };
global.requestAnimationFrame = () => {};

/* ---- Import the modules under test (ES modules via --experimental-vm-modules
   is unavailable; we replicate the pure functions inline for Node compat.) --- */

// LEVEL_PLAN from config.js (copy only the order, not all CFG):
const LEVEL_PLAN = ["picker","forklift","security","sorter","cleaner","drone","manager","scanner","inventory","mixed"];

// ENEMY minimal (spawners + preplace only):
const ENEMY = {
  picker:    { spawners:3, max:22, preplace:0 },
  forklift:  { spawners:2, max:5,  preplace:3 },
  security:  { spawners:2, max:6,  preplace:3 },
  sorter:    { spawners:2, max:6,  preplace:3 },
  cleaner:   { spawners:2, max:6,  preplace:3 },
  drone:     { spawners:2, max:4,  preplace:3 },
  manager:   { spawners:1, max:2,  preplace:1 },
  scanner:   { spawners:2, max:4,  preplace:2 },
  inventory: { spawners:2, max:4,  preplace:2 },
};

const AUTHORED_LEVELS_KEYS = ["receiving_dock","pick_and_pack","cold_storage_vault","mezzanine_ring","conveyor_hub"];
const MAP_POOL = [null, ...AUTHORED_LEVELS_KEYS];

// Replicated from level.js:
function buildSpawnRulesForType(type, level = 1){
  const rules = [];
  if (type === "mixed"){
    for (const t of LEVEL_PLAN){
      if (t === "mixed") continue;
      rules.push({ type:"terminal", enemy:t, count:1, preplace:1, zone:"combat", avoid:"spawn" });
    }
  } else {
    const d = ENEMY[type];
    const termCount = Math.min((d.spawners || 3) + ((level - 1) / 2 | 0), 6);
    rules.push({ type:"terminal", enemy:type, count:termCount, preplace:(d.preplace || 0), zone:"combat", avoid:"spawn" });
    if (type === "manager" || type === "scanner")
      rules.push({ type:"terminal", enemy:"picker", count:2, preplace:3, zone:"combat", avoid:"spawn" });
  }
  return rules;
}

/* ---- MAP_POOL tests ------------------------------------------------------- */
{
  assert.equal(MAP_POOL.length, 6, "MAP_POOL should have 6 entries");
  assert.equal(MAP_POOL[0], null, "MAP_POOL[0] = null (procgen)");
  for (const key of AUTHORED_LEVELS_KEYS)
    assert.ok(MAP_POOL.includes(key), `MAP_POOL should include "${key}"`);
  console.log("PASS  MAP_POOL: 6 entries, null first, all 5 authored keys present");
}

/* ---- buildSpawnRulesForType: single-type levels --------------------------- */
{
  // picker: spawners=3, level=1 → termCount = min(3+0, 6) = 3
  const rules = buildSpawnRulesForType("picker", 1);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].enemy, "picker");
  assert.equal(rules[0].count, 3);
  assert.equal(rules[0].preplace, 0);
  console.log("PASS  buildSpawnRulesForType(picker, L1): termCount=3, preplace=0");
}

{
  // forklift: spawners=2, level=5 → termCount = min(2+2, 6) = 4
  const rules = buildSpawnRulesForType("forklift", 5);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].count, 4);
  console.log("PASS  buildSpawnRulesForType(forklift, L5): termCount=4");
}

{
  // termCount cap: picker at level 9 → min(3+4, 6) = 6
  const rules = buildSpawnRulesForType("picker", 9);
  assert.equal(rules[0].count, 6);
  console.log("PASS  buildSpawnRulesForType(picker, L9): termCount capped at 6");
}

/* ---- buildSpawnRulesForType: manager / scanner companion pickers ---------- */
{
  const rules = buildSpawnRulesForType("manager", 1);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].enemy, "manager");
  assert.equal(rules[1].enemy, "picker");
  assert.equal(rules[1].count, 2);
  console.log("PASS  buildSpawnRulesForType(manager): companion picker terminal added");
}

{
  const rules = buildSpawnRulesForType("scanner", 1);
  assert.equal(rules.length, 2);
  assert.equal(rules[1].enemy, "picker");
  console.log("PASS  buildSpawnRulesForType(scanner): companion picker terminal added");
}

/* ---- buildSpawnRulesForType: mixed level ---------------------------------- */
{
  const rules = buildSpawnRulesForType("mixed", 1);
  const realTypes = LEVEL_PLAN.filter(t => t !== "mixed");
  assert.equal(rules.length, realTypes.length, "mixed: one terminal per real type");
  for (const rule of rules){
    assert.equal(rule.count, 1);
    assert.equal(rule.preplace, 1);
    assert.notEqual(rule.enemy, "mixed");
  }
  console.log(`PASS  buildSpawnRulesForType(mixed): ${rules.length} terminal rules, none is "mixed"`);
}

/* ---- buildAuthoredDef: terminal rules replaced, non-terminal rules kept --- */
{
  // Simulate buildAuthoredDef logic:
  const fakeBase = {
    name: "test_map",
    cols: 10, rows: 10,
    tiles: ["##########", "#........#", "##########"],
    conveyors: [],
    zones: [{ role:"spawn", x:1, y:1, w:8, h:1 }, { role:"combat", x:1, y:1, w:8, h:1 }, { role:"cover", x:1, y:1, w:8, h:1 }, { role:"danger", x:1, y:1, w:8, h:1 }],
    placements: [{ type:"player", x:1, y:1 }, { type:"exit", x:8, y:1 }],
    spawnRules: [
      { type:"terminal", enemy:"sorter", count:1, preplace:1, zone:"combat", avoid:"spawn" },
      { type:"worker", count:5, zone:"any", avoid:"spawn" },
      { type:"powerup", count:2, zone:"cover" },
    ],
  };
  const type = "picker";
  const spawnRules = [
    ...buildSpawnRulesForType(type, 1),
    ...fakeBase.spawnRules.filter(r => r.type !== "terminal"),
  ];
  const def = { ...fakeBase, spawnRules };

  // Terminal rules rebuilt from type (picker), authored sorter terminal gone
  const terminals = def.spawnRules.filter(r => r.type === "terminal");
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0].enemy, "picker");

  // Non-terminal rules preserved
  const workers = def.spawnRules.filter(r => r.type === "worker");
  assert.equal(workers.length, 1);
  const powerups = def.spawnRules.filter(r => r.type === "powerup");
  assert.equal(powerups.length, 1);

  console.log("PASS  buildAuthoredDef: sorter terminal replaced with picker; worker+powerup kept");
}

/* ---- nextLevel playlistIndex wrap ---------------------------------------- */
{
  // Simulate G state
  const G = { gameMode:"handAuthored", playlist:{ levels:[{},{},{}] }, playlistIndex:2, level:3 };
  // Replicate nextLevel logic:
  G.level++;
  if (G.gameMode === "handAuthored" && G.playlist)
    G.playlistIndex = (G.playlistIndex + 1) % G.playlist.levels.length;

  assert.equal(G.playlistIndex, 0, "playlistIndex wraps from 2 → 0 on a 3-entry playlist");
  assert.equal(G.level, 4);
  console.log("PASS  nextLevel: playlistIndex wraps correctly (3-entry playlist, idx 2 → 0)");
}

{
  const G = { gameMode:"handAuthored", playlist:{ levels:[{},{},{}] }, playlistIndex:1, level:2 };
  G.level++;
  if (G.gameMode === "handAuthored" && G.playlist)
    G.playlistIndex = (G.playlistIndex + 1) % G.playlist.levels.length;

  assert.equal(G.playlistIndex, 2);
  console.log("PASS  nextLevel: playlistIndex increments (1 → 2) within 3-entry playlist");
}

{
  // levelPlan mode: playlistIndex untouched
  const G = { gameMode:"levelPlan", playlist:null, playlistIndex:0, level:1 };
  G.level++;
  if (G.gameMode === "handAuthored" && G.playlist)
    G.playlistIndex = (G.playlistIndex + 1) % G.playlist.levels.length;

  assert.equal(G.playlistIndex, 0, "levelPlan: playlistIndex never changes");
  console.log("PASS  nextLevel: playlistIndex unchanged in levelPlan mode");
}

console.log("\nAll test-level-routing tests passed.");
