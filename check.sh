#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

score=0
checks=0

run_check() {
	checks=$((checks + 1))
	if "$@"; then
		score=$((score + 1))
	else
		echo "FAIL: $*" >&2
	fi
}

run_check npm run typecheck
run_check node --import tsx --test src/__tests__/web.test.ts
run_check grep -q "127.0.0.1" src/web.ts
run_check grep -q "messageboard:message" src/index.ts
run_check grep -q "messageboard:dm" src/index.ts

printf 'SCORE: %d/%d\n' "$score" "$checks"
[ "$score" -eq "$checks" ]
