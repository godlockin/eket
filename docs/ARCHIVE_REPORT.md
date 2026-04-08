# Documentation Archive Report

**Date**: 2026-04-07
**Action**: Archived outdated v0.x documentation
**Reason**: Project upgraded to v2.1.0, v0.x documents no longer relevant

---

## Archived Documents

### v0.x Implementation Documents (9 files)

Moved to `docs/archive/v0.x/`:

1. **CHANGELOG_v0.2.md** - Outdated changelog from v0.2
2. **v0.5-implementation-review.md** - v0.5 implementation review
3. **v0.5.1-framework-risk-review.md** - v0.5.1 risk assessment (duplicate)
4. **v0.5-framework-risk-review.md** - v0.5 risk assessment
5. **REPAIR_PLAN_v0.6.1.md** - v0.6.1 repair plan
6. **v0.5.1-implementation-summary.md** - v0.5.1 implementation summary
7. **v0.6-docker-heartbeat.md** - v0.6 Docker and heartbeat documentation
8. **IMPLEMENTATION-v0.6.2.md** - v0.6.2 implementation notes
9. **COMPLETE_FRAMEWORK_v0.2.md** - v0.2 complete framework guide

### v0.x Plan Documents (1 file)

Moved to `docs/archive/plans/`:

1. **v0.9.1-improvement-plan.md** - v0.9.1 improvement plan

---

## Archive Structure

```
docs/archive/
├── v0.x/                      # Outdated v0.x implementation documents
│   ├── CHANGELOG_v0.2.md
│   ├── v0.5-implementation-review.md
│   ├── v0.5.1-framework-risk-review.md
│   ├── v0.5-framework-risk-review.md
│   ├── REPAIR_PLAN_v0.6.1.md
│   ├── v0.5.1-implementation-summary.md
│   ├── v0.6-docker-heartbeat.md
│   ├── IMPLEMENTATION-v0.6.2.md
│   └── COMPLETE_FRAMEWORK_v0.2.md
└── plans/                     # Outdated planning documents
    └── v0.9.1-improvement-plan.md
```

---

## Rationale

These documents were archived because:

1. **Version Obsolescence**: All v0.x documentation superseded by v2.0+ implementation
2. **Architectural Changes**: EKET Framework underwent major redesign in v2.0
   - Three-repo architecture introduced
   - HTTP Server (Phase B) replaced legacy implementation
   - SDK-based integration model
3. **Duplicate Content**: Multiple v0.5 risk reviews consolidated
4. **Historical Reference Only**: Kept for historical context but not actively maintained

---

## Current Documentation Structure

After archiving, active documentation includes:

### Core Documentation (v2.1.0)
- `README.md` - Main project documentation
- `QUICKSTART.md` - Quick start guide
- `CLAUDE.md` - Claude Code instructions

### Protocol Documentation
- `docs/protocol/EKET_PROTOCOL_V1.md` - Protocol specification
- `docs/protocol/HTTP_API.md` - HTTP API reference
- `docs/protocol/openapi.yaml` - OpenAPI 3.0 spec

### Implementation Guides
- `docs/guides/http-server-setup.md` - HTTP Server deployment
- `docs/guides/sdk-usage.md` - SDK usage examples
- `docs/api/README.md` - API documentation

### Test Reports
- `docs/test-reports/2026-04-07-http-server-test-report.md` - Latest test results

### Plans (Active)
- `docs/plans/2026-04-06-optimization-loop-design.md` - Current optimization plan
- `docs/plans/2026-04-07-phase-b-http-server.md` - Phase B plan
- `docs/plans/2026-04-07-phase-b-completed.md` - Phase B completion summary

---

## Access Archived Documents

Archived documents remain accessible at `docs/archive/` but are not linked from active documentation.

To restore a document:
```bash
mv docs/archive/v0.x/<filename>.md docs/05-reference/
```

---

## Next Steps

1. ✅ Update main README.md to reference v2.1.0
2. ✅ Update QUICKSTART.md with HTTP Server usage
3. ✅ Create missing API documentation
4. ⏳ Update docs/README.md index
5. ⏳ Fix broken links in remaining documents

---

**Archived By**: Agent 5 (Documentation Review)
**Review Basis**: `docs/DOCUMENTATION_REVIEW_CHECKLIST.md`
