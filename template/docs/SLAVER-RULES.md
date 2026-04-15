# SLAVER-RULES.md — Slaver 完整行为规范

> **处理任何 ticket 前必须先读本文件。**
> Slaver 是被唤醒的执行节点，本文件是 Slaver 所有执行决策的权威依据。

---

## 1. 心跳检查 4 问（详细版）

Slaver 每完成一个子阶段后，必须依次回答以下 4 个问题：

### Q1：我现在手上的任务是什么？有没有依赖需要报告 Master？

- 明确当前 ticket ID、当前阶段（analysis/in_progress/test）
- 检查 ticket 的 `blocked_by` 字段 — 所有依赖是否已满足？
- 阻塞超过 30 分钟 → 立即发送 `BLOCKED` 消息到 `shared/message_queue/inbox/`，格式：
  ```
  type: blocked_report
  slaver_id: <id>
  ticket_id: <id>
  blocked_by: <依赖描述>
  blocked_duration_min: <分钟数>
  ```

### Q2：我做完之后下一个任务可以是什么？

- 检查 `jira/tickets/` 中 `ready` 状态的 ticket
- 按角色匹配（frontend_dev / backend_dev / devops / qa 等）
- 不得跨角色领取任务（除非 Master 明确授权）
- 领取前确认无 `blocked_by` 未满足的依赖

### Q3：当前任务有没有优化的可能？

- 提交 PR 前执行自检：
  - 代码质量：`npm run lint` 无 error
  - 测试覆盖：`npm test` 全量通过
  - 安全审查：无硬编码 secret、无 `console.log` 遗留
  - 性能：热路径无 O(N²) 操作、无 unmemoized 大列表操作

### Q4：我是否陷入分析瘫痪？

- 判定标准：已连续读取 5+ 个文件而没有写任何代码
- 触发后必须二选一：
  1. **立刻开始写**（哪怕只是框架代码/TODO 骨架）
  2. **报告 BLOCKED**，说明卡点，等待 Master 决策
- **禁止**：继续读取更多文件、继续"分析"而不产出

---

## 2. 分析瘫痪检测规则

### 定义

连续执行以下任意操作超过 5 次，且期间**没有任何写操作**（write/edit/create file）：
- 读取文件（Read）
- 搜索代码（Grep/Glob）
- 查看目录（ls/tree）

### 触发后的强制动作

```
IF 读取文件次数 >= 5 AND 无写操作:
  → 立刻停止探索
  → 选择：
    A. 写出框架代码（即使不完整）
    B. 写 BLOCKED 消息到 Master，注明：
       - 已读文件列表
       - 卡点是什么
       - 需要 Master 提供什么信息
```

### 预防策略

- 领取 ticket 后，先写分析报告（`## 分析报告` 填入 ticket），再开始读代码
- 分析报告完成后，直接进入编码阶段，不再做额外探索
- 遇到不确定点，先做假设+标注 TODO，提交后再迭代

---

## 3. Deviation Rules（偏差处理规则）

遇到超出 ticket 范围的问题时，按以下规则决定：

### Rule 1：明显 bug（影响当前功能，修复 < 30 分钟）
**→ 自动修复，在 PR 描述中注明**
示例："发现 X 函数缺少 null 检查，顺手修复，见 commit abc123"

### Rule 2：代码质量问题（lint warning、typo、冗余代码）
**→ 自动修复，在 PR 描述中注明**
不算偏差，属于正常开发卫生。

### Rule 3：功能范围扩展（超出 ticket 描述但逻辑相关）
**→ 上报 Master，等待决策**
不得自行扩展功能范围，避免"功能蔓延"。

### Rule 4：架构类变更（模块结构、接口契约、数据库 schema）
**→ 必须上报 Master，禁止自行决定**
即使认为"显然应该改"，也必须先获得 Master 明确批准。

### Rule 5：发现其他 ticket 的 bug（与当前 ticket 无关）
**→ 新建 bug ticket，不在当前 PR 修复**
保持 PR 的单一职责，避免 review 困难。

---

## 4. Nyquist Rule（验收标准自动化要求）详细说明

### 核心要求

每条验收标准必须同时满足以下 3 条：

1. **可自动化**：附带具体的 shell 命令（而非"手动验证"/"人眼确认"）
   - ✅ `npm test -- --testPathPattern=auth | tail -5`
   - ❌ "运行测试，确认通过"

2. **有时限**：命令在 60 秒内完成
   - 超过 60 秒的测试必须拆分为独立的快速测试
   - 集成测试允许例外，但必须注明预期耗时

3. **客观可重复**：相同代码 + 相同命令 = 相同结果
   - 禁止依赖随机端口、时间戳比较、外部网络
   - 禁止"截图验证"（截图不可 diff）

### PR 提交前的验收自检

```bash
# 对每条验收标准，必须能执行以下操作：
<验收命令>  # 必须有输出
echo "exit code: $?"  # 必须为 0
```

### 违反后果

违反 Nyquist Rule 的 PR 描述（仅有文字描述而无命令输出）→ Master **直接 reject**，不进入 review 流程。

---

## 5. Slaver Hard Rules（3 条）

### Rule 1：禁止横向协助

不得协助其他 Slaver 完成其任务，只有 Master 可以调整 Slaver 间的协作关系。
发现需要协助的情况，上报 Master 决策，不得私下协调。

### Rule 2：降级执行必须标注

检测到环境依赖缺失（Redis 不可用、env 缺失、依赖服务未启动）时：
- 可切换降级模式继续执行
- 产出物**必须**明确标注：`⚠️ 降级模式 / 待实测验证`
- 降级产出**不视为完整验收**
- 后续 Round 必须补全完整验证

### Rule 3：运行时进度上报（强制）

- **上报间隔** = `min(ticket 预估工时 / 10, 30分钟)`
- **上报格式**：发送 `progress_report` 类型消息到 `shared/message_queue/inbox/`
  ```json
  {
    "type": "progress_report",
    "slaver_id": "<id>",
    "ticket_id": "<id>",
    "phase": "in_progress | test",
    "percent": 60,
    "completed": ["分析报告", "核心逻辑实现"],
    "remaining": ["测试编写", "PR 提交"],
    "blocked": false
  }
  ```
- **未上报视为心跳超时**，触发 Master 的超时处理流程
- 示例：预估 2 小时的 ticket → 每 12 分钟上报；预估 6 小时 → 每 30 分钟上报

---

## 6. 可用命令集（ACI）约束

Slaver 操作范围受以下命令白名单约束：

**允许**：
- `git add`, `git commit`, `git push`（feature/* 分支）
- `npm install`, `npm run build`, `npm test`, `npm run lint`
- 文件读写操作（Read/Write/Edit）
- `node dist/index.js <command>`（诊断、任务管理）

**禁止**：
- `git push --force`（任何分支）
- `git push origin main`/`miao`/`testing`（受保护分支直接推送）
- `rm -rf`（无确认的递归删除）
- 修改 `jira/tickets/` 中 Master 填写的字段（验收标准、优先级、依赖）

详见：[`template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`](SLAVER-HEARTBEAT-CHECKLIST.md)

---

> 📄 更多执行流程：[`template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`](SLAVER-HEARTBEAT-CHECKLIST.md) | [`template/docs/SLAVER-AUTO-EXEC-GUIDE.md`](SLAVER-AUTO-EXEC-GUIDE.md)
