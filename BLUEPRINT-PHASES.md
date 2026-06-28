## TASK 7 — Implementation Order

### Phase 1: Event Bus + One Achievement End-to-End

**Goal:** `events.js` wired, one achievement fires a real in-play notification. Verifiable in the browser in under 10 minutes.

Steps:
1. Create `src/events.js` (full module as specified in Task 3).
2. Add `import { emit } from './events.js'` to `player.js`. Add the `bolt:fired` emit in `fireVolley`.
3. Create a minimal `src/achievements.js` with `initAchievements()` and one handler: `on('enemy:died', ...)` tracking `cmb_foam_party` (total shots fired). For now, use a module-local counter and `console.log` when a threshold is crossed.
4. Call `initAchievements()` from `newGame()` in `level.js`.
5. Add the banner pull to `render.js`: call `popAchievementBanner()` and draw a placeholder rectangle.

**Verification:** Fire bubbles until `cmb_foam_party` Bronze (500) fires (use console to confirm). Banner appears in-game.

---

### Phase 2: Core Emitters + localStorage

**Goal:** All emitters from Task 5 added to their respective modules. Lifetime persistence in localStorage. Weekly persistence scaffolded.

Steps:
1. Add `G._levelStartTime` to `level.js`'s `loadLevel`.
2. Add `combat.js` emitters (`player:hit`, `player:hp_changed`, `enemy:died` with full payload).
3. Add `level.js` emitters (`level:start`, `level:end`, `run:start`, `run:end`, `powerup:collected`).
4. Add `workers.js` emitters.
5. Add `vending.js` emitter.
6. Add `dustbin.js` emitters.
7. Add `enemies.js` emitters.
8. Add `update.js` emitters (`level:all_enemies_dead`, `player:died`, `run:end`).
9. Add `input.js` emitter.
10. Add shot-object fields to `player.js` (`bounceCount`, `wallsHit`, `danPosAtFire`).
11. Implement localStorage read/write in `achievements.js` for lifetime state.
12. Implement ISO week key and weekly state init.

**Verification:** Run headless tests — `test-achievements.js` (new file) that imports `events.js` and `achievements.js`, fires mock events, and asserts correct progress increments and localStorage writes. At least 20 checks.

---

### Phase 3: Achievement Registry — Straightforward Achievements

**Goal:** Implement all achievements that require only the events from Phase 2, no per-shot tracking state.

Categories: Progression, Survival, Speed, Worker Rescue (most), Atomic Dustbin, Power-Ups & Items, Score stubs.

**Verification:** Each achievement category gets at least 2 test cases in `test-achievements.js`.

---

### Phase 4: Bounce Shot + Complex Combat Achievements

**Goal:** Achievements requiring per-shot state (`bounceCount`, `wallsHit`, `danPosAtFire`) and complex conditions (Confrontational, Blind Shot, Wrong Aisle).

Steps:
1. Implement `shot.bounceCount` / `shot.wallsHit` / `shot.danPosAtFire` in `player.js` (Task 5 emitter section).
2. Implement bounce achievement handlers.
3. Implement `G.dan.moveHistory` ring buffer for `cmb_confrontational`.
4. Implement `conveyor:push_tick` handler for `conv_wrong_aisle`.
5. Implement `cmb_blind_shot` using `hadLOSAtFire` in `enemy:died` payload.

**Verification:** Headless tests for bounce payload correctness. Browser test: equip Bounce power-up, ricochet a kill, confirm `bnc_bank` increments.

---

### Phase 5: UI — Weekly Panel + Full Banner

**Goal:** Title screen shows real weekly achievements. Banner shows real achievement name.

Steps:
1. Implement `getWeeklyAchievements()` export.
2. Add weekly panel draw to `drawTitle()` in `screens.js`.
3. Implement `sfx.achievement()` in `audio.js`.
4. Wire banner draw in `render.js` with 2.5 s display.

---

### Phase 6: UI — Post-Level Modal + Lifetime Modal

**Goal:** Post-level modal shows real progress. Lifetime modal shows full registry.

Steps:
1. Implement `getLevelAchievementSummary()`.
2. Implement post-level modal in `drawLevelClear()`.
3. Implement `getLifetimeAchievements()`.
4. Implement lifetime modal draw (scrollable canvas, badge rows, hidden masking).

---

### Phase 7: Hidden + Time-Based Achievements + EOTW

**Goal:** `sec_*` time-based achievements, `meta_eotw` / `meta_consecutive` / `meta_model`, XP display.

---

## TASK 8 — Claude Code Handoff Prompt

```
You are implementing the achievement system for Atomic Dustbin Dan. This is a structured implementation — read the following files in order before writing any code:

1. /home/paulk/projects/game/add2026/CLAUDE.md — always-loaded spine; non-negotiables and code map.
2. /home/paulk/projects/game/add2026/STATUS.md — what is actually built and where the code lives.
3. /home/paulk/projects/game/add2026/ACHIEVEMENTS.md — full achievement specification.
4. /home/paulk/projects/game/add2026/ACHIEVEMENT-BLUEPRINT.md — implementation blueprint. This is your primary spec. Follow it exactly.

Your task for this session is **Phase 1** from the blueprint's Task 7.

## Phase 1 goals

1. Create `src/events.js` — implement exactly as specified in Task 3 of the blueprint (synchronous pub/sub, Set-based listener store, try/catch per subscriber, `emit`/`on`/`off` exports).

2. Create a minimal `src/achievements.js` — implement `initAchievements()` (exported), subscribe to `enemy:died`, track a module-local `_totalShotsFired` counter (for `cmb_foam_party`), and push to `_bannerQueue` when Bronze (500) threshold is crossed. Export `popAchievementBanner()`.

3. Edit `src/player.js` — add `import { emit } from './events.js'` and add the `bolt:fired` emit call in `fireVolley()` exactly as specified in Task 5.

4. Edit `src/level.js` — add `import { initAchievements } from './achievements.js'` and call `initAchievements()` inside `newGame()` after the state reset.

5. Edit `src/render.js` — add `import { popAchievementBanner } from './achievements.js'` and in `render()`, after the HUD draw call, add a banner draw: if `popAchievementBanner()` returns a non-null value and less than 2500 ms have elapsed since it was received, draw a semi-transparent dark rect bottom-center with the achievement text.

## Constraints

- Do not modify any non-negotiables from CLAUDE.md.
- Do not add any entry to `G` in state.js for achievement tracking state — keep it module-local in achievements.js.
- events.js must have zero imports (it is a leaf).
- achievements.js imports only from events.js and nothing from the game simulation modules — the dependency must flow one way.

## Tests

Before declaring done, write and run `test-achievements.js` using Node.js (headless, no DOM). The test file must:
- Import events.js and achievements.js directly (mock any DOM/localStorage with a simple stub).
- Call `initAchievements()`.
- Fire 499 `bolt:fired` events via `emit('bolt:fired', { kind: 'standard', isTripleShotActive: false })`.
- Assert `popAchievementBanner()` returns null (threshold not yet crossed).
- Fire one more `bolt:fired`.
- Assert `popAchievementBanner()` returns an object with `text` containing the achievement name.
- Include at least 5 total assertions.
- Run: `node test-achievements.js` and confirm all pass before declaring the session done.

## After implementation

Update STATUS.md:
- Change the Achievement system row in the "Current state" table from `🔲 Not built` to `🔧 In progress — Phase 1 complete`.
- Add a "Achievement system" subsystem decisions entry with: the pub/sub approach decision, the `popAchievementBanner` pull architecture, and the module-local state decision.
- Do NOT add any new entries to the Architecture Map yet — the full module descriptions go in after Phase 2.
```