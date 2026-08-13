#!/bin/bash
# Loop check script for messageboard improvements
# Exit 0 = criteria met (score >= 80 recommended for "done")
# Prints SCORE: <n> (0-100)

SCORE=0

# 1. TypeScript compiles (10 pts)
if npm run typecheck >/dev/null 2>&1; then
	SCORE=$((SCORE + 10))
	echo "PASS: typecheck"
else
	echo "FAIL: typecheck"
fi

# 2. All 4 test files pass (20 pts)
if node --import tsx --test src/__tests__/names.test.ts src/__tests__/db.test.ts src/__tests__/tools.test.ts src/__tests__/integration.test.ts >/dev/null 2>&1; then
	SCORE=$((SCORE + 20))
	echo "PASS: all 4 test files"
else
	echo "FAIL: tests"
fi

# 3. DB has messages_fts (FTS5) (10 pts)
DB_FILE="${HOME}/.pi/agent/messageboard/board.db"
if [ -f "$DB_FILE" ]; then
	if sqlite3 "$DB_FILE" ".schema messages_fts" 2>/dev/null | grep -q "CREATE VIRTUAL"; then
		SCORE=$((SCORE + 10))
		echo "PASS: FTS5 table exists"
	else
		echo "FAIL: FTS5 table missing"
	fi
else
	echo "SKIP: DB file not found at $DB_FILE (may need to run first)"
fi

# 4. DB has mentions table (10 pts)
if [ -f "$DB_FILE" ]; then
	if sqlite3 "$DB_FILE" ".tables" 2>/dev/null | grep -qw "mentions"; then
		SCORE=$((SCORE + 10))
		echo "PASS: mentions table exists"
	else
		echo "FAIL: mentions table missing"
	fi
else
	echo "SKIP: DB file missing"
fi

# 5. Indexes exist (10 pts) — check for at least 3 of the 6 target indexes
IDX_COUNT=0
for idx in "idx_messages_category_status" "idx_messages_author" "idx_messages_assigned" "idx_replies_message" "idx_inbox_to" "idx_bookmarks_agent"; do
	if sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='index' AND name='$idx';" 2>/dev/null | grep -q "$idx"; then
		IDX_COUNT=$((IDX_COUNT + 1))
	fi
done
if [ "$IDX_COUNT" -ge 3 ]; then
	SCORE=$((SCORE + 10))
	echo "PASS: indexes ($IDX_COUNT found)"
else
	echo "FAIL: indexes ($IDX_COUNT found, need >=3)"
fi

# 6. Migrations directory exists with SQL files (10 pts)
if [ -d "src/migrations" ]; then
	SQL_COUNT=$(ls src/migrations/*.sql 2>/dev/null | wc -l)
	if [ "$SQL_COUNT" -ge 1 ]; then
		SCORE=$((SCORE + 10))
		echo "PASS: migrations ($SQL_COUNT sql files)"
	else
		echo "FAIL: migrations dir has no .sql files"
	fi
else
	echo "FAIL: migrations dir missing"
fi

# 7. /mentions command registered (10 pts)
if grep -q "mentions" src/commands.ts; then
	SCORE=$((SCORE + 10))
	echo "PASS: /mentions command"
else
	echo "FAIL: /mentions command missing"
fi

# 8. messageboard_read_mentions tool registered (10 pts)
if grep -q "messageboard_read_mentions" src/tools.ts; then
	SCORE=$((SCORE + 10))
	echo "PASS: read_mentions tool"
else
	echo "FAIL: read_mentions tool missing"
fi

# 9. Git commit with "loop:" (10 pts)
if git log --oneline -n 5 2>/dev/null | grep -q "loop:"; then
	SCORE=$((SCORE + 10))
	echo "PASS: git commit with 'loop:'"
else
	echo "FAIL: no 'loop:' commit found"
fi

echo "SCORE: $SCORE"
if [ "$SCORE" -ge 80 ]; then
	exit 0
else
	exit 1
fi
