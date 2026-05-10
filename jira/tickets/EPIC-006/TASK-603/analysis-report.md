# 任务分析报告：TASK-603

**Slaver**: slaver-backend-004  
**分析时间**: 2026-05-10 00:00  
**预计工时**: 3 小时

---

## 1. 需求理解

### 核心目标

在 400 错误发生时：
1. **持久化日志** — 追加到 `.eket/logs/context-overflow.log`
2. **调试快照** — 保存到 `.eket/debug/session-<id>-overflow.json`（metadata only）
3. **查看命令** — 实现 `eket logs:context-overflow`（统计 + 最近 10 条）
4. **目录自动创建** — `mkdir -p` 自动创建日志/调试目录

### 验收标准

| AC | 描述 | 自动化命令 |
|----|------|-----------|
| AC-1 | 日志格式 | `tail -1 .eket/logs/context-overflow.log \| grep 'sessionId='` |
| AC-2 | 快照结构 | `jq '.sessionId' .eket/debug/session-*-overflow.json` |
| AC-3 | 目录自动创建 | `[ -d .eket/logs ] && [ -d .eket/debug ] && echo OK` |
| AC-4 | 查看命令 | `node dist/index.js logs:context-overflow \| grep '总错误次数'` |
| AC-5 | 快照大小限制 | `stat -f%z .eket/debug/session-*.json \| awk '{if($1>10485760)exit 1}'` |

---

## 2. 技术方案

### 方案选择：扩展现有 recovery-logger.ts

**理由**：
- TASK-601 已实现 `logContextOverflow()` + `saveTaskContext()`
- TASK-603 是自然延伸（新增 session snapshot + 查看命令）
- 避免创建重复模块（保持 DRY 原则）

### 核心变更

#### 2.1 扩展 recovery-logger.ts

**新增函数**：
```typescript
export async function saveSessionSnapshot(
  sessionId: string,
  estimatedTokens: number,
  messages: Array<{role: string; content?: any; tool_name?: string}>
): Promise<void>
```

**实现要点**：
- 仅保存最后 20 条消息的 metadata（role + contentLength + tool_name）
- 提取 tool call sequence（所有 role=tool 的 tool_name）
- 文件路径：`.eket/debug/session-{sessionId}-overflow.json`
- 大小检查：JSON 序列化后 > 10MB → 截断 messages 数组

**类型定义**：
```typescript
interface SessionSnapshot {
  sessionId: string;
  timestamp: string;
  estimatedTokens: number;
  lastMessages: Array<{
    role: string;
    contentLength: number;
    toolName?: string;
  }>;
  toolCallSequence: string[];
}
```

#### 2.2 新增 logs.ts 命令

**文件位置**：`node/src/commands/logs.ts`

**子命令**：
```bash
eket logs:context-overflow  # 解析日志，展示统计
```

**输出格式**：
```
📊 Context Overflow Statistics

总错误次数: 12
恢复成功: 10 (83.3%)
恢复失败: 2

📝 最近 10 条记录:
[2026-05-10T10:00:00Z] sessionId=abc123, taskId=TASK-601, error_type=context_length_exceeded, recovery=compact_retry, result=recovered
...
```

**实现逻辑**：
1. 读取 `.eket/logs/context-overflow.log`
2. 按行解析（regex 提取 result 字段）
3. 统计 recovered vs failed 数量
4. 展示最后 10 行原始日志

#### 2.3 注册到 CLI

**修改文件**：`node/src/index.ts`

**新增代码**：
```typescript
import { registerLogs } from './commands/logs.js';

// 在 program.parse() 前添加
registerLogs(program);
```

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|---------|---------|------|
| `node/src/core/recovery-logger.ts` | 中 | 新增 1 个函数（saveSessionSnapshot） |
| `node/src/commands/` | 低 | 新增 1 个文件（logs.ts） |
| `node/src/index.ts` | 低 | 1 行导入 + 1 行注册 |
| `.eket/logs/` | 低 | 新增目录（仅日志文件） |
| `.eket/debug/` | 低 | 新增目录（仅调试文件） |

**总变更文件数**：3 个（recovery-logger.ts + logs.ts + index.ts）

---

## 4. 任务拆解

| 子任务 | 预估工时 | 优先级 |
|--------|---------|-------|
| 1. 扩展 recovery-logger.ts（新增 saveSessionSnapshot） | 1h | P0 |
| 2. 实现 logs.ts 命令（logs:context-overflow） | 1h | P0 |
| 3. 注册命令到 CLI（index.ts） | 0.25h | P0 |
| 4. 编写单元测试（tests/core/context-logger.test.ts） | 0.5h | P0 |
| 5. 手动测试 + AC 验证 | 0.25h | P0 |

**总工时**：3h（符合 ticket 预估）

---

## 5. 风险评估

| 风险项 | 可能性 | 影响 | 缓解措施 |
|-------|-------|------|---------|
| 快照文件过大（> 10MB） | 中 | 低 | 先计算 JSON.stringify 长度，超过阈值截断 messages |
| 日志文件不存在时命令报错 | 高 | 低 | logs:context-overflow 先检查文件存在，不存在则友好提示 |
| sessionId 未提供（undefined） | 中 | 低 | 使用 fallback 值 'unknown' + 写警告日志 |
| 现有 recovery-logger.ts 缺少 export | 低 | 中 | 检查现有导出，确认 logContextOverflow 已 export |

---

## 6. 技术决策

### Q1: 为什么扩展现有文件而非新建 context-logger.ts？

**答**：
- TASK-601 已创建 recovery-logger.ts，包含 `logContextOverflow()`
- 新增功能是自然延伸（同一领域：400 错误日志）
- 避免模块碎片化（1 个模块 vs 2 个模块）

### Q2: 为什么只保存最后 20 条消息？

**答**：
- 参考 ticket 方案建议（last_20_messages）
- 足够用于调试（观察错误前的操作序列）
- 控制快照文件大小（< 10MB 约束）

### Q3: 为什么 logs:context-overflow 不做更复杂的分析（如按时间段过滤）？

**答**：
- 当前阶段目标是 MVP（最小可行产品）
- 验收标准只要求基础统计 + 最近 10 条
- 后续可迭代增强（如 `logs:context-overflow --since 2026-05-01`）

---

## 7. 依赖确认

### TASK-601 依赖检查

✅ **已满足** — TASK-601 已完成（recovery-logger.ts 已存在）

### 环境依赖

- Node.js 18+ （已满足）
- TypeScript 5.x （已满足）
- fs/promises （Node.js 内置）

---

## 8. 下一步

**等待 Master 批准** → 进入实施阶段

批准后立即执行：
1. 修改 recovery-logger.ts
2. 创建 logs.ts
3. 注册命令
4. 编写测试
5. 提交 PR

---

**分析报告完成时间**: 2026-05-10 00:15  
**等待 Master 决策**: 批准 / 驳回 / 需升级
