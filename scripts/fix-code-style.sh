#!/bin/bash
#
# EKET Framework - Code Style Auto-Fix Script
#
# This script runs ESLint and Prettier to automatically fix code style issues.
#
# Usage:
#   ./scripts/fix-code-style.sh [--dry-run]
#
# Options:
#   --dry-run    Show what would be fixed without making changes
#
# Requirements:
#   - Node.js >= 18.0.0
#   - ESLint and Prettier installed in node_modules
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$(dirname "$SCRIPT_DIR")/node"

# Check if we're in dry-run mode
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${BLUE}Running in dry-run mode - no files will be modified${NC}"
    echo ""
fi

# Change to node directory
cd "$NODE_DIR"

# Check if node_modules exists
if [[ ! -d "node_modules" ]]; then
    echo -e "${YELLOW}node_modules not found. Running npm install...${NC}"
    npm install
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  EKET Code Style Auto-Fix${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Run Prettier
echo -e "${BLUE}Step 1: Running Prettier...${NC}"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  (dry-run: checking files without writing)${NC}"
    if npx prettier --check "src/**/*.ts" 2>/dev/null; then
        echo -e "${GREEN}  All files are formatted correctly${NC}"
    else
        echo -e "${YELLOW}  Some files need formatting (run without --dry-run to fix)${NC}"
    fi
else
    if npx prettier --write "src/**/*.ts"; then
        echo -e "${GREEN}  Prettier formatting complete${NC}"
    else
        echo -e "${RED}  Prettier encountered an error${NC}"
    fi
fi
echo ""

# Step 2: Run ESLint with auto-fix
echo -e "${BLUE}Step 2: Running ESLint with auto-fix...${NC}"
if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  (dry-run: checking without fixing)${NC}"
    if npx eslint "src/**/*.ts" 2>/dev/null; then
        echo -e "${GREEN}  No ESLint errors found${NC}"
    else
        echo -e "${YELLOW}  ESLint found issues (run without --dry-run to auto-fix)${NC}"
    fi
else
    if npx eslint "src/**/*.ts" --fix; then
        echo -e "${GREEN}  ESLint auto-fix complete${NC}"
    else
        echo -e "${YELLOW}  ESLint found issues that need manual review${NC}"
    fi
fi
echo ""

# Step 3: Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [[ "$DRY_RUN" == true ]]; then
    echo -e "${YELLOW}  Dry-run complete. Run without --dry-run to apply fixes.${NC}"
else
    echo -e "${GREEN}  Code style fixes applied successfully!${NC}"
    echo ""
    echo -e "${BLUE}  Next steps:${NC}"
    echo -e "    1. Review changes: ${YELLOW}git diff${NC}"
    echo -e "    2. Run tests: ${YELLOW}npm test${NC}"
    echo -e "    3. Commit changes: ${YELLOW}git add . && git commit -m 'style: auto-fix code style issues'${NC}"
fi
echo ""
