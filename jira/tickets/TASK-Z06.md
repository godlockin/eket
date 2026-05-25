# TASK-Z06: commands/ 模块单元测试

**EPIC**: EPIC-014  
**状态**: pending  
**优先级**: P0  
**预估**: 2d  
**负责人**: 待分配  
**依赖**: TASK-Z05

---

## 背景

`commands/` 模块 (12,408 行) 是 CLI 核心，需要单元测试保障。

## 目标

为 `node/src/commands/` 关键命令添加单元测试。

## 范围

| 命令 | 文件 | 优先级 |
|------|------|--------|
| task:claim | task-claim.ts | P0 |
| task:complete | task-complete.ts | P0 |
| gate:review | gate-review.ts | P0 |
| knowledge:search | knowledge-search.ts | P1 |
| expert:compose | expert-compose.ts | P1 |

## 任务清单

### 1. 创建测试目录
```
node/tests/unit/commands/
├── task-claim.test.ts
├── task-complete.test.ts
├── gate-review.test.ts
├── knowledge-search.test.ts
└── expert-compose.test.ts
```

### 2. 测试策略

- Mock 文件系统操作
- Mock 外部 API 调用
- 验证命令参数解析
- 验证输出格式

### 3. 边界情况

- 无效参数
- 文件不存在
- 权限不足
- 网络超时

## 验收标准

- [ ] `find node/tests/unit/commands -name "*.ts" | wc -l` >= 5
- [ ] 每个文件至少 5 个测试用例
- [ ] `npm test -- --testPathPattern=unit/commands` 全部通过

## 依赖

- TASK-Z05 (参考测试模式)
- 被 TASK-Z08 依赖

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-25 | 创建 Ticket | Master |
