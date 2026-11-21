#!/usr/bin/env bash
# usage: BASE=http://localhost:3302 bash tests/e2e/run-all.sh   (server from scratchpad/run-demo.sh, dummy data only)
cd "$(dirname "$0")/../.." || exit 1
for f in tests/e2e/0*.e2e.mjs; do echo "=== $f"; node "$f" 2>&1 | grep -E '^(PASS|FAIL|INFO|ERRS)'; done
