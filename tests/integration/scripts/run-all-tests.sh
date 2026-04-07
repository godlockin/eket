#!/usr/bin/env bash
#
# Run all EKET SDK integration tests
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=== EKET SDK Integration Tests ==="
echo

# Check prerequisites
echo "Checking prerequisites..."

# Check Redis
if ! docker ps | grep -q eket-redis; then
  echo "❌ Redis not running. Start with: docker run -d --name eket-redis -p 6379:6379 redis:7-alpine"
  exit 1
fi
echo "✓ Redis running"

# Check EKET Server
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
  echo "❌ EKET Server not running"
  echo "   Start with: cd node && node dist/index.js server:start --port 8080 &"
  exit 1
fi
echo "✓ EKET Server running"

echo

# Run Python SDK tests
echo "=== Python SDK Tests ==="
cd "$PROJECT_ROOT"

if command -v pytest > /dev/null; then
  pytest tests/integration/sdk/python/ -v --junit-xml=tests/integration/reports/python-results.xml || echo "⚠️ Some Python tests failed"
else
  echo "⚠️ pytest not found, skipping Python tests"
fi

echo

# Run JavaScript SDK tests
echo "=== JavaScript SDK Tests ==="
cd "$PROJECT_ROOT/sdk/javascript"

if [ -f package.json ] && grep -q "\"test\"" package.json; then
  npm test -- --testPathPattern=integration || echo "⚠️ Some JavaScript tests failed"
else
  echo "⚠️ JavaScript tests not configured"
fi

echo

# Run Cross-SDK tests
echo "=== Cross-SDK Interoperability Tests ==="
cd "$PROJECT_ROOT"

if command -v pytest > /dev/null; then
  pytest tests/integration/sdk/cross-sdk/ -v --junit-xml=tests/integration/reports/cross-sdk-results.xml || echo "⚠️ Some cross-SDK tests failed"
else
  echo "⚠️ pytest not found, skipping cross-SDK tests"
fi

echo
echo "=== Test Summary ==="
echo

# Generate summary report
if [ -f tests/integration/reports/python-results.xml ]; then
  PYTHON_TESTS=$(grep -o 'tests="[0-9]*"' tests/integration/reports/python-results.xml | grep -o '[0-9]*' | head -1)
  PYTHON_FAILURES=$(grep -o 'failures="[0-9]*"' tests/integration/reports/python-results.xml | grep -o '[0-9]*' | head -1)
  echo "Python SDK: $PYTHON_TESTS tests, $PYTHON_FAILURES failures"
fi

if [ -f tests/integration/reports/cross-sdk-results.xml ]; then
  CROSS_TESTS=$(grep -o 'tests="[0-9]*"' tests/integration/reports/cross-sdk-results.xml | grep -o '[0-9]*' | head -1)
  CROSS_FAILURES=$(grep -o 'failures="[0-9]*"' tests/integration/reports/cross-sdk-results.xml | grep -o '[0-9]*' | head -1)
  echo "Cross-SDK: $CROSS_TESTS tests, $CROSS_FAILURES failures"
fi

echo
echo "Reports available in: tests/integration/reports/"
echo "✅ Test run completed"
