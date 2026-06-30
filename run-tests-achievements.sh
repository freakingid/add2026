#!/usr/bin/env bash
# run-tests-achievements.sh — Run all four split achievement test files.
# Usage: bash run-tests-achievements.sh

set -e
cd "$(dirname "$0")"

TOTAL_PASS=0
TOTAL_FAIL=0
FAILED_FILES=()

run_test() {
  local file="$1"
  echo ""
  echo "========================================"
  echo "  Running $file"
  echo "========================================"
  if node --experimental-vm-modules "$file" 2>&1; then
    echo "  → $file: OK"
  else
    echo "  → $file: FAILED"
    FAILED_FILES+=("$file")
  fi
}

run_test test-achievements-p1p2.js
run_test test-achievements-p3.js
run_test test-achievements-p4.js
run_test test-achievements-p5p6p7.js

echo ""
echo "========================================"
if [ ${#FAILED_FILES[@]} -eq 0 ]; then
  echo "All achievement test files passed. ✓"
else
  echo "FAILED FILES:"
  for f in "${FAILED_FILES[@]}"; do echo "  $f"; done
  exit 1
fi