/* test-wipe.js — headless smoke test for the iris wipe transition (wipe.js).

   Stubs the three browser-side modules wipe.js imports (canvas.js, palette.js,
   and the wipe-relevant slice of config.js), then imports the real wipe.js and
   exercises every phase transition.

   Run: node test-wipe.js   (requires package.json "type":"module")
*/

/* ---- 1. Stub browser globals -------------------------------------------- */
// wipe.js draws to ctx — we need a no-op canvas context.
const fakeCtx = {
  save(){}, restore(){}, translate(){}, scale(){},
  beginPath(){}, closePath(){}, stroke(){}, arc(){}, rect(){},
  moveTo(){}, lineTo(){},
  strokeStyle: '', lineWidth: 1,
};
const fakeCanvas = {
  width: 960, height: 640,
  getContext: () => fakeCtx,
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left:0, top:0, width:960, height:640 }),
};
globalThis.document = { getElementById: () => fakeCanvas, addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.performance = globalThis.performance || { now: () => 0 };

/* ---- 2. Import the real module ------------------------------------------ */
// wipe.js imports from canvas.js, config.js, palette.js — those import the real
// browser canvas. We use a loader hook via --import to override module resolution,
// but since that adds complexity we instead rely on the stubs above ensuring
// canvas.js returns the fake context, and import wipe.js directly.
const { startWipeClose, startWipeOpen, updateWipe, drawWipe } =
  await import('./src/wipe.js');

/* ---- 3. Tiny assert harness --------------------------------------------- */
let passed = 0, failed = 0;
function check(name, ok) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else     { failed++; console.log(`  FAIL ${name}`); }
}
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

/* ---- 4. Simulate time: run updateWipe for `totalSec` at dt=0.016 ---------- */
// Returns an array of { time, phase } snapshots at each step.
function simulate(totalSec, dt = 0.016) {
  const log = [];
  let elapsed = 0;
  while (elapsed < totalSec) {
    updateWipe(dt);
    elapsed += dt;
    // Expose internal phase via drawWipe side-effect: if drawWipe doesn't throw
    // and doesn't call ctx.save, phase is 'none'. We track via a flag.
    let saveCount = 0;
    const origSave = fakeCtx.save;
    fakeCtx.save = () => { saveCount++; };
    drawWipe();
    fakeCtx.save = origSave;
    log.push({ time: elapsed, isActive: saveCount > 0 });
  }
  return log;
}

/* ---- 5. Tests -------------------------------------------------------------- */

console.log('\n=== test-wipe.js ===\n');

// --- Test A: Iris In (closing) sequence ---
console.log('--- A: startWipeClose ---');

startWipeClose(480, 320);

// At t=0 (before any update), drawWipe should be active (phase=closing, t=0).
// scale = easeInOut(0) = 0, so ctx.save IS called (phase !== 'none').
{
  let saveCount = 0;
  const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
  drawWipe();
  fakeCtx.save = orig;
  check('A1: drawWipe active immediately after startWipeClose', saveCount > 0);
}

// Run for WIPE_CLOSE_DUR (0.80s) — should transition from closing → hold_in.
// We simulate slightly past 0.80s to catch the transition.
{
  // Reset
  startWipeClose(480, 320);
  let closePhaseSeenCount = 0;
  let holdInSeen = false;
  let elapsed = 0;
  const dt = 0.016;

  while (elapsed < 1.5) {
    updateWipe(dt);
    elapsed += dt;

    // Probe whether we're in hold_in by checking: is drawWipe still active
    // (would be 'none' if past hold_in safety fallback) but we can't read
    // the private `phase` directly. Instead we verify behavior:
    // After ~0.80s, the wipe should be fully opaque (scale=1) until hold_in expires.
    // We'll just assert that drawWipe is still active at ~0.85s.
    if (near(elapsed, 0.85, 0.02)) {
      let saveCount = 0;
      const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
      drawWipe();
      fakeCtx.save = orig;
      check('A2: wipe still active at 0.85s (hold_in phase)', saveCount > 0);
    }
  }

  // After 1.5s with WIPE_HOLD_IN=0.30, hold_in safety fallback fires → phase='none'.
  // (closing 0.80 + hold_in 0.30 = 1.10s total, so 1.5s > that)
  let saveCount = 0;
  const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
  drawWipe();
  fakeCtx.save = orig;
  check('A3: drawWipe is no-op after hold_in safety fallback (1.5s)', saveCount === 0);
}

// --- Test B: Iris Out (opening) sequence ---
console.log('--- B: startWipeOpen ---');

startWipeOpen(480, 320);

// Immediately after startWipeOpen: phase=hold_out, drawWipe should be active.
{
  let saveCount = 0;
  const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
  drawWipe();
  fakeCtx.save = orig;
  check('B1: drawWipe active immediately after startWipeOpen (hold_out)', saveCount > 0);
}

// At 0.15s (mid hold_out), still active.
{
  startWipeOpen(480, 320);
  updateWipe(0.15);
  let saveCount = 0;
  const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
  drawWipe();
  fakeCtx.save = orig;
  check('B2: drawWipe active at 0.15s (still in hold_out)', saveCount > 0);
}

// After WIPE_HOLD_OUT (0.30s) + WIPE_OPEN_DUR (0.80s) = 1.10s → phase='none'.
{
  startWipeOpen(480, 320);
  let elapsed = 0;
  const dt = 0.016;

  // Check still active just before opening ends (~1.0s into the sequence)
  while (elapsed < 1.0) { updateWipe(dt); elapsed += dt; }
  {
    let saveCount = 0;
    const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
    drawWipe();
    fakeCtx.save = orig;
    check('B3: drawWipe active at 1.0s (still in opening phase)', saveCount > 0);
  }

  // Run to 1.5s — past hold_out(0.30) + open_dur(0.80) = 1.10s.
  while (elapsed < 1.5) { updateWipe(dt); elapsed += dt; }
  {
    let saveCount = 0;
    const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
    drawWipe();
    fakeCtx.save = orig;
    check('B4: drawWipe is no-op at 1.5s (opening complete, phase=none)', saveCount === 0);
  }
}

// --- Test C: phase=none → updateWipe and drawWipe are both no-ops ---
console.log('--- C: none state ---');
{
  // Force a completed open sequence so phase='none'
  startWipeOpen(480, 320);
  for (let i = 0; i < 120; i++) updateWipe(0.016); // 1.92s > 1.10s

  let saveCount = 0;
  const orig = fakeCtx.save; fakeCtx.save = () => { saveCount++; };
  drawWipe();
  fakeCtx.save = orig;
  check('C1: drawWipe() is no-op when phase is none', saveCount === 0);

  // updateWipe should not throw when phase='none'
  let threw = false;
  try { updateWipe(0.016); } catch(e) { threw = true; }
  check('C2: updateWipe() does not throw when phase is none', !threw);
}

// --- Test D: drawWipe doesn't throw during active phases ---
console.log('--- D: drawWipe draws without error ---');
{
  startWipeClose(480, 320);
  updateWipe(0.4); // mid-closing
  let threw = false;
  try { drawWipe(); } catch(e) { threw = true; console.error(e); }
  check('D1: drawWipe() during closing does not throw', !threw);

  startWipeOpen(200, 100);
  updateWipe(0.5); // in opening phase (past hold_out)
  threw = false;
  try { drawWipe(); } catch(e) { threw = true; console.error(e); }
  check('D2: drawWipe() during opening does not throw', !threw);
}

/* ---- 6. Results ------------------------------------------------------------ */
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
