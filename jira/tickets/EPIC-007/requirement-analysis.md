# Requirement Analysis: EPIC-007

## 1. 原始诉求（原文引用）

> eket 做事的时候尝试做context窗口监控，每x轮/累计y个token之后，尝试做一次 /compact
> 
> 还是会遇到超过限额，为什么？
> 比如这个任务报错：
> Called plugin:playwright:playwright 9 times
> Called plugin:playwright:playwright 3 times
> API Error: 400 {"error":{"message":"prompt token count of 202630 exceeds the limit of 168000","code":"model_max_prompt_tokens_exceeded"}}

---

## 2. 受益人 × 场景矩阵

| Persona | 触发场景 | 当前痛点（证据） | 期望结果 |
|---------|---------|-----------------|---------|
| Slaver Agent | 执行长任务（6h+ ticket） | Playwright 12次调用 → 120K tokens → 崩溃 | 自动监控，提前警告/compact |
| Master Agent | 派发复杂 EPIC | 等待 Slaver 完成时无法感知 context 风险 | 收到 Slaver 主动上报 |
| Human User | Slaver 崩溃后需恢复 | 丢失最后 30min 工作，重新分析上下文 | 自动快照，可快速恢复 |
| Framework | 任何 Agent 会话 | 被动等错误（202K/168K）而非主动防御 | 接近阈值时触发 compact |

---

## 3. 验收标准（Given-When-Then）

**AC-1**: Slaver 主动监控
- **Given**: Slaver 正在执行 TASK-XXX
- **When**: 累计 10 轮对话 OR 估算 context ≥ 50K tokens
- **Then**: 自动打印警告 "⚠️ Context 接近阈值，建议 /compact"

**AC-2**: 紧急快照
- **Given**: Context 估算 ≥ 150K tokens
- **When**: Slaver 检测到阈值
- **Then**: 自动保存 snapshot 到 `logs/context-snapshots/<timestamp>.json`

**AC-3**: Hook 透明集成
- **Given**: 新 Slaver 启动
- **When**: 执行第一条 UserPromptSubmit
- **Then**: 监控自动启用（无需配置）

**AC-4**: 审计日志
- **Given**: 任意 context 事件（warn/snapshot/compact）
- **When**: 事件发生
- **Then**: 写入 `logs/context-monitor.jsonl` 结构化日志

**AC-5**: Master 可见性
- **Given**: Slaver context ≥ 120K
- **When**: Slaver 检测风险
- **Then**: 创建 `.eket/inbox/context-risk-TASK-XXX.md` 上报 Master

---

## 4. 非目标（Out of Scope）

- ❌ **直接调用 `/compact` API**（Claude Code 无此能力，只能提示用户）
- ❌ **实时精准 token 计数**（需访问 Claude API response headers，不可得）
- ❌ **跨 session 持久化监控**（session 结束后状态丢失，仅记录日志）
- ❌ **Playwright 工具节流**（属于工具层优化，非监控系统职责）
- ❌ **Rust 实现**（P2，本轮仅 Shell + Node.js）

---

## 5. 未知与假设

| ID | 类型 | 内容 | 阻塞级别 | 解除方式 |
|----|------|------|---------|---------|
| U-1 | 未知 | Hook 能否获取 response token 数？ | P0 | 测试 `<system-warning>` 解析 |
| U-2 | 未知 | tiktoken 估算误差范围？ | P1 | 对比实际 API 返回 |
| A-1 | 假设 | 文件大小 × 0.3 ≈ token 数 | P1 | 10 次对比验证 |
| A-2 | 假设 | UserPromptSubmit hook 每轮必触发 | P0 | 检查 .claude/settings.json |
| A-3 | 假设 | `/compact` 可减少 30-50% tokens | P1 | 实测记录 |

---

## 6. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解策略 |
|------|--------|------|---------|
| Hook 失败导致监控失效 | M | H | Shell 降级模式（wc -c） + 测试覆盖 |
| 估算误差 ±20% 触发误报/漏报 | H | M | 阈值保守设置（150K 而非 168K） |
| Node.js 启动开销 > 200ms 拖慢 hook | M | L | 缓存上次计数，仅增量计算 |
| 快照文件过大（>10MB）撑爆磁盘 | L | H | 限制保留最近 10 个快照 |
| 跨平台兼容性（Mac/Linux）| M | M | CI 双平台测试 |

---

## 7. 专家组召唤

需要以下专家：
- ✅ **架构师**: 设计 Shell/Node 分层 + token 估算策略
- ✅ **DevOps**: Hook 集成 + 跨平台测试
- ✅ **后端工程师**: Node.js 实现 + tiktoken 集成
- ✅ **QA**: 误差测试 + 边界 case 覆盖

---

**分析完成时间**: 2026-05-14  
**Next Step**: 召唤专家组，进行架构评审
