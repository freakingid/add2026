## TASK 6 — UI Components Specification

### Title Screen Weekly Panel

**What data it reads:** Calls `getWeeklyAchievements()` from `achievements.js`, which returns the 5 active weekly achievements with current progress, plus the `meta_eotw` entry showing how many of the 5 are completed.

**Where in `screens.js`:** Inside `drawTitle()`, below the existing "KEYBOARD / GAMEPAD" option display. The panel does not overlap the fire legend (`drawFireLegend` is in the lower-left; the weekly panel goes right-of-center or as a sidebar column).

**Layout:** 6 rows (5 weekly + 1 EOTW), each row ~28px tall. For each entry:
- Achievement name (left-aligned, white)
- Short description (grey, smaller font)
- Progress indicator: if the achievement has a numeric threshold, show `n / target`; if it's binary (complete/not), show a checkmark or empty box.
- Completed achievements show a gold checkmark and dim the text slightly.

**Render discipline:** The weekly panel is drawn only when `G.state === 'title'`. It uses existing `ctx` calls, `COL` palette values, and the same font stack as the rest of `screens.js`. No new canvas context state.

---

### In-Play Achievement Banner

**Where in the render loop:** `render.js`'s `render()` function, after all world/entity draws and after the HUD, before any modal overlays. This ensures the banner is always on top of gameplay but under any modal.

**How it draws:** Each frame, call `popAchievementBanner()`. If non-null and within display duration (2.5 s):
- Render a semi-transparent dark rectangle, bottom-center of the viewport.
- Top line: achievement name in bold white.
- Bottom line: tier if lifetime (`"Bronze unlocked"`) or `"Weekly progress"` if weekly.
- Do NOT pause the game. Banner is cosmetic overlay only.

**Multiple concurrent unlocks:** The queue approach from Task 4 handles this. If two achievements unlock on the same frame, the second banner appears after the first's 2.5 s expires. Max queue depth: cap at 5 (discard oldest overflow) to prevent a long queue from stacking indefinitely.

**Sound:** Emit `sfx.achievement()` from `achievements.js` when pushing to the banner queue. `audio.js` needs a new `sfx.achievement()` function — a short ascending two-tone blip, distinct from `sfx.rescue`. Claude Code should implement this alongside the system.

---

### Post-Level Modal

**When it appears:** During the `levelclear` state, if `getLevelAchievementSummary()` returns a non-empty array. If the array is empty (no weekly progress this level), the modal is skipped and the level-clear screen shows normally.

**What triggers it:** `drawLevelClear()` in `screens.js` checks `getLevelAchievementSummary().length > 0` on the first frame of the `levelclear` state. Set a flag `G._showAchievementModal = true` then; subsequent frames render the modal.

**What it shows:**
- Header: "Achievement Progress"
- List: each entry from `getLevelAchievementSummary()` — name, description, `n / target` progress, "NEW!" badge if `isNew` (unlocked this level for the first time).
- Footer: two buttons: "Continue" (advances to next level via the normal level-clear path) and "View All Achievements" (opens the lifetime modal — see below).

**Dismissal:** "Continue" sets `G._showAchievementModal = false` and triggers the level advance (same as the existing level-clear keypress). This means the post-level modal intercepts the usual "press key to advance" flow; the player must explicitly dismiss the modal.

**Input:** In keyboard mode, `SPACE` or `ENTER` = Continue. In gamepad mode, `BTN_START` or `A (BTN_0)` = Continue. The "View All" button requires a second interaction model — for Phase 1 implementation, this button can be a no-op placeholder.

---

### Lifetime Achievements Modal

**Access points:** "View All Achievements" on the title screen (a new text button below the weekly panel), and "View All" on the post-level modal.

**Data:** Calls `getLifetimeAchievements()` from `achievements.js`. Returns achievements grouped by category in the order they appear in ACHIEVEMENTS.md.

**Layout:**
- Category headers (matching ACHIEVEMENTS.md emoji + name).
- Each achievement: a row with name, tier badge row (5 badges, greyed if not yet earned), progress bar to next tier, and short description.
- Hidden achievements (`H: true`, `tier === 0`): show as `??? — ???` with all badges greyed.
- Scrollable if content overflows — use a viewport-clipped canvas scissor rect with `G._lifetimeScrollY` state. Arrow keys / gamepad stick scroll.

**Dismissal:** `ESC` or `BACKSPACE` (keyboard) / `BTN_B` or back button (gamepad) closes the modal, returns to whichever surface opened it (title or post-level).

**Phase 1 note:** Implement as a stubbed overlay that shows category names and a placeholder list. Full layout in a later phase.
