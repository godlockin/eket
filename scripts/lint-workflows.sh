#!/usr/bin/env bash
# 本地快速校验 .github/workflows/*.yml — YAML parse + duplicate step 检查
# 用法：bash scripts/lint-workflows.sh [file1.yml file2.yml ...]
#       无参数时校验所有 workflow
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

files=("$@")
if [[ ${#files[@]} -eq 0 ]]; then
  # 读所有
  while IFS= read -r f; do files+=("$f"); done < <(ls .github/workflows/*.yml 2>/dev/null || true)
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "lint-workflows: 无 workflow 文件可校验"
  exit 0
fi

python3 - "${files[@]}" <<'PY'
import sys, yaml, pathlib
errs = []
for arg in sys.argv[1:]:
    p = pathlib.Path(arg)
    if not p.exists():
        continue
    try:
        with open(p) as f:
            d = yaml.safe_load(f)
    except Exception as e:
        errs.append(f"{p}: yaml parse failed: {e}")
        continue
    jobs = (d or {}).get('jobs', {}) or {}
    for jname, jdef in jobs.items():
        steps = (jdef or {}).get('steps', []) or []
        names = [s.get('name') or s.get('uses') or '?' for s in steps]
        dupes = [n for n in names if names.count(n) > 1 and n != '?']
        if dupes:
            errs.append(f"{p} job={jname}: duplicate step names {sorted(set(dupes))}")
if errs:
    print("workflow lint FAIL:")
    for e in errs:
        print(f"  ✗ {e}")
    sys.exit(1)
print(f"workflow lint OK: {len(sys.argv)-1} file(s)")
PY
