/* =========================================================================
   achievements.js — Phase 1 minimal implementation.

   Tracks cmb_foam_party (total bubbles fired) via the event bus.
   Module-local state only — nothing on G (per CLAUDE.md non-negotiables).
   Imports only from events.js; dependency flows one way.
   ========================================================================= */
import { on, off } from './events.js';

let _totalShotsFired = 0;
let _bannerQueue = []; // [{ text, subtext, timestamp }]

const CMB_FOAM_PARTY_BRONZE = 500;
let _foamPartyBronzeAwarded = false;

// Named handlers so initAchievements() can off() them before re-registering,
// preventing duplicate subscriptions across newGame() calls.
function _onBoltFired() {
  _totalShotsFired++;
  if (!_foamPartyBronzeAwarded && _totalShotsFired >= CMB_FOAM_PARTY_BRONZE) {
    _foamPartyBronzeAwarded = true;
    _bannerQueue.push({
      text: 'Foam Party',
      subtext: 'Bronze unlocked — 500 bubbles fired',
      timestamp: Date.now(),
    });
  }
}

export function initAchievements() {
  _totalShotsFired = 0;
  _foamPartyBronzeAwarded = false;
  _bannerQueue = [];

  off('bolt:fired', _onBoltFired);
  on('bolt:fired', _onBoltFired);
}

export function popAchievementBanner() {
  return _bannerQueue.shift() ?? null;
}
