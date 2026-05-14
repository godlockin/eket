# EPIC-007: Context Overflow Defense System v2 - Proactive Monitoring

**状态**: 📝 Analysis  
**优先级**: P1  
**创建时间**: 2026-05-14  
**Owner**: Master  

---

## 背景

EPIC-006 构建了基础 context 防御（pre-task check、branch hook、time-box），但仍发生 **202K/168K token 溢出**崩溃：
- Playwright 12 次调用 → 120K tokens
- Log tailing → 20K tokens  
- 失败尝试累积 → 30K tokens

**根本问题**：**被动应对**（等错误后处理）而非**主动监控**（接近阈值时触发 compact）。

---

## 目标

实现 **Agent 主动 context 监控 + 自动 compact** 机制：
1. **实时估算** context token 使用量
2. **阈值触发** 自动 compact（轮次 / token 累积）
3. **紧急快照** 超限时保存状态防止丢失
4. **Hook 集成** 对 Slaver 透明（零配置）

---

## 验收标准

**AC-1**: 自动提示 compact  
- Given: Slaver 执行任务中
- When: 累计 10 轮 OR 估算 ≥ 50K tokens
- Then: 打印 "⚠️ Context 接近阈值" 警告

**AC-2**: 紧急快照  
- Given: Context 估算 ≥ 150K tokens
- When: Monitor 检测阈值
- Then: 保存快照到 `logs/context-snapshots/<timestamp>.json`

**AC-3**: Hook 透明集成  
- Given: 新 Slaver 启动
- When: 执行第一次 UserPromptSubmit
- Then: 监控自动启用（无需配置）

**AC-4**: 审计日志  
- Given: 任意 context 事件发生
- When: 事件触发（warn/snapshot/alert）
- Then: 写入 `logs/context-monitor.jsonl` 结构化日志  

---

## 非目标（Out of Scope）

- ❌ 直接调用 `/compact` API（Claude Code 无此能力）
- ❌ 实时 token 计数（需 Claude API，不可得）
- ❌ 跨 session 持久化监控状态

---

## Tickets

**P0 - 核心监控**（6h）:
- TASK-631: Shell Hook - 轻量级计数器（2h, devops）
- TASK-632: Node.js Estimator - 智能估算（4h, backend）

**P1 - 防护增强**（8h）:
- TASK-633: Snapshot Generator - 增量快照（3h, backend）
- TASK-634: Master Alert - 风险上报（2h, fullstack）
- TASK-635: Integration Tests - E2E 验证（3h, qa）

**P2 - Rust 性能优化**（9h）:
- TASK-636: Rust Context Monitor - 高性能二进制（6h, backend）
- TASK-637: Rust CI Pipeline - 跨平台编译（3h, devops）

**依赖关系**:
```
TASK-631 (Shell Hook)
  └─> TASK-632 (Node Estimator)
        ├─> TASK-633 (Snapshot)
        ├─> TASK-634 (Alert)
        ├─> TASK-635 (Tests) [blocked by all]
        └─> TASK-636 (Rust) [需 Node 基准]
              └─> TASK-637 (Rust CI)
```

**总预估**: 23h（P0+P1: 14h, P2: 9h）  
**关键路径**: TASK-631 → TASK-632 → TASK-636 → TASK-637（15h）  
**最小可用**: P0+P1（14h）完成即可上线

---

**Last Updated**: 2026-05-14  
**Created By**: Master
