# EKET Health Check

**Script**: `scripts/health_check.sh`  
**Version**: 1.0.0  
**Purpose**: Validate EKET environment health before operations

---

## Quick Start

```bash
# Run from project root
bash scripts/health_check.sh

# Example output:
# ========================================
#   EKET Health Check v1.0.0
# ========================================
# 
# Git Repository...             ✅ Clean (branch: main)
# Node.js Version...            ✅ v18.20.0 (>= 18)
# npm Dependencies...           ✅ Installed and verified
# Redis Connection (optional)...⚠️  Connection refused (optional)
# SQLite Database...            ✅ Found and verified (.eket/state/eket.db)
# Core Directories...           ✅ All present (confluence, jira, node)
# Configuration (.eket/config.yml)...✅ Valid YAML
# 
# ========================================
#   Summary
# ========================================
# ✅ Passed: 6
# ❌ Failed: 0
# ⚠️  Optional Failed: 1
# 
# Overall: 6/7 checks passed (1 optional)
```

---

## Checks Performed

### 1. Git Repository Status
- **Type**: Critical
- **Validates**:
  - Directory is valid git repository
  - Working tree status (clean/uncommitted)
  - Current branch (detached HEAD warning)
- **Failure Action**: Exit code 2

### 2. Node.js Version
- **Type**: Critical
- **Requirement**: >= 18.x
- **Validates**: `node -v` output
- **Failure Action**: Exit code 2

### 3. npm Dependencies
- **Type**: Critical
- **Validates**:
  - `node_modules/` exists
  - `package-lock.json` in sync
  - `npm ls` returns no errors
- **Failure Action**: Exit code 2
- **Fix**: `cd node && npm install`

### 4. Redis Connection
- **Type**: Optional
- **Validates**:
  - `redis-cli` available
  - `redis-cli ping` succeeds
- **Failure Action**: Warning only (exit 0)
- **Note**: Redis required for production, optional for dev

### 5. SQLite Database
- **Type**: Critical
- **Validates**:
  - `sqlite3` command available
  - Database file exists (`.eket/state/eket.db` or `node/eket.db`)
  - `PRAGMA integrity_check` passes
- **Failure Action**: Exit code 2 (if corruption detected)
- **Warning**: If DB not found (will be created on first run)

### 6. Core Directories
- **Type**: Critical
- **Required Directories**:
  - `confluence/` - Knowledge base
  - `jira/` - Task tickets
  - `node/` - Core runtime
- **Failure Action**: Exit code 2
- **Fix**: Clone full EKET repository

### 7. Configuration Validity
- **Type**: Critical
- **Validates**:
  - `.eket/config.yml` exists and readable
  - YAML syntax valid (`python3 -c 'import yaml; ...'`)
- **Failure Action**: Exit code 2
- **Warning**: If config missing (uses defaults)

---

## Exit Codes

| Code | Status | Description |
|------|--------|-------------|
| `0` | ✅ Success | All checks passed (optional failures allowed) |
| `1` | ⚠️ Partial | Non-critical checks failed |
| `2` | ❌ Critical | Critical checks failed, fix before proceeding |

---

## CI Integration

### GitHub Actions

Created workflow: `.github/workflows/health-check.yml`

```yaml
name: Health Check

on:
  push:
    branches: [main, testing, feature/*]
  pull_request:

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
        working-directory: ./node
      - name: Run Health Check
        run: bash scripts/health_check.sh
```

**Workflow triggers**:
- Every push to main/testing/feature branches
- All pull requests
- Manual dispatch

**Fail conditions**:
- Exit code 2 (critical failure) → Workflow fails
- Exit code 1 (partial) → Workflow succeeds with warnings
- Exit code 0 → Success

---

## Troubleshooting

### "timeout command not found" (macOS)

**Symptom**: Script fails on macOS

**Cause**: macOS lacks GNU `timeout`

**Fix**: Already handled via fallback:
```bash
# Script auto-detects and uses:
# 1. timeout (Linux)
# 2. gtimeout (brew install coreutils)
# 3. No timeout (macOS fallback)
```

**Install gtimeout** (recommended):
```bash
brew install coreutils
```

### "SQLite Database integrity check failed"

**Symptom**: Exit code 2, DB check fails

**Cause**: Database corruption or locked file

**Fix**:
```bash
# Check if DB file exists
ls -lh .eket/state/eket.db

# Manual integrity check
sqlite3 .eket/state/eket.db 'PRAGMA integrity_check;'

# If corrupted, restore from backup
cp .eket/state/backups/eket.db.backup .eket/state/eket.db
```

### "npm Dependencies installed but may need update"

**Symptom**: Warning (exit 0)

**Cause**: `npm ls` reports vulnerabilities or version mismatches

**Fix**:
```bash
cd node
npm audit fix
npm install
```

### "Redis Connection refused"

**Symptom**: Warning (exit 0)

**Cause**: Redis not running or not installed

**Fix** (production):
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

**Note**: Optional for development

### "Invalid YAML syntax"

**Symptom**: Exit code 2

**Cause**: Malformed `.eket/config.yml`

**Fix**:
```bash
# Validate manually
python3 -c 'import yaml; yaml.safe_load(open(".eket/config.yml"))'

# Or use online validator
cat .eket/config.yml | pbcopy  # Paste to yamllint.com
```

---

## Timeout Configuration

Default timeout per check: **10 seconds**

Modify in script:
```bash
# Line 13
TIMEOUT=10  # Change to desired value
```

---

## Usage Scenarios

### Pre-Deploy Validation
```bash
# Run before deploying to production
bash scripts/health_check.sh
if [ $? -eq 0 ]; then
    echo "✅ System healthy, proceeding with deploy"
    ./deploy.sh
else
    echo "❌ Health check failed, aborting deploy"
    exit 1
fi
```

### Scheduled Monitoring (cron)
```bash
# /etc/crontab
0 */6 * * * cd /path/to/eket && bash scripts/health_check.sh >> /var/log/eket-health.log 2>&1
```

### Developer Onboarding
```bash
# After cloning repo
git clone git@github.com:godlockin/eket.git
cd eket
bash scripts/health_check.sh

# Fix any failures before proceeding
npm install  # If npm check failed
brew install redis  # If Redis needed
```

---

## Extending Checks

Add custom check to script:

```bash
# Add after check_config_validity()
check_custom_service() {
    check_start "Custom Service"

    if curl -s http://localhost:3000/health &>/dev/null; then
        check_pass "Responding"
    else
        check_fail "Not responding"
    fi
}

# Add to main()
main() {
    # ... existing checks ...
    check_custom_service  # <-- Add here
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-10 | Initial release (TASK-616) |

---

## See Also

- [EKET Architecture](../architecture/overview.md)
- [CI/CD Pipeline](./cicd.md)
- [Troubleshooting Guide](./troubleshooting.md)

---

**Maintained by**: EKET Framework Team  
**Last Updated**: 2026-05-10
