#!/bin/bash
set -e

echo "=== Unit Tests ==="
node --import tsx --test src/__tests__/names.test.ts src/__tests__/db.test.ts src/__tests__/tools.test.ts

echo ""
echo "=== Integration Tests ==="
node --import tsx --test src/__tests__/integration.test.ts

echo ""
echo "=== All tests passed ==="
