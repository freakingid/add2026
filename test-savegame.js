// Headless Node.js tests for src/savegame.js
// Run: node test-savegame.js
// Exit code 0 = all pass.

// Mock localStorage
const store = {};
global.localStorage = {
  getItem:    k     => store[k] ?? null,
  setItem:    (k,v) => { store[k] = v; },
  removeItem: k     => { delete store[k]; },
};

import("./src/savegame.js").then(({
  listSaves, saveGame, loadSave, deleteSave,
  loadPrefs, savePrefs, loadHighScore, saveHighScore,
}) => {
  let pass = 0, fail = 0;

  function check(label, got, expected){
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    if (ok){
      console.log(`  PASS  ${label}`);
      pass++;
    } else {
      console.log(`  FAIL  ${label}`);
      console.log(`        expected: ${JSON.stringify(expected)}`);
      console.log(`        got:      ${JSON.stringify(got)}`);
      fail++;
    }
  }

  // Reset store between groups for cleanliness
  function clearStore(){ for (const k in store) delete store[k]; }

  // ── 1. listSaves() returns 5 entries all null when empty ──────────────────
  clearStore();
  const empty = listSaves();
  check("1. listSaves() length = 5", empty.length, 5);
  check("1. listSaves() all null", empty.every(e => e.data === null), true);

  // ── 2. saveGame + loadSave round-trips all fields ─────────────────────────
  clearStore();
  const snapshot = {
    score: 1234,
    level: 3,
    gameMode: "levelPlan",
    playlistName: null,
    playlistFilename: null,
    playlistIndex: 0,
    dan: { hp: 15, hasDustbin: true },
    powerups: { rapid: 1, triple: 0, bounce: 2 },
  };
  saveGame(0, "Alice", snapshot);
  const loaded = loadSave(0);
  check("2. round-trip name",           loaded.name,                  "Alice");
  check("2. round-trip score",          loaded.score,                 1234);
  check("2. round-trip level",          loaded.level,                 3);
  check("2. round-trip dan.hp",         loaded.dan.hp,                15);
  check("2. round-trip dan.hasDustbin", loaded.dan.hasDustbin,        true);
  check("2. round-trip powerups",       loaded.powerups,              { rapid:1, triple:0, bounce:2 });

  // ── 3. loadSave on an untouched slot returns null ─────────────────────────
  check("3. loadSave(1) = null", loadSave(1), null);

  // ── 4. deleteSave clears the slot ────────────────────────────────────────
  deleteSave(0);
  check("4. after deleteSave(0), loadSave(0) = null", loadSave(0), null);

  // ── 5. saveGame stores version: 1 ────────────────────────────────────────
  clearStore();
  saveGame(2, "Bob", snapshot);
  const v = loadSave(2);
  check("5. version field = 1", v.version, 1);

  // ── 6. corrupt JSON → loadSave returns null (no throw) ───────────────────
  clearStore();
  store["add_save_3"] = "{ this is not json {{{{";
  let caught = false;
  let corrupt = "threw";
  try { corrupt = loadSave(3); }
  catch(e){ caught = true; }
  check("6. corrupt JSON does not throw", caught, false);
  check("6. corrupt JSON returns null",   corrupt, null);

  // ── 7. loadPrefs() default when unset ────────────────────────────────────
  clearStore();
  const defaultPrefs = loadPrefs();
  check("7. loadPrefs() default masterVolume = 0.35", defaultPrefs.masterVolume, 0.35);

  // ── 8. savePrefs → loadPrefs round-trip ──────────────────────────────────
  savePrefs({ masterVolume: 0.7 });
  check("8. loadPrefs() after savePrefs = 0.7", loadPrefs().masterVolume, 0.7);

  // ── 9. loadHighScore() default when unset ────────────────────────────────
  clearStore();
  check("9. loadHighScore() default = 0", loadHighScore(), 0);

  // ── 10. saveHighScore → loadHighScore round-trip ─────────────────────────
  saveHighScore(1500);
  check("10. loadHighScore() = 1500", loadHighScore(), 1500);

  // ── 11. slot 4 (boundary) works ──────────────────────────────────────────
  clearStore();
  saveGame(4, "Edge", snapshot);
  const s4 = loadSave(4);
  check("11. slot 4 name = Edge", s4.name, "Edge");
  check("11. slot 4 score = 1234", s4.score, 1234);

  // ── 12. listSaves with slots 0 and 2 written; 1, 3, 4 = null ─────────────
  clearStore();
  saveGame(0, "Zero", snapshot);
  saveGame(2, "Two",  snapshot);
  const ls = listSaves();
  check("12. slot 0 has data",   ls[0].data !== null, true);
  check("12. slot 1 is null",    ls[1].data,          null);
  check("12. slot 2 has data",   ls[2].data !== null, true);
  check("12. slot 3 is null",    ls[3].data,          null);
  check("12. slot 4 is null",    ls[4].data,          null);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
});
