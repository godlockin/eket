# EKET Three-Repo Deployment Guide

> This guide shows how to deploy EKET's three physically-separate repositories for a real team. The monorepo you cloned (`eket/`) is the framework template — production deployments split `confluence`, `jira`, and `code` into independent Git repos with independent permissions.

---

## Why Three Repos?

| Concern | Reason |
|---------|--------|
| **Access control** | Humans and AI agents need different permission levels per repo. Code requires branch protection and CI; Jira needs write access for all agents; Confluence is read-heavy |
| **Audit trail** | Ticket lifecycle history must be queryable without pulling code diffs |
| **Scale** | `repo-code` can be large (build artifacts, LFS); keeping it separate prevents bloating knowledge/ticket repos |
| **Protocol clarity** | Cross-repo references make communication boundaries explicit — an agent knows exactly which repo it is authorized to write to |

---

## 1. Create Three Repos

### GitHub (recommended)

```bash
# Install GitHub CLI if needed: brew install gh
gh auth login

# Create repos (adjust org/names as needed)
gh repo create my-org/myproject-confluence \
  --private --description "EKET knowledge base for myproject"

gh repo create my-org/myproject-jira \
  --private --description "EKET task tracker for myproject"

gh repo create my-org/myproject-code \
  --private --description "myproject source code"
```

### GitLab

```bash
# Using glab CLI: brew install glab
glab repo create my-org/myproject-confluence --private
glab repo create my-org/myproject-jira       --private
glab repo create my-org/myproject-code       --private
```

### Gitee

```bash
# Using gitee API (no official CLI — use curl or the web UI)
curl -X POST https://gitee.com/api/v5/user/repos \
  -H "Content-Type: application/json" \
  -d '{"name":"myproject-confluence","private":true,"access_token":"<YOUR_TOKEN>"}'
# Repeat for myproject-jira and myproject-code
```

---

## 2. Clone All Three

```bash
# Choose a workspace root
export EKET_WORKSPACE=~/eket-workspace/myproject
mkdir -p "$EKET_WORKSPACE"

# Clone
git clone git@github.com:my-org/myproject-confluence.git "$EKET_WORKSPACE/repo-confluence"
git clone git@github.com:my-org/myproject-jira.git       "$EKET_WORKSPACE/repo-jira"
git clone git@github.com:my-org/myproject-code.git       "$EKET_WORKSPACE/repo-code"
```

### Directory structure after cloning

```
~/eket-workspace/myproject/
├── repo-confluence/
│   ├── architecture/
│   ├── memory/
│   │   ├── global/
│   │   └── project/
│   ├── skills/
│   ├── retrospectives/
│   └── team/
├── repo-jira/
│   ├── epics/
│   ├── backlog/
│   ├── inbox/
│   │   ├── human_feedback/
│   │   └── agent_feedback/
│   └── .eket/
│       ├── config.yml
│       ├── heartbeat/
│       ├── mailbox/
│       └── queue/
│           ├── task-events/
│           ├── review-requests/
│           └── ci-results/
└── repo-code/
    ├── src/
    ├── tests/
    └── .github/
        └── workflows/
```

---

## 3. Configure `.eket/config.yml`

This file lives in `repo-jira/.eket/config.yml` and is the single source of truth for cross-repo paths. Every agent reads it on startup.

```yaml
# repo-jira/.eket/config.yml
eket_version: "1.0"

repos:
  confluence:
    local_path: /Users/you/eket-workspace/myproject/repo-confluence
    remote_url: git@github.com:my-org/myproject-confluence.git
    default_branch: main
  jira:
    local_path: /Users/you/eket-workspace/myproject/repo-jira
    remote_url: git@github.com:my-org/myproject-jira.git
    default_branch: main
  code:
    local_path: /Users/you/eket-workspace/myproject/repo-code
    remote_url: git@github.com:my-org/myproject-code.git
    default_branch: main
    protected_branches:
      - main
      - release/*

agents:
  heartbeat_interval_seconds: 30
  heartbeat_stale_threshold_seconds: 90
  mailbox_poll_interval_seconds: 5

queue:
  backend: file           # "file" | "redis"
  redis_url: ~            # set to redis://localhost:6379 for Level 3

logging:
  level: info             # debug | info | warn | error
  format: json
```

### Environment variable overrides

Any `config.yml` value can be overridden with an env var using the pattern `EKET_<SECTION>_<KEY>` (uppercase, dots→underscores):

```bash
export EKET_REPOS_CODE_LOCAL_PATH=/different/path/repo-code
export EKET_QUEUE_BACKEND=redis
export EKET_QUEUE_REDIS_URL=redis://prod-redis:6379
```

---

## 4. Initialize with the Script

```bash
# From the eket framework template directory
bash scripts/init-three-repos.sh \
  --confluence /Users/you/eket-workspace/myproject/repo-confluence \
  --jira       /Users/you/eket-workspace/myproject/repo-jira \
  --code       /Users/you/eket-workspace/myproject/repo-code \
  --project    myproject \
  --org        my-org
```

The script performs:
1. Creates the standard directory skeleton in each repo
2. Writes `repo-jira/.eket/config.yml` with absolute paths
3. Creates `.gitkeep` files in empty dirs (so Git tracks them)
4. Makes an initial commit in each repo: `"chore: initialize eket three-repo structure"`
5. Prints the `IDENTITY.md` template for Master and Slaver agents

### `scripts/init-three-repos.sh` (full source)

```bash
#!/usr/bin/env bash
# EKET Three-Repo Initializer
# Usage: bash scripts/init-three-repos.sh --confluence <path> --jira <path> --code <path> [--project <name>] [--org <name>]
set -euo pipefail

CONFLUENCE=""
JIRA=""
CODE=""
PROJECT="myproject"
ORG="my-org"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confluence) CONFLUENCE="$2"; shift 2 ;;
    --jira)       JIRA="$2";       shift 2 ;;
    --code)       CODE="$2";       shift 2 ;;
    --project)    PROJECT="$2";    shift 2 ;;
    --org)        ORG="$2";        shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[ -z "$CONFLUENCE" ] || [ -z "$JIRA" ] || [ -z "$CODE" ] && {
  echo "Error: --confluence, --jira, and --code are required"; exit 1
}

init_git_repo() {
  local dir="$1"
  if [ ! -d "$dir/.git" ]; then
    git -C "$dir" init
    git -C "$dir" checkout -b main
  fi
}

# ── repo-confluence ────────────────────────────────────────────────
echo "→ Initializing repo-confluence at $CONFLUENCE"
mkdir -p "$CONFLUENCE"/{architecture,memory/{global,project},skills,retrospectives,team}
init_git_repo "$CONFLUENCE"
find "$CONFLUENCE" -type d -empty -exec touch {}/.gitkeep \;
cat > "$CONFLUENCE/README.md" << EOF
# ${PROJECT} — Confluence

Team knowledge base for the EKET framework.

| Directory | Contents |
|-----------|---------|
| \`architecture/\` | System design, C4 diagrams, ADRs |
| \`memory/global/\` | Language/framework-agnostic lessons |
| \`memory/project/\` | Project-specific patterns and gotchas |
| \`skills/\` | Reusable agent skill definitions |
| \`retrospectives/\` | Sprint and EPIC retros |
| \`team/\` | Agent profiles, onboarding docs |
EOF
git -C "$CONFLUENCE" add .
git -C "$CONFLUENCE" commit -m "chore: initialize eket confluence repo for ${PROJECT}"
echo "✓ repo-confluence initialized"

# ── repo-jira ─────────────────────────────────────────────────────
echo "→ Initializing repo-jira at $JIRA"
mkdir -p "$JIRA"/{epics,backlog,"inbox/human_feedback","inbox/agent_feedback"}
mkdir -p "$JIRA/.eket"/{heartbeat,mailbox,"queue/task-events","queue/review-requests","queue/ci-results"}
init_git_repo "$JIRA"
find "$JIRA" -type d -empty -exec touch {}/.gitkeep \;

cat > "$JIRA/.eket/config.yml" << EOF
eket_version: "1.0"

repos:
  confluence:
    local_path: ${CONFLUENCE}
    remote_url: git@github.com:${ORG}/${PROJECT}-confluence.git
    default_branch: main
  jira:
    local_path: ${JIRA}
    remote_url: git@github.com:${ORG}/${PROJECT}-jira.git
    default_branch: main
  code:
    local_path: ${CODE}
    remote_url: git@github.com:${ORG}/${PROJECT}-code.git
    default_branch: main
    protected_branches:
      - main
      - release/*

agents:
  heartbeat_interval_seconds: 30
  heartbeat_stale_threshold_seconds: 90
  mailbox_poll_interval_seconds: 5

queue:
  backend: file
  redis_url: ~

logging:
  level: info
  format: json
EOF

git -C "$JIRA" add .
git -C "$JIRA" commit -m "chore: initialize eket jira repo for ${PROJECT}"
echo "✓ repo-jira initialized"

# ── repo-code ─────────────────────────────────────────────────────
echo "→ Initializing repo-code at $CODE"
mkdir -p "$CODE"/{src,tests,.github/workflows}
init_git_repo "$CODE"
find "$CODE" -type d -empty -exec touch {}/.gitkeep \;
cat > "$CODE/README.md" << "EOF"
# Code Repository

Source code deliverables. All changes arrive via feature branches and PR.
Branch naming: `feature/<TICKET-ID>-<short-description>`
EOF
git -C "$CODE" add .
git -C "$CODE" commit -m "chore: initialize eket code repo for ${PROJECT}"
echo "✓ repo-code initialized"

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " EKET Three-Repo Setup Complete"
echo "════════════════════════════════════════════"
echo " confluence : $CONFLUENCE"
echo " jira       : $JIRA"
echo " code       : $CODE"
echo " config     : $JIRA/.eket/config.yml"
echo ""
echo "Next steps:"
echo " 1. Push each repo to its remote (git -C <path> remote add origin <url> && git push)"
echo " 2. Create Master IDENTITY.md at $JIRA/.eket/IDENTITY.md"
echo " 3. Run: node dist/index.js system:doctor"
```

---

## 5. How Agents Reference Cross-Repo Resources

Agents never hard-code paths. They always resolve via `config.yml`:

```typescript
// Node.js example
import { readConfig } from './config/app-config.js';

const config = readConfig(); // reads repo-jira/.eket/config.yml
const ticketPath = `${config.repos.jira.local_path}/epics/EPIC-007/tickets/TICKET-042.md`;
const confluencePath = `${config.repos.confluence.local_path}/memory/project/auth-patterns.md`;
const prBranch = `${config.repos.code.local_path}`; // git operations target here
```

```bash
# Bash example
CONFIG="$JIRA_ROOT/.eket/config.yml"
CONFLUENCE_ROOT=$(grep 'local_path' "$CONFIG" | head -1 | awk '{print $2}')
CODE_ROOT=$(grep 'local_path' "$CONFIG" | tail -1 | awk '{print $2}')
```

---

## 6. Recommended Permissions Matrix

| Repo | Master (AI/human) | Slaver (AI) | Slaver (human) | CI bot |
|------|:-----------------:|:-----------:|:--------------:|:------:|
| `repo-confluence` | read+write | read+write | read+write | read |
| `repo-jira` | read+write | read+write | read+write | read |
| `repo-code` main | read+merge | — (PR only) | — (PR only) | — |
| `repo-code` feature/* | read+write | read+write | read+write | read+write |

Set branch protection on `repo-code/main`:
- Require pull request before merging
- Require status checks: CI must pass
- Restrict who can push directly: only the Master bot token

---

## 7. Multi-Environment Example

For teams running dev/staging/prod, create separate workspace roots:

```
~/eket-workspace/
├── myproject-dev/
│   ├── repo-confluence/   # shared (symlink or same remote, different branch)
│   ├── repo-jira/
│   └── repo-code/         # branch: develop
├── myproject-staging/
│   ├── repo-confluence/
│   ├── repo-jira/
│   └── repo-code/         # branch: release/1.2
└── myproject-prod/
    ├── repo-confluence/
    ├── repo-jira/
    └── repo-code/         # branch: main
```

Each environment has its own `config.yml` with the appropriate `local_path` and branch settings. Agents are initialized with the environment-specific `IDENTITY.md`.

---

## 8. Verify Setup

```bash
# Verify all three repos are healthy
node dist/index.js system:doctor

# Expected output:
# ✓ repo-confluence reachable at /path/repo-confluence
# ✓ repo-jira reachable at /path/repo-jira
# ✓ repo-code reachable at /path/repo-code
# ✓ .eket/config.yml valid
# ✓ .eket/mailbox/ writable
# ✓ .eket/heartbeat/ writable
# ✓ Queue backend: file (no Redis configured)
# System healthy. Ready to initialize agents.
```

If `system:doctor` is not available yet (Shell mode), run:

```bash
bash scripts/check-three-repos.sh \
  --jira /Users/you/eket-workspace/myproject/repo-jira
```
