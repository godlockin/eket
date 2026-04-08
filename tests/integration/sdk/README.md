# EKET SDK Integration Tests

This directory contains comprehensive integration tests for the EKET Python and JavaScript SDKs.

## Directory Structure

```
tests/integration/sdk/
├── python/                    # Python SDK tests
│   ├── test_agent_lifecycle.py
│   ├── test_task_management.py
│   ├── test_messaging.py
│   ├── test_pr_workflow.py
│   └── test_error_handling.py
├── javascript/                # JavaScript SDK tests
│   ├── test_agent_lifecycle.test.ts
│   ├── test_task_management.test.ts
│   ├── test_messaging.test.ts
│   ├── test_pr_workflow.test.ts
│   └── test_error_handling.test.ts
├── cross-sdk/                 # Cross-SDK interoperability tests
│   ├── test_master_slaver.py
│   └── test_mixed_messaging.py
└── README.md                  # This file
```

## Prerequisites

### 1. Start Redis

```bash
docker run -d --name eket-redis -p 6379:6379 redis:7-alpine
```

### 2. Start EKET Server

```bash
cd node
npm run build
export EKET_JWT_SECRET="test-secret-key-1234567890"
node dist/index.js server:start --port 8080 &
```

### 3. Install Dependencies

#### Python SDK
```bash
cd sdk/python
pip install -e .
pip install pytest pytest-asyncio
```

#### JavaScript SDK
```bash
cd sdk/javascript
npm install
npm run build
```

## Running Tests

### Run All Tests

```bash
./tests/integration/scripts/run-all-tests.sh
```

### Python SDK Tests Only

```bash
pytest tests/integration/sdk/python/ -v
```

### JavaScript SDK Tests Only

```bash
cd sdk/javascript
npm test -- tests/integration/sdk/javascript/
```

### Cross-SDK Tests

```bash
pytest tests/integration/sdk/cross-sdk/ -v
```

## Test Categories

### 1. Agent Lifecycle Tests

**Python**: `test_agent_lifecycle.py`
**JavaScript**: `test_agent_lifecycle.test.ts`

Tests:
- Agent registration (master/slaver roles)
- Heartbeat mechanism
- Agent deregistration
- Token validation

### 2. Task Management Tests

**Python**: `test_task_management.py`
**JavaScript**: `test_task_management.test.ts`

Tests:
- Task creation
- Task querying (by status, assignee)
- Task claiming
- Task updates (status, progress)
- Task completion

### 3. Messaging Tests

**Python**: `test_messaging.py`
**JavaScript**: `test_messaging.test.ts`

Tests:
- Send message
- Retrieve messages
- Message filtering
- Message types
- Priority handling

### 4. PR Workflow Tests

**Python**: `test_pr_workflow.py`
**JavaScript**: `test_pr_workflow.test.ts`

Tests:
- PR submission
- PR review (approve/reject)
- PR merge
- PR status tracking

### 5. Error Handling Tests

**Python**: `test_error_handling.py`
**JavaScript**: `test_error_handling.test.ts`

Tests:
- Network errors and retries
- Authentication failures
- Invalid requests
- Rate limiting (if implemented)
- Timeout handling

### 6. Cross-SDK Interoperability Tests

**Tests**: `cross-sdk/test_master_slaver.py`, `cross-sdk/test_mixed_messaging.py`

Tests:
- Python Master + JavaScript Slaver collaboration
- JavaScript Master + Python Slaver collaboration
- Mixed-language messaging
- End-to-end workflow across SDKs

## Test Environment Variables

```bash
export EKET_SERVER_URL="http://localhost:8080"
export EKET_JWT_SECRET="test-secret-key-1234567890"
export EKET_TEST_TIMEOUT=30  # Test timeout in seconds
```

## CI/CD Integration

Tests can be run in CI/CD pipelines:

```yaml
name: SDK Integration Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          npm install
          pip install pytest pytest-asyncio

      - name: Start EKET Server
        run: |
          npm run build
          export EKET_JWT_SECRET="test-secret-key"
          node dist/index.js server:start --port 8080 &
          sleep 5

      - name: Run tests
        run: ./tests/integration/scripts/run-all-tests.sh
```

## Test Reports

After running tests, view reports in:
- `tests/integration/reports/python-test-report.xml` (JUnit format)
- `tests/integration/reports/javascript-test-report.xml` (JUnit format)
- `tests/integration/reports/coverage/` (Coverage reports)

## Troubleshooting

### Server not responding

```bash
# Check if server is running
curl http://localhost:8080/health

# Check server logs
tail -f logs/eket-server.log
```

### Redis connection failed

```bash
# Check if Redis is running
docker ps | grep eket-redis

# Restart Redis
docker restart eket-redis
```

### SDK import errors

```bash
# Rebuild Python SDK
cd sdk/python && pip install -e . --force-reinstall

# Rebuild JavaScript SDK
cd sdk/javascript && npm run build
```

## Contributing

When adding new tests:
1. Follow existing test patterns
2. Use descriptive test names
3. Add docstrings explaining test purpose
4. Clean up resources in teardown/afterEach
5. Update this README with new test categories

## Learn More

- **EKET Protocol**: `docs/protocol/EKET_PROTOCOL_V1.md`
- **Python SDK**: `sdk/python/README.md`
- **JavaScript SDK**: `sdk/javascript/README.md`
