#!/bin/bash
# Goal check script for pi-messageboard bug fixes
set -e
cd "$(dirname "$0")"

SCORE=0
ISSUES=0

# 1. All unit tests pass
echo "=== Unit tests ==="
if node --import tsx --test src/__tests__/names.test.ts src/__tests__/db.test.ts src/__tests__/tools.test.ts src/__tests__/mb/db.test.ts src/__tests__/mb/spawn.test.ts src/__tests__/mb/loop.test.ts src/__tests__/integration-mb.test.ts 2>&1 | grep -q "fail 0"; then
	SCORE=$((SCORE + 30))
	echo "✓ All unit tests pass"
else
	ISSUES=$((ISSUES + 1))
	echo "✗ Some unit tests fail"
fi

# 2. TypeScript compiles
echo ""
echo "=== TypeScript ==="
if npx tsc --noEmit 2>&1 | grep -q "error"; then
	ISSUES=$((ISSUES + 1))
	echo "✗ TypeScript errors"
else
	SCORE=$((SCORE + 20))
	echo "✓ No TypeScript errors"
fi

# 3. Extension loads without crash
echo ""
echo "=== Extension load ==="
if node --import tsx -e "import ext from './src/index.ts'; ext({ registerTool:()=>{}, registerCommand:()=>{}, on:()=>{}, sendMessage:()=>{}, events:{on:()=>()=>{}}, ui:{notify:()=>{},setStatus:()=>{}}, sessionManager:{getSessionId:()=>'test',getSessionFile:()=>null} });" 2>&1 | grep -q "Error\|error\|crash"; then
	ISSUES=$((ISSUES + 1))
	echo "✗ Extension crashes on load"
else
	SCORE=$((SCORE + 20))
	echo "✓ Extension loads cleanly"
fi

# 4. getMyAgentId doesn't throw
echo ""
echo "=== getMyAgentId ==="
if node --import tsx -e "
import { getMyAgentId } from './src/tools.js';
try { getMyAgentId(); console.log('FAIL: should throw'); } catch(e) { console.log('OK: throws as expected'); }
" 2>&1 | grep -q "OK"; then
	SCORE=$((SCORE + 15))
	echo "✓ getMyAgentId throws before registration (expected)"
else
	ISSUES=$((ISSUES + 1))
	echo "✗ getMyAgentId behavior unexpected"
fi

# 5. mb prepare triggers sendMessage
echo ""
echo "=== /mb prepare ==="
if node --import tsx -e "
import ext from './src/index.ts';
let sent = false;
ext({
  registerTool:()=>{}, registerCommand:(c,d)=>{ if(c==='mb') d.handler('prepare',{ui:{notify:()=>{}}}); },
  on:()=>{}, sendMessage:()=>{ sent=true; }, events:{on:()=>()=>{}}, ui:{notify:()=>{},setStatus:()=>{}},
  sessionManager:{getSessionId:()=>'test',getSessionFile:()=>null}
});
console.log(sent ? 'OK' : 'FAIL');
" 2>&1 | grep -q "OK"; then
	SCORE=$((SCORE + 15))
	echo "✓ /mb prepare calls sendMessage"
else
	ISSUES=$((ISSUES + 1))
	echo "✗ /mb prepare doesn't trigger"
fi

echo ""
echo "=========================="
echo "SCORE: $SCORE"
echo "ISSUES: $ISSUES"
echo "=========================="

if [ "$SCORE" -ge 80 ] && [ "$ISSUES" -eq 0 ]; then
	echo "✓ All criteria met"
	exit 0
else
	echo "✗ Criteria not fully met"
	exit 1
fi
