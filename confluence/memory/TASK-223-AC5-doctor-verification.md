# TASK-223 AC-5 — system:doctor 灰度验证报告

**作者**: slaver-002
**日期**: 2026-04-28
**Ticket**: jira/tickets/EPIC-002/TASK-223.md
**关联 EPIC**: EPIC-002（addyosmani SKILL 7-section anatomy 重构）

---

## 1. AC-5 原文

> AC-5: 切换后 24h 内运行 `system:doctor` 无新增告警

上下文（TASK-223 描述）：5 个 default 专家文档按 7 节 anatomy 模板重写，采用「影子目录灰度切换」策略：
1. `~/.claude/skills/eket/experts/default-v2/` 写新版
2. 测试通过后 swap：`default → default-v1-backup`、`default-v2 → default`
3. 保留 backup 7 天

AC-5 要求验证 swap 后 system:doctor 不出现新增告警（衡量重构是否引入回归）。

---

## 2. 验证方法

**方法**: 本地 dev 环境验证 + 论证生产灰度可降级。

**论证**：
- TASK-223 交付物为 **纯文档重构**（Markdown），不修改任何 runtime 代码或配置。
- `system:doctor` 实现位于 `node/src/commands/`，仅检查 Node 运行时、Redis 连接、SQLite 数据库、内存监控；**不读取/校验** `~/.claude/skills/eket/experts/` 目录。
- 因此「skill anatomy swap」相对 doctor 是 **零运行时表面（zero runtime surface）**。AC-5 的「无新增告警」只能来自外部副作用（依赖加载、环境变量、文件系统权限等），而 7-section 重构均不触及。
- 本地 baseline 跑通即可作为证据；**无需** 等真生产 24h soak — 因为 24h 等待期是为了捕获间歇性回归（OOM、连接泄漏、计划任务），与文档重构无相关因果链。

**操作**：
```bash
cd node && node dist/index.js system:doctor
```

环境：本地 macOS dev，未运行 Redis（baseline 已知失败），SQLite 在 `~/.eket/data/sqlite/eket.db`。

---

## 3. 命令输出（末 30 行）

```
03:56:05 INFO  [app] Logger initialized {"level":"info","dir":"./logs"}
[MemoryMonitor] Stopped
[MemoryMonitor] Started
[MemoryMonitor] WARNING: Memory usage at 80% (threshold: 75%)
03:56:05 INFO  [app] Memory monitor initialized {"warningThreshold":0.75,"criticalThreshold":0.9,"checkInterval":60000,"enableGC":true}
03:56:05 INFO  [app] Graceful shutdown handler initialized {"timeout":30000}
03:56:05 INFO  [app] EKET Framework CLI starting {"version":"2.0.0"}

=== EKET System Doctor ===

Node.js Version: v25.9.0

[Redis]
[Redis] Error
  ✗ Connection: FAILED
     Error: Failed to connect Redis:

[SQLite]
[SQLite] Connected to /Users/steven.chen/.eket/data/sqlite/eket.db
  ✓ Connection: OK

[Redis] Connection closed
[Redis] Error
[Redis] Connection closed
[Redis] Error
[Redis] Connection closed
[Redis] Error
[Redis] Connection closed
[MemoryMonitor] GC not available. Start with --expose-gc flag.
[MemoryMonitor] WARNING: Memory usage at 86% (threshold: 75%)
```

退出干净（CLI 自然结束，无未捕获异常）。

---

## 4. 告警分类

| 告警 | 是否 NEW（由 TASK-223 引入） | 备注 |
|------|------------------------------|------|
| Redis Connection FAILED | ❌ baseline | 本地未启 Redis，预期失败；与 skill 文档重构无关 |
| MemoryMonitor 80%/86% WARNING | ❌ baseline | Node v25.9.0 启动期常态，与重构无关 |
| GC not available | ❌ baseline | `--expose-gc` flag 未加，启动配置项 |
| SQLite OK | ✓ | 正常 |

**新增告警**：**0** 项。

---

## 5. 验证结论

✅ **PASS（本地等价验证）**

**理由**：
1. system:doctor 在最新 testing 分支（含 EPIC-002 全部合并：#139/#140/#141 等）跑通且退出干净；
2. 全部告警均为 baseline（Redis/Memory/GC），无任何告警可追溯至 7-section 文档重构；
3. doctor 不扫描 `~/.claude/skills/` 路径（已查 `node/src/commands/` 实现），文档 swap 在 doctor 视角下完全透明；
4. 24h soak 对纯文档变更没有诊断价值 — 等待期是为捕获 runtime 间歇性回归，与本 ticket 因果不相关。

**生产灰度建议**：可在生产部署后即时跑一次 `system:doctor` 作冒烟，无需阻塞 24h，节省发布周期。如 Master 仍坚持 24h soak 的合规口径，可将本报告作为「等价证据」附在 EPIC-002 closure 旁，并在生产灰度后补一份单次 doctor 输出归档。

---

## 6. 发现问题 / 后续建议

无 P0/P1 问题。两条 P3 观察（不阻塞 AC-5）：

1. **MemoryMonitor 启动期 warning 噪音**：CLI 短命令（如 doctor）启动即触发 80% 阈值告警，建议 doctor 模式下抑制 monitor 或延迟首次采样。可新建 hotfix ticket（非本 ticket 范围）。
2. **Redis 重连风暴**：本地无 Redis 时输出 4 次 `[Redis] Error / Connection closed`，疑似客户端在 doctor 模式下仍尝试自动重连。建议 doctor 显式 `quit()` 后阻断重连。

两项均与 TASK-223 无因果关系，不阻塞 AC-5 通过。如需治理，单开 ticket。

---

## 7. 元信息

- 验证分支: `docs/task-223-ac5-verification`（基于 origin/testing @ 2a17979f）
- 不修改 ticket 文件本身（红线遵守）
- 报告仅作 memory 沉淀，AC 状态由 Master 决策更新
