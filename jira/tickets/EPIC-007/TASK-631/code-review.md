# TASK-631 Code Review Comments

**Reviewer**: Master  
**Review Date**: 2026-05-14  
**Overall Rating**: ⭐⭐⭐⭐ Good (3 changes requested)

---

## 🔴 Critical: Fix Turn Threshold

**File**: `.claude/hooks/UserPromptSubmit.sh:13`  
**Current**:
```bash
CONTEXT_THRESHOLD=8
```

**Required**:
```bash
CONTEXT_THRESHOLD=10  # AC-3: 10 turns threshold
```

**Rationale**: Ticket AC-3 specifies "10轮 OR 50K tokens", not 8 turns.

---

## 🟡 Medium: Token Estimation Coefficient

**File**: `.claude/hooks/UserPromptSubmit.sh:49`  
**Current**:
```bash
TOTAL_TOKENS=$((FILE_SIZE * 4 / 10))  # 0.4 tokens per char
```

**Recommended**:
```bash
TOTAL_TOKENS=$((FILE_SIZE * 3 / 10))  # 0.3 tokens per char (from analysis)
```

**Rationale**: Analysis report specified 0.3 coefficient. Current 0.4 inflates estimates by 33%.

**Alternative**: Keep 0.4 but document as "conservative estimate" (acceptable if intentional).

---

## 🟢 Minor: Add Token Threshold Check

**File**: `.claude/hooks/UserPromptSubmit.sh:54`  
**Current**:
```bash
if [[ "${NEW_COUNT}" -ge "${CONTEXT_THRESHOLD}" ]]; then
```

**Suggested**:
```bash
TOKEN_THRESHOLD=50000  # AC-3: 50K tokens threshold

if [[ "${NEW_COUNT}" -ge "${CONTEXT_THRESHOLD}" ]] || [[ "${TOTAL_TOKENS}" -ge "${TOKEN_THRESHOLD}" ]]; then
```

**Rationale**: AC-3 requires "10 turns **OR** 50K tokens" (boolean OR, not just turn count).

---

## ✅ Approved Items

1. ✅ Error tolerance (`set +e`, `exit 0`)
2. ✅ .gitignore exclusions (node_modules/.git/dist)
3. ✅ Counter logic (atomic increment with validation)
4. ✅ Shellcheck clean
5. ✅ AC-4 deferral (TODO comment clear)
6. ✅ Test coverage (counter + warning)

---

## Decision

**Status**: 🔄 **Changes Requested** (3 items)

**Priority**:
- 🔴 Critical: MUST fix (threshold=10)
- 🟡 Medium: SHOULD fix (0.3 coefficient OR document 0.4 choice)
- 🟢 Minor: COULD add (token threshold check)

**Recommendation**: Fix Critical + Medium, then re-submit. Minor can be deferred to future iteration.

---

## Next Steps

1. Fix threshold: `CONTEXT_THRESHOLD=10`
2. Fix coefficient: `0.3` (or document why `0.4`)
3. Optional: Add token threshold check
4. Amend commit OR create new commit
5. Update PR.md with changes
6. Notify Master for re-review

**Estimated Fix Time**: 15 minutes

---

**Review Completed**: 2026-05-14 02:10
