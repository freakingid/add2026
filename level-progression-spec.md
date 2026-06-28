# Level Progression Overhaul — Implementation Spec
## Feature: Random Map Layouts + Hand-Authored Playlist Mode

---

## What this changes at a glance

| Before | After |
|---|---|
| Every level uses procgen map | Each level picks a random map from the pool (procgen + 5 authored) |
| LEVEL_PLAN drives enemy types; authored levels ignore it | LEVEL_PLAN still drives enemy types; map layout is decoupled from enemy type |
| Authored levels are debug-only (`]` key) | Authored levels are live gameplay |
| One game mode | Title offers "LEVEL PLAN" or "HAND AUTHORED" mode |
| No external level config | External JSON playlist files loaded at boot; player picks one |

---

## New concepts

### Map layout vs. level type
These are now **independent axes**:
- **Level type** (enemy composition) = determined by LEVEL_PLAN index OR hand-authored playlist entry
- **Map layout** (tile geometry) = randomly chosen each level from the pool of 6

The authored levels' baked-in terminal `enemy:` fields are **ignored** in gameplay — `buildLevel` rebuilds the terminal spawn rules from the level type instead.

### Game modes (set at title, stored on `G.gameMode`)
- `"levelPlan"` — original LEVEL_PLAN progression, random map each level, loops on "mixed"
- `"handAuthored"` — drives enemy types from a loaded JSON playlist, random map each level, loops on last entry

---

## Part 1 — Random map selection (both modes)

### Map pool
The 6 available map layouts, in order:

```js
// level.js (new constant, top of file)
const MAP_POOL = [
  null,                    // null = procgen (generateLevelDef)
  "receiving_dock",
  "pick_and_pack",
  "cold_storage_vault",
  "mezzanine_ring",
  "conveyor_hub",
];
```

### Picking a random map
`buildLevel()` picks a layout at random each call:

```js
function buildLevel() {
  const pick = MAP_POOL[Math.floor(Math.random() * MAP_POOL.length)];
  const def = pick === null ? generateLevelDef() : buildAuthoredDef(pick);
  loadLevel(def);
}
```

### `buildAuthoredDef(mapName)` — new function in `level.js`
This is the key new function. It takes an authored map's geometry and rebuilds its terminal spawn rules from the **current level type**, discarding the authored level's baked-in `enemy:` fields.

```js
function buildAuthoredDef(mapName) {
  const base = AUTHORED_LEVELS[mapName];      // geometry only — tiles, conveyors, zones, placements
  const type = levelType();                    // from state.js — same as procgen uses

  // Rebuild terminal spawn rules from scratch (ignore base.spawnRules terminal entries)
  const spawnRules = buildSpawnRulesForType(type);

  // Re-emit the non-terminal rules from the authored def
  // (workers, powerups, vending, dustbin — these stay authored)
  const nonTerminalRules = base.spawnRules.filter(r =>
    r.type !== "terminal"
  );

  return {
    ...base,
    spawnRules: [...spawnRules, ...nonTerminalRules],
  };
}
```

### `buildSpawnRulesForType(type)` — extracted helper
Extract this logic from `generateLevelDef` so both procgen and authored paths share it.
Terminal count scales with `G.level` exactly as procgen does today.

```js
function buildSpawnRulesForType(type) {
  const rules = [];
  if (type === "mixed") {
    // All 9 real types, 4 terminals each on authored maps / standard count on procgen
    for (const t of LEVEL_PLAN) {
      if (t === "mixed") continue;
      rules.push({ type:"terminal", enemy:t, count:1, preplace:1, zone:"combat", avoid:"spawn" });
    }
  } else {
    const d = ENEMY[type];
    const termCount = Math.min((d.spawners || 3) + ((G.level - 1) / 2 | 0), 6);
    rules.push({ type:"terminal", enemy:type, count:termCount, preplace:(d.preplace || 0), zone:"combat", avoid:"spawn" });
    if (type === "manager" || type === "scanner")
      rules.push({ type:"terminal", enemy:"picker", count:2, preplace:3, zone:"combat", avoid:"spawn" });
  }
  return rules;
}
```

**Special case for mixed on authored maps:** when `type === "mixed"` and we're on an authored map, use **4 terminals total** (not 9 × 1). Replace the mixed branch with:

```js
if (type === "mixed" && mapName !== null) {
  // Authored map mixed: 4 terminals, each emits all types via the multi-type spawn loop
  // Achieved by placing 4 terminals of type "mixed_emitter" — see note below
}
```

> **Implementation note on mixed terminals for authored maps:**
> The current spawn loop in `update.js` / `generateLevelDef` already handles multi-type levels by iterating all terminal types present. For the authored mixed case the simplest approach is: push 4 `{ type:"terminal", enemy:"picker", ... }` entries as placeholders for physical placement, then in `loadLevel`'s terminal-building step detect `type === "mixed"` and overwrite each terminal's `.enemy` to cycle through all real types (terminal 0 → picker, 1 → forklift, etc.). Alternatively: add a sentinel `enemy:"mixed"` and handle in `spawnFromTerminal`. **Claude Code should choose whichever requires fewer changes to `loadLevel` / `update.js` — document the choice in STATUS.md.**

---

## Part 2 — Hand-Authored Playlist mode

### JSON playlist format

```json
{
  "name": "Playlist display name (shown in UI)",
  "levels": [
    {
      "map": "<key from AUTHORED_LEVELS, or 'procgen'>",
      "enemies": ["picker", "forklift"],
      "terminalCount": 3
    },
    {
      "map": "mezzanine_ring",
      "enemies": ["picker", "sorter", "cleaner", "drone", "manager", "scanner", "inventory", "forklift", "security"],
      "terminalCount": 4,
      "mixed": true
    }
  ]
}
```

**Field rules:**
- `name` — string; shown in the title UI playlist picker
- `levels[].map` — key matching `AUTHORED_LEVELS` object, or the string `"procgen"` to use generated geometry
- `levels[].enemies` — array of ENEMY keys; if length > 1 AND `mixed` is not true, all types share the terminal pool (treated as multi-type, not full mixed)
- `levels[].terminalCount` — integer; number of terminals placed (respects zone/avoid rules); replaces the LEVEL_PLAN scaling formula
- `levels[].mixed` — optional boolean; if true, the multi-type spawn loop runs (all listed enemies can emerge from any terminal); if false/absent with multiple enemies, each terminal is assigned to one enemy type round-robin
- On loop (player beats last entry): restart from index 0 — difficulty escalation TBD, not implemented now

**Validation:** at load time, warn to console and skip invalid entries (unknown map key, unknown enemy key, missing terminalCount). Do not crash.

### Playlist file discovery

- Playlist JSON files live in `data/playlists/` relative to the game root
- At boot, fetch `data/playlists/index.json` — an array of filenames: `["warehouse-warmup.json", "hard-mode.json"]`
- Each filename is then fetched. Failed fetches are silently skipped.
- If `data/playlists/index.json` does not exist or returns empty, Hand Authored mode is unavailable (title hides that option).
- No file-system watching; playlists are loaded once at boot.

### `index.json` format

```json
["warehouse-warmup.json", "hard-mode.json"]
```

### New state fields on `G`

```js
G.gameMode = "levelPlan";        // "levelPlan" | "handAuthored"
G.playlist = null;               // loaded playlist object or null
G.playlistIndex = 0;             // current position in playlist.levels[]
G.availablePlaylists = [];       // [{name, filename, levels}] loaded at boot
```

These are reset by `newGame()` appropriately:
- `G.gameMode` — NOT reset by newGame; it's set at title before the run starts
- `G.playlist` / `G.playlistIndex` — reset to the selected playlist / 0 on newGame
- `G.availablePlaylists` — set once at boot, never reset

### Playlist loading at boot

Add to `atomic-dustbin-dan.html` (or a new `src/playlists.js` module — Claude Code's choice):

```js
async function loadPlaylists() {
  try {
    const idx = await fetch("data/playlists/index.json").then(r => r.json());
    const results = await Promise.allSettled(
      idx.map(fn => fetch(`data/playlists/${fn}`).then(r => r.json()).then(p => ({...p, filename: fn})))
    );
    G.availablePlaylists = results
      .filter(r => r.status === "fulfilled")
      .map(r => r.value);
  } catch(e) {
    G.availablePlaylists = [];
  }
}
// Call before the game loop starts; playlists are advisory, no blocking needed
```

---

## Part 3 — Title screen changes

### New title state: mode select + playlist picker

The title screen gains a sub-state for mode selection. Keep it simple — no new `G.state` value; use a flag:

```js
G._titlePhase = "input";       // "input" (choose keyboard/gamepad) | "mode" (choose game mode) | "playlist" (choose playlist)
```

**Flow:**

```
Title renders "SPACE — KEYBOARD / A — GAMEPAD"
  → player presses key/button (locks input mode as today)
  → _titlePhase advances to "mode"

"mode" screen renders two options:
  [1] LEVEL PLAN
  [2] HAND AUTHORED  ← hidden / greyed if availablePlaylists is empty

Player selects:
  → LEVEL PLAN: startRun("levelPlan")
  → HAND AUTHORED (if 1 playlist): startRun("handAuthored", playlists[0])
  → HAND AUTHORED (if 2+ playlists): _titlePhase = "playlist"

"playlist" screen renders list of available playlists by name:
  [1] Warehouse Warmup
  [2] Hard Mode
  etc.

Player selects → startRun("handAuthored", selectedPlaylist)
```

**Input routing for mode/playlist screens:**
- Keyboard: `1`/`2`/`3`… or UP/DOWN + ENTER
- Gamepad: D-pad up/down + A/START to confirm

**`startRun` signature change:**

```js
function startRun(mode, playlist = null) {
  G.gameMode = mode;
  G.playlist = playlist;
  G.playlistIndex = 0;
  newGame();
  G.inputMode = mode;   // existing line — unchanged
}
```

---

## Part 4 — `buildLevel` routing

```js
function buildLevel() {
  if (G.gameMode === "handAuthored" && G.playlist) {
    buildHandAuthoredLevel();
  } else {
    buildLevelPlanLevel();
  }
}

function buildLevelPlanLevel() {
  const pick = MAP_POOL[Math.floor(Math.random() * MAP_POOL.length)];
  const def = pick === null ? generateLevelDef() : buildAuthoredDef(pick);
  loadLevel(def);
}

function buildHandAuthoredLevel() {
  const entry = G.playlist.levels[G.playlistIndex % G.playlist.levels.length];
  const def = entry.map === "procgen"
    ? generateLevelDefFromEntry(entry)
    : buildAuthoredDefFromEntry(entry);
  loadLevel(def);
}
```

### `buildAuthoredDefFromEntry(entry)` — playlist-driven authored map

```js
function buildAuthoredDefFromEntry(entry) {
  const base = AUTHORED_LEVELS[entry.map];
  const spawnRules = buildSpawnRulesFromEntry(entry);
  const nonTerminalRules = base.spawnRules.filter(r => r.type !== "terminal");
  return { ...base, spawnRules: [...spawnRules, ...nonTerminalRules] };
}
```

### `generateLevelDefFromEntry(entry)` — playlist-driven procgen map

Same as `generateLevelDef()` but replaces the terminal rule block with `buildSpawnRulesFromEntry(entry)`.

### `buildSpawnRulesFromEntry(entry)` — playlist terminal builder

```js
function buildSpawnRulesFromEntry(entry) {
  const rules = [];
  if (entry.mixed) {
    // All enemies listed share the terminal pool
    for (const t of entry.enemies) {
      rules.push({ type:"terminal", enemy:t, count:1, preplace:1, zone:"combat", avoid:"spawn" });
    }
  } else {
    // Single or multi-enemy: terminalCount split across types
    const types = entry.enemies;
    const perType = Math.max(1, Math.floor(entry.terminalCount / types.length));
    for (const t of types) {
      const d = ENEMY[t];
      rules.push({ type:"terminal", enemy:t, count:perType, preplace:(d.preplace||0), zone:"combat", avoid:"spawn" });
    }
  }
  return rules;
}
```

### `nextLevel` update for hand-authored mode

```js
export function nextLevel() {
  G.level++;
  if (G.gameMode === "handAuthored" && G.playlist) {
    G.playlistIndex = (G.playlistIndex + 1) % G.playlist.levels.length;
    // TODO: on wrap (playlistIndex === 0), apply difficulty escalation — not implemented yet
  }
  buildLevel();
  G.state = "playing";
}
```

---

## Part 5 — Retire the `]` debug key

The `]` key cycle in `input.js` (`cycleAuthoredLevel`) is no longer needed — authored levels are live gameplay now. **Remove it.** Note this in STATUS.md.

---

## Files touched

| File | Change |
|---|---|
| `src/level.js` | Main changes: `buildLevel`, new `buildAuthoredDef`, `buildSpawnRulesForType`, `buildHandAuthoredLevel`, `buildLevelPlanLevel`, entry-driven builders, `nextLevel` playlist advance |
| `src/state.js` | Add `G.gameMode`, `G.playlist`, `G.playlistIndex`, `G.availablePlaylists`, `G._titlePhase` |
| `src/screens.js` | Title screen mode-select and playlist-picker rendering |
| `src/input.js` | Remove `]` debug cycle; add mode/playlist keyboard nav on title; update `startRun` signature |
| `src/config.js` | No changes needed (LEVEL_PLAN unchanged) |
| `src/levels/authored-levels.js` | No changes (geometry stays; terminal rules ignored at runtime) |
| `atomic-dustbin-dan.html` | Add playlist boot-load (or extract to `src/playlists.js`) |
| `data/playlists/index.json` | **New file** — playlist index |
| `data/playlists/warehouse-warmup.json` | **New file** — sample 3-level playlist |
| `STATUS.md` | Update after implementation |

---

## File size / context discipline

The achievement system's `test-achievements.js` grew to 96 KB — avoid that here.

- **No monolithic test file.** Split tests by concern: `test-level-routing.js` (map pool, authored def building), `test-playlist.js` (JSON parsing, entry validation, loop behaviour). Each should stay under ~200 lines / ~8 KB.
- **No test exercises rendering or input** — those aren't Node-runnable anyway. Unit-test the pure functions: `buildSpawnRulesForType`, `buildSpawnRulesFromEntry`, playlist validation, `playlistIndex` wrap math.
- **`buildAuthoredDef` is pure** (takes a map name and level type, returns a def object) — easy to unit-test without a running game.
- Claude Code: after writing each test file, check its line count with `wc -l`. If either approaches 300 lines, stop and split.

---

## Implementation order (phases for Claude Code)

1. **Extract `buildSpawnRulesForType`** from `generateLevelDef` — refactor only, no behavior change. Test: existing generated levels still work.
2. **Add `MAP_POOL` + `buildAuthoredDef`** + wire into `buildLevel` for Level Plan mode. Remove `]` debug key. Test in browser: levels now use random maps, enemy types still follow LEVEL_PLAN.
3. **Add `G.gameMode/playlist/playlistIndex/availablePlaylists`** to state.js.
4. **Add playlist boot-load** (fetch index.json + individual files). Test with the sample JSON.
5. **Add `buildHandAuthoredLevel` + entry-driven builders**. Test: hand-authored playlist drives enemy types correctly.
6. **Title screen mode-select + playlist picker** — rendering + input routing.
7. **`nextLevel` playlist advance + loop**. Test: index wraps correctly on last entry.
8. **Write `test-level-routing.js` and `test-playlist.js`** (keep each under 300 lines).
9. **Update STATUS.md**.

---

## Sample playlist file (write to `data/playlists/warehouse-warmup.json`)

```json
{
  "name": "Warehouse Warmup",
  "levels": [
    {
      "map": "receiving_dock",
      "enemies": ["picker"],
      "terminalCount": 3
    },
    {
      "map": "cold_storage_vault",
      "enemies": ["forklift", "security"],
      "terminalCount": 4
    },
    {
      "map": "mezzanine_ring",
      "enemies": ["picker", "sorter", "cleaner", "drone", "manager", "scanner", "inventory", "forklift", "security"],
      "terminalCount": 4,
      "mixed": true
    }
  ]
}
```

Also write `data/playlists/index.json`:

```json
["warehouse-warmup.json"]
```