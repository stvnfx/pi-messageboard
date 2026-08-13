#!/bin/bash
# Goal check script for pi-messageboard improvement loop
# Exit 0 = criteria met, SCORE: n = progress metric

set -e

cd "$(dirname "$0")"

SCORE=0
ISSUES=0

# 1. All unit tests pass
echo "=== Running unit tests ==="
if node --import tsx --test src/__tests__/names.test.ts src/__tests__/db.test.ts src/__tests__/tools.test.ts 2>&1 | grep -q "fail 0"; then
	SCORE=$((SCORE + 25))
	echo "✓ All unit tests pass"
else
	ISSUES=$((ISSUES + 1))
	echo "✗ Some unit tests fail"
fi

# 2. mb/ tests exist and pass
echo ""
echo "=== Running mb/ tests ==="
MB_TEST_FILES=$(find src/__tests__ -name "mb*.test.ts" 2>/dev/null | wc -l)
if [ "$MB_TEST_FILES" -gt 0 ]; then
	if node --import tsx --test src/__tests__/mb*.test.ts 2>&1 | grep -q "fail 0"; then
		SCORE=$((SCORE + 25))
		echo "✓ mb/ tests pass ($MB_TEST_FILES test files)"
	else
		ISSUES=$((ISSUES + 1))
		echo "✗ mb/ tests fail"
	fi
else
	echo "⚠ No mb/ test files found"
fi

# 3. TypeScript compiles cleanly
echo ""
echo "=== TypeScript check ==="
if npx tsc --noEmit 2>&1 | grep -q "error"; then
	ISSUES=$((ISSUES + 1))
	echo "✗ TypeScript errors"
else
	SCORE=$((SCORE + 25))
	echo "✓ No TypeScript errors"
fi

# 4. README has mb/ tools documented
echo ""
echo "=== README documentation ==="
if grep -q "mb_spawn" README.md && grep -q "mb_loop" README.md; then
	SCORE=$((SCORE + 15))
	echo "✓ README documents mb/ tools"
else
	ISSUES=$((ISSUES + 1))
	echo "✗ README missing mb/ tool documentation"
fi

# 5. GOAL.md exists and has milestones
echo ""
echo "=== Goal specification ==="
if [ -f "GOAL.md" ] && grep -q "Milestone" GOAL.md; then
	SCORE=$((SCORE + 10))
	echo "✓ GOAL.md exists with milestones"
else
	ISSUES=$((ISSUES + 1))
	echo "✗ GOAL.md missing or incomplete"
fi

# Final score
echo ""
echo "=========================="
echo "SCORE: $SCORE"
echo "ISSUES: $ISSUES"
echo "=========================="

if [ "$ISSUES" -eq 0 ] && [ "$SCORE" -ge 80 ]; then
	echo "✓ All criteria met"
	exit 0
else
	echo "✗ Criteria not fully met"
	exit 1
fi
