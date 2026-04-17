# Dual-Engine Equivalence Tests

**状态**: Skeleton — Phase 0 / Task 0.5
**目的**: 验证 Shell 引擎与 Node 引擎在共同核心操作上的 FS 行为等价

---

## 核心思想

对每个"共同核心"操作（如 claim-ticket、submit-pr、transition）：

1. **Shell-only 路径**：仅用 `scripts/*.sh` + `lib/state/` 执行
2. **Node-only 路径**：仅用 `node dist/index.js <cmd>` 执行
3. **Hybrid 路径**：Shell claim → Node 提交（或反之）

三种路径跑完后：**FS 快照必须 byte-equal**（除时间戳字段）。

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ clean fixture   │    │ clean fixture   │    │ clean fixture   │
│   ↓             │    │   ↓             │    │   ↓             │
│ Shell scenario  │    │ Node scenario   │    │ Mixed scenario  │
│   ↓             │    │   ↓             │    │   ↓             │
│ FS snapshot A   │    │ FS snapshot B   │    │ FS snapshot C   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
           └──────── diff_ignore_time ────────┘
                         ↓
                    must be equal
```

---

## 目录结构

```
tests/dual-engine/
├── README.md               # 本文件
├── framework.sh            # 通用工具（setup / snapshot / diff）
├── scenarios/
│   ├── 01-claim-ticket.sh
│   ├── 02-submit-pr.sh
│   ├── 03-ticket-transition.sh
│   ├── 04-heartbeat-write.sh
│   └── 05-master-election.sh
├── fixtures/               # 每个 scenario 的初始状态
│   └── basic/
└── run-all.sh              # CI 入口
```

---

## 运行

```bash
# 本地
./tests/dual-engine/run-all.sh

# 单个场景
./tests/dual-engine/scenarios/01-claim-ticket.sh

# CI
./tests/dual-engine/run-all.sh --ci
```

---

## 忽略的差异

以下字段在 diff 时被 `diff_ignore_time` 过滤：
- `timestamp: ...` (ISO8601)
- `created_at: ...`
- `updated_at: ...`
- `last_heartbeat: ...`
- `pid: ...`
- `short_id` 随机部分

其他任何差异 → 测试失败 → CI 拒合。

---

## 当前实现状态

| Scenario | Skeleton | Shell 版 | Node 版 | Hybrid |
|----------|----------|----------|---------|--------|
| 01 claim-ticket | 🟡 | ⚪ | ⚪ | ⚪ |
| 02 submit-pr | ⚪ | ⚪ | ⚪ | ⚪ |
| 03 ticket-transition | ⚪ | ⚪ | ⚪ | ⚪ |
| 04 heartbeat-write | ⚪ | ⚪ | ⚪ | ⚪ |
| 05 master-election | ⚪ | ⚪ | ⚪ | ⚪ |

---

## 加入 CI

`.github/workflows/` 中加：

```yaml
- name: Dual-Engine Equivalence
  run: ./tests/dual-engine/run-all.sh --ci
```

Phase 0 末启用为 required check。
