#!/usr/bin/env bash
# audit-writes.sh — static scanner for forbidden writes to shared state roots.
#
# Forbidden target roots:
#   jira/  inbox/  outbox/  shared/  .eket/state/
#
# Scan scope:
#   scripts/**/*.sh, lib/**/*.sh   (except lib/state/ itself)
#   node/src/**/*.ts               (except node/src/core/state/ and tests)
#
# Escape hatch:
#   same line contains '# allow: shared-fs-write'  (shell)
#   same line contains '// allow: shared-fs-write' (ts)
#
# Exit: 0 = clean, 1 = violations found.
# Flags:
#   --fix-hint   print migration suggestion per violation

set -euo pipefail
IFS=$'\n\t'

EKET_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$EKET_ROOT"

FIX_HINT=0
for arg in "${@:-}"; do
  case "${arg:-}" in
    --fix-hint) FIX_HINT=1 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
  esac
done

VIOL_FILE="$(mktemp)"
trap 'rm -f "$VIOL_FILE"' EXIT

# -----------------------------------------------------------------------------
# Shell scan
# -----------------------------------------------------------------------------

# Pattern 1: `> "jira/...` or `>> "shared/...` (includes cat/echo/printf/etc.)
SHELL_REDIR_RE='>[[:space:]]*"?(jira|inbox|outbox|shared|\.eket/state)/'

# Pattern 2: `tee ... jira/...`
SHELL_TEE_RE='tee[[:space:]][^|]*(jira|inbox|outbox|shared|\.eket/state)/'

scan_shell() {
  local pattern_name="$1" pattern="$2"
  local matches
  matches="$(grep -rnE "$pattern" scripts lib --include='*.sh' 2>/dev/null || true)"
  [ -z "$matches" ] && return 0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file rest lineno snippet
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    snippet="${rest#*:}"
    # exemptions
    case "$file" in
      lib/state/*) continue ;;
      scripts/audit-writes.sh) continue ;;
    esac
    case "$snippet" in
      *"# allow: shared-fs-write"*) continue ;;
    esac
    # strip leading whitespace from snippet for readability
    snippet="${snippet#"${snippet%%[![:space:]]*}"}"
    printf '%s:%s: pattern=%s | %s\n' \
      "$file" "$lineno" "$pattern_name" "$snippet" >> "$VIOL_FILE"
  done <<< "$matches"
}

scan_shell "shell-redirect" "$SHELL_REDIR_RE"
scan_shell "shell-tee"      "$SHELL_TEE_RE"

# -----------------------------------------------------------------------------
# TypeScript scan
# -----------------------------------------------------------------------------

# fs.writeFile / fs.appendFile / fs.outputFile (+Sync) where the first arg
# string literal begins with (or contains) a forbidden segment.
# Matches three quote styles: ' " `
TS_FS_RE="fs\.(append|write|output)File(Sync)?[[:space:]]*\([[:space:]]*['\"\`][^'\"\`]*(jira|inbox|outbox|shared|\.eket/state)"

# Bare named import: writeFile(... 'jira/...') — catches `import { writeFile } from 'fs/promises'` usage
TS_BARE_RE="(^|[^A-Za-z0-9_.])(append|write|output)File(Sync)?[[:space:]]*\([[:space:]]*['\"\`][^'\"\`]*(jira|inbox|outbox|shared|\.eket/state)"

scan_ts() {
  local pattern_name="$1" pattern="$2"
  local matches
  matches="$(grep -rnE "$pattern" node/src --include='*.ts' 2>/dev/null || true)"
  [ -z "$matches" ] && return 0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    local file rest lineno snippet
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    snippet="${rest#*:}"
    case "$file" in
      node/src/core/state/*) continue ;;
      node/src/skills/*) continue ;;
      node/tests/*) continue ;;
      *.test.ts|*.spec.ts) continue ;;
    esac
    case "$snippet" in
      *"// allow: shared-fs-write"*) continue ;;
    esac
    snippet="${snippet#"${snippet%%[![:space:]]*}"}"
    printf '%s:%s: pattern=%s | %s\n' \
      "$file" "$lineno" "$pattern_name" "$snippet" >> "$VIOL_FILE"
  done <<< "$matches"
}

scan_ts "ts-fs-write"   "$TS_FS_RE"
scan_ts "ts-bare-write" "$TS_BARE_RE"

# Deduplicate (same file:line may match multiple patterns)
if [ -s "$VIOL_FILE" ]; then
  sort -u "$VIOL_FILE" -o "$VIOL_FILE"
fi

TOTAL=0
if [ -s "$VIOL_FILE" ]; then
  TOTAL=$(wc -l < "$VIOL_FILE" | tr -d ' ')
fi

if [ "$TOTAL" -eq 0 ]; then
  echo "✅ audit-writes: no forbidden shared-fs writes found."
  exit 0
fi

echo "❌ audit-writes: found $TOTAL forbidden shared-fs write(s)."
echo

current_file=""
while IFS= read -r v; do
  vfile="${v%%:*}"
  if [ "$vfile" != "$current_file" ]; then
    [ -n "$current_file" ] && echo
    echo "── $vfile ──"
    current_file="$vfile"
  fi
  echo "  ${v#*:}"
  if [ "$FIX_HINT" -eq 1 ]; then
    echo "    ↳ fix: migrate to node/src/core/state/writer.ts"
    echo "       TS    → writeTicket / transitionTicket / updateHeartbeat"
    echo "       Shell → source lib/state/*.sh helpers (write_ticket, transition_ticket, update_heartbeat)"
    echo "       Escape hatch (only with reviewer sign-off): append '# allow: shared-fs-write' or '// allow: shared-fs-write'"
  fi
done < "$VIOL_FILE"

echo
echo "TOTAL: $TOTAL violation(s)"
echo "Top offenders:"
awk -F: '{print $1}' "$VIOL_FILE" | sort | uniq -c | sort -rn | head -5 | sed 's/^/  /'

exit 1
