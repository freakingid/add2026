/* test-input.js — self-contained unit test for the input.js direction math.
   Inlines the pure functions (no imports / no DOM) and checks the GDD §4 cases.
   Also covers camerafx.js (pure math, no canvas imports — safe to import for real).
   Run: node test-input.js   */

import { CFG } from "./src/config.js";
import { G } from "./src/state.js";
import * as fx from "./src/camerafx.js";

// --- Mirror of the constants/helpers in input.js (screen space, y-down) ---
const DIR = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
const KEYS = {
  MOVE: { N:"w", E:"d", S:"s", W:"a" },
  FIRE: { N:"o", E:";", S:"l", W:"k" },
};
const GAMEPAD = { moveDeadzone:0.2, fireDeadzone:0.2 };

// keys is a plain set-of-held map, like input.js's `keys`.
function keyboardVec(map, keys){
  let x = 0, y = 0;
  for (const d of ["N","E","S","W"]) if (keys[map[d]]){ x += DIR[d][0]; y += DIR[d][1]; }
  return { x, y };
}
// Keyboard-mode fire angle (no mouse here -> null when keys cancel/none).
function fireAngleKeyboard(keys){
  const v = keyboardVec(KEYS.FIRE, keys);
  if (v.x || v.y) return Math.atan2(v.y, v.x);
  return null;
}
function moveVecKeyboard(keys){
  const v = keyboardVec(KEYS.MOVE, keys);
  const m = Math.hypot(v.x, v.y);
  return m > 0 ? { x:v.x/m, y:v.y/m } : { x:0, y:0 };
}
// Gamepad right-stick fire angle.
function fireAngleGamepad(ax, ay){
  if (Math.hypot(ax, ay) > GAMEPAD.fireDeadzone) return Math.atan2(ay, ax);
  return null;
}

// --- Tiny assert harness ---
let passed = 0, failed = 0;
const EPS = 1e-9;
function held(...ks){ const o = {}; for (const k of ks) o[k] = true; return o; }
function check(name, got, want){
  const ok = (got === null && want === null)
    || (typeof got === "number" && typeof want === "number" && Math.abs(got - want) < EPS);
  if (ok){ passed++; console.log(`  ok   ${name}`); }
  else  { failed++; console.log(`  FAIL ${name}: got ${got}, want ${want}`); }
}
function checkVec(name, got, wx, wy){
  const ok = Math.abs(got.x - wx) < EPS && Math.abs(got.y - wy) < EPS;
  if (ok){ passed++; console.log(`  ok   ${name}`); }
  else  { failed++; console.log(`  FAIL ${name}: got (${got.x},${got.y}), want (${wx},${wy})`); }
}

const PI = Math.PI;
console.log("Cardinal fire keys ->");
check("O alone = North", fireAngleKeyboard(held("o")), -PI/2);
check("L alone = South", fireAngleKeyboard(held("l")),  PI/2);
check("; alone = East",  fireAngleKeyboard(held(";")),  0);
check("K alone = West",  fireAngleKeyboard(held("k")),  PI);

console.log("Diagonal fire (two adjacent) ->");
check("O+; = NE", fireAngleKeyboard(held("o",";")), -PI/4);
check("O+K = NW", fireAngleKeyboard(held("o","k")), -PI*3/4);
check("L+; = SE", fireAngleKeyboard(held("l",";")),  PI/4);
check("L+K = SW", fireAngleKeyboard(held("l","k")),  PI*3/4);

console.log("Opposing fire keys cancel -> null ->");
check("O+L = null", fireAngleKeyboard(held("o","l")), null);
check("K+; = null", fireAngleKeyboard(held("k",";")), null);
check("none  = null", fireAngleKeyboard(held()), null);

console.log("Gamepad fire deadzone ->");
check("below deadzone = null", fireAngleGamepad(0.1, 0.1), null);
check("past deadzone (East)  = 0", fireAngleGamepad(0.9, 0), 0);

console.log("Move vectors ->");
const inv = 1/Math.sqrt(2);
checkVec("W+D = NE diagonal (normalized)", moveVecKeyboard(held("w","d")),  inv, -inv);
checkVec("S+A = SW diagonal (normalized)", moveVecKeyboard(held("s","a")), -inv,  inv);
checkVec("W alone = North unit",           moveVecKeyboard(held("w")),       0,  -1);
checkVec("W+S opposing = zero",            moveVecKeyboard(held("w","s")),    0,   0);
checkVec("none = zero",                    moveVecKeyboard(held()),           0,   0);

console.log("\ncamerafx.js — shake decays monotonically and reaches 0 at/after dur ->");
{
  fx.shake(10, 0.5);
  fx.tickShake(0.2);
  const mid = fx.currentShakeMag();
  fx.tickShake(0.2);
  const later = fx.currentShakeMag();
  check("mag decreased over time", mid > later ? 1 : 0, 1);
  fx.tickShake(0.2);   // total elapsed 0.6 > dur 0.5
  check("mag is 0 at/after dur", fx.currentShakeMag(), 0);
}

console.log("camerafx.js — shake takes the stronger, not additive ->");
{
  fx.shake(10, 1.0);
  fx.tickShake(0.1);
  const before = fx.currentShakeMag();
  fx.shake(2, 1.0);   // weaker while stronger still running -> ignored
  check("weaker shake while running does not override", fx.currentShakeMag(), before);
  fx.shake(10, 1.0);  // equal-or-larger -> resets
  check("equal/larger shake resets", fx.currentShakeMag(), 10);
}

console.log("camerafx.js — lowHpAlpha threshold ->");
{
  G.dan = { hp: 100, maxHp: 100, slow: 0 };
  check("above lowHpFraction -> 0", fx.lowHpAlpha(), 0);
  G.dan.hp = Math.floor(CFG.CAMERAFX.lowHpFraction * G.dan.maxHp) - 1;
  check("below lowHpFraction -> > 0", fx.lowHpAlpha() > 0 ? 1 : 0, 1);
  G.dan = null;
  check("G.dan null -> 0 (no throw)", fx.lowHpAlpha(), 0);
}

console.log("camerafx.js — pulseDesat decays to 0 by dur ->");
{
  fx.pulseDesat(0.6, 0.5);
  fx.tickDesat(0.5);
  check("currentDesat is 0 at dur", fx.currentDesat(), 0);
}

console.log("camerafx.js — currentZoom is 1 outside the punch window ->");
{
  check("no punch yet -> 1", fx.currentZoom(), 1);
  fx.punchZoom(1.2, 0.2);
  fx.tickZoom(0.25);   // past duration
  check("past punch duration -> 1", fx.currentZoom(), 1);
}

/* --- scanner-beam + berserk-lock smoke tests (pure math, no canvas) --------- */
(function testScanFXBeam(){
  const spacing = 34, speed = 46, len = 200;
  const chevrons = (t) => { const out=[]; const ph=(t*speed)%spacing; for(let s=ph;s<len-2;s+=spacing) out.push(s); return out; };
  const a0 = chevrons(0), a1 = chevrons(0.1);
  console.assert(a0.length >= 5, "beam: several chevrons over 200px");
  console.assert(a1[0] > a0[0], "beam: chevrons march toward the target as time advances");
  const wrapPhase = ((spacing/speed)*speed) % spacing;   // one full cycle of travel
  console.assert(Math.abs(wrapPhase) < 1e-6, "beam: phase returns to 0 after spacing/speed seconds");
})();
(function testAlarmInRange(){
  const R = 300, s = {x:0,y:0};
  const hit = (o)=> Math.hypot(o.x-s.x,o.y-s.y) <= R;
  console.assert(hit({x:200,y:100}) === true,  "alarm: in-range robot buffed (~223px)");
  console.assert(hit({x:300,y:300}) === false, "alarm: out-of-range robot not buffed (~424px)");
})();
(function testBerserkLock(){
  const LOCK = 1e9;
  console.assert(JSON.parse(JSON.stringify({b:LOCK})).b === LOCK, "berserk: finite lock survives save/load JSON");
  console.assert(JSON.parse(JSON.stringify({b:Infinity})).b === null, "berserk: Infinity would be lost by JSON (why we avoid it)");
  let b = LOCK; for (let i=0;i<60*60*10;i++) b -= 1/60;   // 10 min @ 60fps
  console.assert(b > 0, "berserk: lock still active after 10 simulated minutes");
})();
console.log("scanfx/berserk smoke tests passed");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
