# Context Alert System

## Overview

Context Alert System automatically monitors context token usage and alerts Master when approaching limits (150K+ tokens). Prevents context overflow by triggering timely intervention.

## Architecture

```
┌─────────────────────┐
│ ContextEstimator    │
│   estimate()        │───> 150K+ tokens detected
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│  ContextAlert       │
│   alertMaster()     │───> Creates .eket/inbox/context-risk-TASK-XXX.md
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Master Polling      │
│ Reads inbox/*.md    │───> Takes action (compact/archive/split)
└─────────────────────┘
```

## Usage

### Basic Usage

```typescript
import { ContextEstimator } from './core/context-estimator.js';

// Create estimator with taskId for alerting
const estimator = new ContextEstimator('TASK-634');

// Estimate tokens and auto-alert if > 150K
const result = await estimator.estimate();

console.log(`Tokens: ${result.tokens}`);
console.log(`Method: ${result.method}`); // 'rough' or 'precise'
console.log(`Alerted: ${result.alerted}`); // true if alert was sent
```

### Without Alerting

```typescript
// Omit taskId to disable alerting
const estimator = new ContextEstimator();
const result = await estimator.estimate();
// result.alerted will be false
```

## Alert File Format

When triggered, creates `.eket/inbox/context-risk-TASK-XXX.md`:

```markdown
# Context Risk Alert: TASK-634

**Tokens**: 152,000
**Turn Count**: N/A
**Timestamp**: 2026-05-13T10:30:00Z

## Recommendation

Context approaching token limit (150,000+).

**Suggested Actions**:
1. **Compact memory** - Run context compression on old tickets
2. **Archive old tickets** - Move completed tickets to archive/
3. **Split task** - If multi-stage, break into subtasks
4. **Review active context** - Check .eket/ACTIVE_CONTEXT.md for bloat

**Automation**:
\`\`\`bash
# Quick compaction
node dist/index.js memory:compact

# Archive completed tickets
node dist/index.js ticket:archive --status=done

# Check context breakdown
node dist/index.js context:analyze
\`\`\`
```

## Deduplication

Alerts are deduplicated per task using `.eket/state/alerted-tasks.json`:

```json
[
  {
    "taskId": "TASK-634",
    "alertedAt": "2026-05-13T10:30:00.000Z"
  }
]
```

Subsequent alerts for the same task are skipped to avoid spam.

## Master Polling

Master should poll `.eket/inbox/` for alert files:

```bash
# Check for new alerts
ls -t .eket/inbox/context-risk-*.md | head -5

# Read alert
cat .eket/inbox/context-risk-TASK-634.md

# Take action based on recommendation
node dist/index.js memory:compact
```

## Testing

### Unit Tests

```bash
npm test -- context-alert.test.ts
```

Tests cover:
- ✅ Skip alert when tokens < 150K
- ✅ Create alert when tokens > 150K
- ✅ Deduplicate same-task alerts
- ✅ Record alert in state file
- ✅ Handle missing turnCount
- ✅ Create directories if missing
- ✅ Clear alert history

### Integration Tests

```bash
npm test -- context-estimator-alert.test.ts
```

Tests cover:
- ✅ No alert below threshold
- ✅ Alert triggered above threshold
- ✅ No alert when taskId omitted
- ✅ Deduplication across estimates
- ✅ Result format verification

## Performance

- **Rough estimate**: <10ms (file stat only)
- **Precise estimate**: 50-500ms (depends on file count)
- **Alert creation**: <5ms (file write + JSON update)

## Configuration

Alert threshold is hardcoded to `150,000` tokens. Modify `ContextAlert.ALERT_THRESHOLD` if needed.

## Files

| File | Purpose |
|------|---------|
| `node/src/core/context-alert.ts` | Alert system implementation |
| `node/src/core/context-estimator.ts` | Integration with estimator |
| `node/tests/context-alert.test.ts` | Unit tests |
| `node/tests/integration/context-estimator-alert.test.ts` | Integration tests |
| `.eket/inbox/context-risk-*.md` | Alert files (created at runtime) |
| `.eket/state/alerted-tasks.json` | Deduplication state |

## Troubleshooting

### Alert not triggering

- Check taskId is provided to `ContextEstimator` constructor
- Verify tokens exceed 150K threshold
- Check if task was already alerted (see `.eket/state/alerted-tasks.json`)

### Duplicate alerts

- System should auto-deduplicate
- If duplicates occur, check state file integrity
- Use `ContextAlert.clearAlertHistory(taskId)` to reset

### Missing alert files

- Check `.eket/inbox/` directory exists
- Verify write permissions
- Check logs for file write errors

## Related

- TASK-632: Context Estimator (dependency)
- TASK-633: Context Monitor (consumer)
- EPIC-007: Context Management
