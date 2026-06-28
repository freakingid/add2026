# Achievement System — Implementation Blueprint
## Atomic Dustbin Dan

## CLAUDE.md Conflict Check

One potential conflict to flag:

**Audio note:** `audio.js` is described in STATUS.md as "a leaf, called like `addFloat`" with "no central event bus" by design — the note even says "Alt: an event queue drained each frame — more indirection for no benefit at this scale." The achievement banner requires a new `sfx.achievement()` call. This is NOT a conflict — `achievements.js` can call `sfx.achievement()` directly, same as any other module. The pub/sub bus is for *achievement tracking events*; `audio.js` remains a direct-call leaf. The achievement banner sound is just one more `sfx.*` call at the push site in `achievements.js`. Import `sfx` from `audio.js` into `achievements.js` for this purpose. No architectural conflict.

No other conflicts found between ACHIEVEMENTS.md and CLAUDE.md non-negotiables. All non-negotiables (HP/score persist, one enemy per level, loader as sole entry point, `G.inputMode` device lock, knockback direction, worker rescue values) are untouched by the achievement system.