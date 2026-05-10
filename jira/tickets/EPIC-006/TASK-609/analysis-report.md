# 任务分析报告：TASK-609

**Slaver**: slaver-backend-007
**分析时间**: 2026-05-10 21:00
**预计工时**: 3 小时

## 1. 需求理解

### 核心目标
集成 TASK-604 已实现的 ContextTracker，在 `claude-runner.ts` 中自动追踪工具输入/输出 tokens，当达到 120k 阈值时自动触发 `/compact`，失败后重试 + 告警。

### 验收标准分析
1. **AC-1**: 工具调用输出追踪 → 已有 `trackToolOutput()`，需在 `runClaude()` 末尾调用
2. **AC-2**: 120k 阈值自动 compact → 已有 `shouldCompact()` + `triggerCompact()`，需在合适位置检查
3. **AC-3**: 成功后 token 重置为 20k → 已在 `triggerCompact()` 实现
4. **AC-4**: 失败重试 + 告警 → 需新增逻辑
5. **AC-5**: 日志记录 → 需添加格式化日志

## 2. 技术方案

### 2.1 集成位置

#### 主集成点：`runClaude()` 函数（已部分完成）
当前代码：
```typescript
// Line 186-192: 已有 pre-check compact
if (contextTracker.shouldCompact(sessionId)) {
  const compacted = await contextTracker.triggerCompact(sessionId);
  if (!compacted) {
    console.warn('⚠️  Auto-compact failed, proceeding anyway...');
  }
}
```

#### 需要补充的部分
1. **输出追踪**（Line 199-200）：已有 `trackToolOutput()`，需确认位置正确
2. **失败重试逻辑**：当前只 warn，需改为重试 1 次 + 告警文件
3. **格式化日志**：需符合 AC-5 格式

#### 次要集成点：`handle400Error()`
当前未读到该函数，需搜索确认是否需要追踪错误输出。

### 2.2 实现详情

#### 修改 1：增强 `runClaude()` 中的 auto-compact 逻辑

```typescript
// BEFORE (Line 186-192): 只触发 1 次，失败只 warn
if (contextTracker.shouldCompact(sessionId)) {
  const compacted = await contextTracker.triggerCompact(sessionId);
  if (!compacted) {
    console.warn('⚠️  Auto-compact failed, proceeding anyway...');
  }
}

// AFTER: 重试 1 次 + 创建告警
if (contextTracker.shouldCompact(sessionId)) {
  const currentTokens = contextTracker.getSessionTokens(sessionId);
  
  // First attempt
  let compacted = await contextTracker.triggerCompact(sessionId);
  
  // Retry once on failure (AC-4)
  if (!compacted) {
    console.warn('[Auto-Compact] First attempt failed, retrying...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
    compacted = await contextTracker.triggerCompact(sessionId);
  }
  
  // Alert on double failure (AC-4)
  if (!compacted) {
    await createCompactFailureAlert(sessionId, currentTokens);
  } else {
    // Success log (AC-5)
    console.log(`[Auto-Compact] Session ${sessionId}: ${currentTokens} → 20k`);
  }
}
```

#### 修改 2：创建告警文件生成函数

```typescript
/**
 * Create alert file when auto-compact fails (AC-4)
 */
async function createCompactFailureAlert(sessionId: string, tokens: number): Promise<void> {
  const alertPath = path.join(
    process.cwd(),
    'inbox',
    'human_feedback',
    `[ALERT] compact-failed-${sessionId}.md`
  );
  
  const content = `# 自动 Compact 失败告警

**Session**: ${sessionId}
**Tokens**: ${tokens}
**Time**: ${new Date().toISOString()}
**Status**: FAILED (after 2 attempts)

## 影响
- Session 可能即将触发 400 overflow
- 建议手动执行 \`/compact\` 或重启 session

## 建议操作
1. 手动运行 \`/compact\`
2. 检查 Claude CLI 是否正常工作
3. 查看 \`.eket/logs/\` 中的错误日志
`;

  fs.writeFileSync(alertPath, content);
  console.error(`🚨 Alert created: ${alertPath}`);
}
```

#### 修改 3：确认输出追踪位置（AC-1）

当前 Line 199-200 已有：
```typescript
if (result.stdout) {
  contextTracker.trackToolOutput(sessionId, result.stdout);
```

**无需修改**，位置正确。

### 2.3 是否需要修改 `handle400Error()`？

需要先检查该函数是否存在，以及是否有错误输出未被追踪。

**决策**：暂不修改，因为 TASK-609 范围是"工具调用产生输出"（AC-1），错误处理属于 TASK-601 范围。

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| `claude-runner.ts` | 中 | 修改 auto-compact 逻辑（+15 行） |
| `context-tracker.ts` | 低 | 无需修改（功能已完整） |
| `inbox/human_feedback/` | 低 | 新增告警文件（失败时） |
| `.eket/logs/` | 低 | 新增格式化日志 |

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 | 说明 |
|--------|----------|--------|------|
| 1. 增强 auto-compact 逻辑 | 1h | P0 | 重试 + 日志 + 告警 |
| 2. 编写单元测试 | 1h | P0 | 覆盖 5 个 AC |
| 3. 集成测试 + 验收 | 0.5h | P0 | 手动触发验证 |
| 4. 创建 PR + 文档 | 0.5h | P1 | PR description + CHANGELOG |

**总计**: 3h

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| 重试间隔过短导致连续失败 | 低 | 中 | 设置 2s 延迟，足够 CLI 恢复 |
| 告警文件路径不存在 | 低 | 低 | 使用 `fs.mkdirSync` 确保目录存在 |
| 测试覆盖不完整 | 中 | 中 | 编写 mock `triggerCompact()` 的单元测试 |
| 日志格式与其他模块不一致 | 低 | 低 | 使用统一前缀 `[Auto-Compact]` |

## 6. 测试计划

### 6.1 单元测试（5 个测试用例）

文件：`node/tests/core/claude-runner-auto-compact.test.ts`

```typescript
describe('Auto-Compact Integration', () => {
  it('AC-1: tracks tool output after runClaude()', () => {
    // Mock execFileNoThrow → verify trackToolOutput called
  });

  it('AC-2: triggers compact when shouldCompact() returns true', () => {
    // Mock shouldCompact=true → verify triggerCompact called
  });

  it('AC-3: resets tokens to 20k on success', () => {
    // Verify sessionTokens updated to 20000 after compact
  });

  it('AC-4: retries once and creates alert on double failure', () => {
    // Mock triggerCompact fails 2x → verify alert file created
  });

  it('AC-5: logs formatted message on success', () => {
    // Capture console.log → verify "[Auto-Compact] Session X: Y → 20k"
  });
});
```

### 6.2 集成测试

手动验证：
1. 设置 sessionTokens = 121000（超过 120k）
2. 运行 `npm run build && node dist/index.js <command>`
3. 验证日志输出包含 `[Auto-Compact] Session ...`
4. 故意让 compact 失败（rename claude CLI），验证告警文件生成

## 7. 成功指标

- [ ] 5 个单元测试全部通过
- [ ] 构建成功 `npm run build`
- [ ] Lint 无错误 `npm run lint`
- [ ] 手动触发 auto-compact 成功
- [ ] 手动触发 compact 失败 → 告警文件生成
- [ ] CHANGELOG 更新
- [ ] PR description 完整

## 8. 依赖确认

- ✅ TASK-604 已合并（PR #185）
- ✅ `contextTracker` 全局单例可用
- ✅ `triggerCompact()` 返回 `boolean`
- ✅ `inbox/human_feedback/` 目录存在

## 9. 不包含范围（明确排除）

- ❌ Slaver 主动上报机制（TASK-608）
- ❌ 告警系统通用框架（TASK-607）
- ❌ 错误处理中的 token 追踪（TASK-601）
- ❌ `handle400Error()` 修改（除非发现未追踪输出）

---

**状态**: 等待 Master 批准
**下一步**: 批准后立即实现 + 测试 + PR
