#!/usr/bin/env bash
# check-skill-anatomy.sh — Skill 文件解剖结构校验
#
# 用法:
#   bash scripts/check-skill-anatomy.sh [--minimal] [--verbose] <file>...
#   bash scripts/check-skill-anatomy.sh --self-test
#
# 完整模式（默认）: 校验 7 节有序 + frontmatter + Verification 内容
# --minimal 模式: 仅校验后 3 节有序 + Verification 内容（跳过 frontmatter）
# --verbose: 打印逐条规则 PASS/FAIL
# --self-test: 运行 tests/fixtures/anatomy/ 内置 fixtures，报告 N/M PASS
#
# 退出码:
#   0   全部通过
#   1   anatomy 违规
#   2   脚本错误（无参数 / 文件不存在）

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
NC=$'\033[0m'

MINIMAL=0
VERBOSE=0
SELF_TEST=0
FILES=()

for arg in "$@"; do
  case "$arg" in
    --minimal)   MINIMAL=1 ;;
    --verbose)   VERBOSE=1 ;;
    --self-test) SELF_TEST=1 ;;
    --*)         echo "${RED}✗${NC} 未知参数: $arg" >&2; exit 2 ;;
    *)           FILES+=("$arg") ;;
  esac
done

# ── self-test ──────────────────────────────────────────────────────────────────
if (( SELF_TEST == 1 )); then
  FD="$REPO_ROOT/tests/fixtures/anatomy"
  st_pass=0; st_fail=0
  declare -a CASES_FILE CASES_ARGS CASES_EXPECT
  CASES_FILE=( good-full.md good-minimal.md bad-order.md bad-missing-section.md bad-no-checkbox.md bad-no-frontmatter.md )
  CASES_ARGS=( ""          "--minimal"     ""          ""                      ""                 "" )
  CASES_EXPECT=( 0          0              1            1                       1                  1 )
  total=${#CASES_FILE[@]}
  echo "Running self-test: $total cases"; echo ""
  i=0
  while [ $i -lt $total ]; do
    name="${CASES_FILE[$i]}"
    xargs_str="${CASES_ARGS[$i]}"
    exp="${CASES_EXPECT[$i]}"
    if [ -n "$xargs_str" ]; then
      output=$(bash "$0" $xargs_str "$FD/$name" 2>&1)
    else
      output=$(bash "$0" "$FD/$name" 2>&1)
    fi
    actual=$?
    if [ "$actual" = "$exp" ]; then
      echo "  ${GREEN}✓${NC} [$name] exit=$actual (want $exp)"
      st_pass=$((st_pass + 1))
    else
      echo "  ${RED}✗${NC} [$name] exit=$actual (want $exp)"
      echo "     output: $(printf '%s' "$output" | head -5)"
      st_fail=$((st_fail + 1))
    fi
    i=$((i + 1))
  done
  echo ""
  echo "═══ self-test 汇总 ═══"
  echo "  通过: ${GREEN}${st_pass}${NC}  失败: ${RED}${st_fail}${NC}  (${st_pass}/${total} PASS)"
  [ $st_fail -eq 0 ] && exit 0 || exit 1
fi

# ── validate args ──────────────────────────────────────────────────────────────
if [ ${#FILES[@]} -eq 0 ]; then
  echo "${RED}✗${NC} 用法: $0 [--minimal] [--verbose] <file>..." >&2
  exit 2
fi

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "${RED}✗${NC} 文件不存在: $f" >&2
    exit 2
  fi
done

# ── section order ──────────────────────────────────────────────────────────────
FULL_SECTIONS="## Overview|## When to Use|## When NOT to Use|## Process|## Common Rationalizations|## Red Flags|## Verification"
MINIMAL_SECTIONS="## Common Rationalizations|## Red Flags|## Verification"

# check_file FILE MINIMAL VERBOSE → returns 0/1, prints messages
check_file() {
  local file="$1"
  local is_minimal="$2"
  local verbose="$3"
  local fail=0
  local fname
  fname="$(basename "$file")"

  if [ "$is_minimal" = "1" ]; then
    sections="$MINIMAL_SECTIONS"
    expected_count=3
  else
    sections="$FULL_SECTIONS"
    expected_count=7
  fi

  # Build ordered array of section names
  local sec_list
  sec_list=$(printf '%s' "$sections" | tr '|' '\n')

  # State-machine: walk file line by line, match sections in order using awk
  local state_result
  state_result=$(awk -v secs="$sections" -v want="$expected_count" '
    BEGIN {
      n = split(secs, S, /\|/)
      state = 0
      fail = 0
      fail_msg = ""
    }
    /^## / {
      heading = $0
      # strip trailing whitespace
      sub(/[[:space:]]*$/, "", heading)
      if (state < n && heading == S[state+1]) {
        state++
      } else {
        # Is this heading one of our expected sections (just out of order)?
        found_at = 0
        for (k=1; k<=n; k++) {
          if (heading == S[k]) { found_at = k; break }
        }
        if (found_at > 0) {
          fail = 1
          fail_msg = "section \"" heading "\" found out of order (state=" state ", expected \"" S[state+1] "\")"
        }
        # else: unknown section heading, ignore
      }
    }
    END {
      if (fail == 1) { print "ORDER:" fail_msg; exit 1 }
      if (state != want) {
        print "MISSING:only " state "/" want " required sections found"
        exit 1
      }
      print "OK"
      exit 0
    }
  ' "$file")

  if [ "$state_result" != "OK" ]; then
    fail=1
    kind="${state_result%%:*}"
    msg="${state_result#*:}"
    if [ "$kind" = "ORDER" ]; then
      [ "$verbose" = "1" ] && echo "  ${RED}[FAIL]${NC} $fname: $msg"
    else
      [ "$verbose" = "1" ] && echo "  ${RED}[FAIL]${NC} $fname: $msg"
    fi
  else
    [ "$verbose" = "1" ] && echo "  ${GREEN}[PASS]${NC} $fname: section order OK ($expected_count/$expected_count)"
  fi

  # ── frontmatter check (full mode only) ──────────────────────────────────────
  if [ "$is_minimal" = "0" ]; then
    local fm_count
    fm_count=$(awk '
      /^---$/ { block++; next }
      block == 1 && /^(description|rationalizations_count):/ { c++ }
      block >= 2 { exit }
      END { print c+0 }
    ' "$file")
    if [ "$fm_count" -lt 2 ]; then
      fail=1
      [ "$verbose" = "1" ] && echo "  ${RED}[FAIL]${NC} $fname: frontmatter missing description or rationalizations_count (found $fm_count/2)"
    else
      [ "$verbose" = "1" ] && echo "  ${GREEN}[PASS]${NC} $fname: frontmatter OK ($fm_count/2 fields)"
    fi
  fi

  # ── Verification section content ────────────────────────────────────────────
  local ver_checkboxes ver_bash
  ver_checkboxes=$(awk '
    /^## Verification/ { in_ver=1; next }
    in_ver && /^## / { in_ver=0 }
    in_ver && /^- \[ \]/ { c++ }
    END { print c+0 }
  ' "$file")

  ver_bash=$(awk '
    /^## Verification/ { in_ver=1; next }
    in_ver && /^## / { in_ver=0 }
    in_ver && /^```bash/ { c++ }
    END { print c+0 }
  ' "$file")

  if [ "$ver_checkboxes" -lt 3 ]; then
    fail=1
    [ "$verbose" = "1" ] && echo "  ${RED}[FAIL]${NC} $fname: Verification has $ver_checkboxes checkboxes (expected ≥3)"
  else
    [ "$verbose" = "1" ] && echo "  ${GREEN}[PASS]${NC} $fname: Verification checkboxes=$ver_checkboxes (≥3)"
  fi

  if [ "$ver_bash" -lt 1 ]; then
    fail=1
    [ "$verbose" = "1" ] && echo "  ${RED}[FAIL]${NC} $fname: Verification has $ver_bash bash blocks (expected ≥1)"
  else
    [ "$verbose" = "1" ] && echo "  ${GREEN}[PASS]${NC} $fname: Verification bash blocks=$ver_bash (≥1)"
  fi

  return $fail
}

# ── main loop ──────────────────────────────────────────────────────────────────
overall_fail=0
pass_count=0
fail_count=0

for f in "${FILES[@]}"; do
  if check_file "$f" "$MINIMAL" "$VERBOSE"; then
    echo "${GREEN}✓ PASS${NC}: $(basename "$f")"
    pass_count=$((pass_count + 1))
  else
    echo "${RED}✗ FAIL${NC}: $(basename "$f")"
    fail_count=$((fail_count + 1))
    overall_fail=1
  fi
done

total=$((pass_count + fail_count))
echo ""
echo "═══ 汇总 ═══"
echo "  通过: ${GREEN}${pass_count}${NC}  失败: ${RED}${fail_count}${NC}  (${pass_count}/${total})"

exit $overall_fail
