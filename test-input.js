/* test-input.js — self-contained unit test for the input.js direction math.
   Inlines the pure functions (no imports / no DOM) and checks the GDD §4 cases.
   Run: node test-input.js   */

// --- Mirror of the constants/helpers in input.js (screen space, y-down) ---
const DIR = { N:[0,-1], E:[1,0], S:[0,1], W:[-1,0] };
const KEYS = {
  MOVE: { N:"w", E:"d", S:"s", W:"a" },
  FIRE: { N:"o", E:"p", S:"l", W:"k" },
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
check("P alone = East",  fireAngleKeyboard(held("p")),  0);
check("K alone = West",  fireAngleKeyboard(held("k")),  PI);

console.log("Diagonal fire (two adjacent) ->");
check("O+P = NE", fireAngleKeyboard(held("o","p")), -PI/4);
check("O+K = NW", fireAngleKeyboard(held("o","k")), -PI*3/4);
check("L+P = SE", fireAngleKeyboard(held("l","p")),  PI/4);
check("L+K = SW", fireAngleKeyboard(held("l","k")),  PI*3/4);

console.log("Opposing fire keys cancel -> null ->");
check("O+L = null", fireAngleKeyboard(held("o","l")), null);
check("K+P = null", fireAngleKeyboard(held("k","p")), null);
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
