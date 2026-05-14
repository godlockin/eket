#!/usr/bin/env bash
#
# EKET Health Check Script
# Validates environment health for EKET Master-Slaver framework
#
# Exit codes:
#   0 - All checks passed
#   1 - Partial failure (non-critical checks failed)
#   2 - Critical failure (required checks failed)
#

set -o pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check results
PASSED=0
FAILED=0
OPTIONAL_FAILED=0
CRITICAL_FAILED=0

# Timeout for each check (seconds)
TIMEOUT=10

# Helper functions
check_start() {
    printf "%-30s" "$1..."
}

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED++))
    ((CRITICAL_FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((OPTIONAL_FAILED++))
}

run_with_timeout() {
    local cmd="$1"
    local timeout_val="${2:-$TIMEOUT}"

    # Use gtimeout (brew install coreutils) or fallback to Perl
    local timeout_cmd=""
    if command -v timeout &>/dev/null; then
        timeout_cmd="timeout"
    elif command -v gtimeout &>/dev/null; then
        timeout_cmd="gtimeout"
    else
        # Fallback: run without timeout (risky but functional)
        if bash -c "$cmd" &>/dev/null; then
            return 0
        else
            return 1
        fi
    fi

    if $timeout_cmd "$timeout_val" bash -c "$cmd" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

# ==================== CHECK 1: Git Repository Status ====================
check_git_status() {
    check_start "Git Repository"

    if ! git rev-parse --git-dir &>/dev/null; then
        check_fail "Not a git repository"
        return 1
    fi

    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        check_warn "Uncommitted changes detected"
    else
        # Check if we're on a valid branch
        branch=$(git branch --show-current 2>/dev/null)
        if [ -z "$branch" ]; then
            check_warn "Detached HEAD state"
        else
            check_pass "Clean (branch: $branch)"
        fi
    fi
}

# ==================== CHECK 2: Node.js Version ====================
check_nodejs_version() {
    check_start "Node.js Version"

    if ! command -v node &>/dev/null; then
        check_fail "Node.js not installed"
        return 1
    fi

    node_version=$(node -v 2>/dev/null | sed 's/v//')
    major_version=$(echo "$node_version" | cut -d. -f1)

    if [ "$major_version" -ge 18 ]; then
        check_pass "v$node_version (>= 18)"
    else
        check_fail "v$node_version (requires >= 18)"
    fi
}

# ==================== CHECK 3: npm Dependencies ====================
check_npm_dependencies() {
    check_start "npm Dependencies"

    if [ ! -d "node_modules" ]; then
        check_fail "node_modules not found (run: npm install)"
        return 1
    fi

    # Check if package-lock.json is in sync
    if [ -f "node/package-lock.json" ]; then
        if run_with_timeout "cd node && npm ls &>/dev/null" 15; then
            check_pass "Installed and verified"
        else
            check_warn "Installed but may need update (npm audit)"
        fi
    else
        check_warn "package-lock.json missing"
    fi
}

# ==================== CHECK 4: Redis Connection (Optional) ====================
check_redis_connection() {
    check_start "Redis Connection (optional)"

    if ! command -v redis-cli &>/dev/null; then
        check_warn "redis-cli not installed"
        return 0
    fi

    # Try to ping Redis
    if run_with_timeout "redis-cli ping" 3; then
        check_pass "Connected"
    else
        check_warn "Connection refused (optional)"
    fi
}

# ==================== CHECK 5: SQLite Database ====================
check_sqlite_database() {
    check_start "SQLite Database"

    if ! command -v sqlite3 &>/dev/null; then
        check_fail "sqlite3 not installed"
        return 1
    fi

    # Find database file
    db_file=""
    if [ -f ".eket/state/eket.db" ]; then
        db_file=".eket/state/eket.db"
    elif [ -f "node/eket.db" ]; then
        db_file="node/eket.db"
    fi

    if [ -z "$db_file" ]; then
        check_warn "Database not found (will be created on first run)"
        return 0
    fi

    # Test database integrity
    if run_with_timeout "sqlite3 '$db_file' 'PRAGMA integrity_check;'" 5; then
        check_pass "Found and verified ($db_file)"
    else
        check_fail "Database integrity check failed"
    fi
}

# ==================== CHECK 6: Core Directories ====================
check_core_directories() {
    check_start "Core Directories"

    required_dirs=("confluence" "jira" "node")
    missing_dirs=()

    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            missing_dirs+=("$dir")
        fi
    done

    if [ ${#missing_dirs[@]} -eq 0 ]; then
        check_pass "All present (confluence, jira, node)"
    else
        check_fail "Missing: ${missing_dirs[*]}"
    fi
}

# ==================== CHECK 7: Configuration Validity ====================
check_config_validity() {
    check_start "Configuration (.eket/config.yml)"

    config_file=".eket/config.yml"

    if [ ! -f "$config_file" ]; then
        check_warn "Config file not found (using defaults)"
        return 0
    fi

    # Check if YAML is valid (basic check)
    if command -v python3 &>/dev/null; then
        if run_with_timeout "python3 -c 'import yaml; yaml.safe_load(open(\"$config_file\"))'" 5; then
            check_pass "Valid YAML"
        else
            check_fail "Invalid YAML syntax"
        fi
    else
        # Fallback: just check if file is readable
        if [ -r "$config_file" ]; then
            check_pass "Readable (YAML validation skipped)"
        else
            check_fail "Not readable"
        fi
    fi
}

# ==================== Main Execution ====================
main() {
    echo "========================================"
    echo "  EKET Health Check v1.0.0"
    echo "========================================"
    echo ""

    # Run all checks
    check_git_status
    check_nodejs_version
    check_npm_dependencies
    check_redis_connection
    check_sqlite_database
    check_core_directories
    check_config_validity

    # Summary
    echo ""
    echo "========================================"
    echo "  Summary"
    echo "========================================"

    TOTAL=$((PASSED + FAILED + OPTIONAL_FAILED))

    echo -e "${GREEN}✅ Passed: $PASSED${NC}"
    echo -e "${RED}❌ Failed: $FAILED${NC}"
    echo -e "${YELLOW}⚠️  Optional Failed: $OPTIONAL_FAILED${NC}"
    echo ""

    if [ $CRITICAL_FAILED -gt 0 ]; then
        echo -e "${RED}Overall: CRITICAL FAILURE${NC}"
        echo "Critical checks failed. Fix issues before proceeding."
        exit 2
    elif [ $FAILED -gt 0 ]; then
        echo -e "${YELLOW}Overall: PARTIAL FAILURE${NC}"
        echo "Some checks failed. Review and fix as needed."
        exit 1
    elif [ $OPTIONAL_FAILED -gt 0 ]; then
        echo -e "${YELLOW}Overall: ${PASSED}/$TOTAL checks passed ($OPTIONAL_FAILED optional)${NC}"
        echo "Optional checks failed. System functional but not optimal."
        exit 0
    else
        echo -e "${GREEN}Overall: ALL CHECKS PASSED${NC}"
        echo "System ready for operation!"
        exit 0
    fi
}

# Ensure we're in project root
if [ ! -d ".eket" ] && [ ! -f "package.json" ] && [ ! -d "confluence" ]; then
    echo -e "${RED}Error: Run this script from EKET project root${NC}"
    exit 2
fi

main "$@"
