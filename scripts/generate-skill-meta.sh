#!/usr/bin/env bash
# scripts/generate-skill-meta.sh
# TASK-103a: Detect .ts skill files missing a corresponding skill.json
# Does NOT auto-generate (prevents overwriting hand-edited metadata).
# Usage: bash scripts/generate-skill-meta.sh

set -euo pipefail

SKILLS_DIR="$(cd "$(dirname "$0")/.." && pwd)/node/src/skills"
EXCLUDE_FILES=("index.ts" "registry.ts" "loader.ts" "types.ts" "auto-registry.ts" "unified-interface.ts")
EXCLUDE_DIRS=("adapters")

warn=0

for domain_path in "$SKILLS_DIR"/*/; do
  domain=$(basename "$domain_path")

  # Skip excluded directories
  skip=0
  for excl in "${EXCLUDE_DIRS[@]}"; do
    [[ "$domain" == "$excl" ]] && skip=1 && break
  done
  [[ "$skip" -eq 1 ]] && continue

  for ts_file in "$domain_path"*.ts; do
    [[ -f "$ts_file" ]] || continue
    fname=$(basename "$ts_file")

    # Skip excluded files
    skip=0
    for excl in "${EXCLUDE_FILES[@]}"; do
      [[ "$fname" == "$excl" ]] && skip=1 && break
    done
    [[ "$skip" -eq 1 ]] && continue

    skill_name="${fname%.ts}"
    json_file="$domain_path${skill_name}.json"

    if [[ ! -f "$json_file" ]]; then
      echo "⚠️  MISSING skill.json: ${domain}/${skill_name}.json" >&2
      warn=$((warn + 1))
    fi
  done
done

if [[ "$warn" -eq 0 ]]; then
  echo "✅ All skill .ts files have corresponding skill.json metadata."
else
  echo "" >&2
  echo "❌ $warn skill(s) missing skill.json. Create them manually to preserve hand-edits." >&2
  exit 1
fi
