# Dual-Engine Snapshot Normalization

等价性测试通过 `snapshot_fs` 采集文件清单 + 每文件内容 sha256，比较两个引擎
（Shell vs Node，以及 Mixed）产生的快照是否**字节一致**。

因为两个引擎运行在不同进程 / 时刻 / 主机 ID，原始输出不可能逐字节相等。
为保留真正的语义 diff（字段顺序、序列化格式、末尾换行等），我们把所有
**必然非确定**的 token 归一化后再 hash。

---

## 归一化总览

| 类别           | 正则 / 操作                                                                           | 原因                                                                       |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| YAML 时间字段  | `^(timestamp\|created_at\|updated_at\|last_heartbeat\|joined_at\|registered_at): …`   | ISO8601 时间戳每次运行不同                                                  |
| JSON 时间字段  | `"(timestamp\|created_at\|updated_at\|registered_at)":\s*"…"`                         | 同上，JSON 形式                                                            |
| `pid`          | `pid:\s*\d+`                                                                           | 进程号非确定                                                                |
| `host`         | `host:\s*\S+`                                                                          | 运行主机名差异（CI vs 本地）                                                |
| Message ID     | `"id":\s*"msg_YYYYMMDD_HHMMSS_NNN"` + bare `msg_YYYYMMDD_HHMMSS_NNN`                   | P0-8 格式；文件名 / 正文都需替换                                           |
| PR filename TS | `pr-<TICKET>-YYYYMMDDTHHMMSSZ` → `pr-<TICKET>-<TS>`                                    | review_request 文件名含生成时间戳                                           |
| Atomic tmp     | `.tmp.<pid>.<rand>`                                                                    | `atomic_write` 中间产物后缀                                                 |
| Audit bare TS  | `^YYYY-MM-DDTHH:MM:SSZ \|` → `<TS> \|`                                                | `shared/audit.log` 每行以 ISO 时间开头，不带字段名                         |
| Audit engine   | `\| (shell\|node) \|` → `\| <ENGINE> \|`                                              | 审计第二字段明确区分引擎，对比时归一                                        |

实现位于 [tests/dual-engine/framework.sh](../../tests/dual-engine/framework.sh)
的 `_content_normalized` 和 `snapshot_fs`。

---

## 路径归一化

文件清单中的 **路径** 同样需要归一化（否则 `msg_<时间戳>_<序号>.json` 永远不等）：

```sh
sed -E \
  -e 's|msg_[0-9]{8}_[0-9]{6}_[0-9]{3}|msg_<ID>|g' \
  -e 's|pr-([A-Z]+-[0-9]+)-[0-9]{8}T[0-9]{6}Z|pr-\1-<TS>|g'
```

---

## 添加新字段时的流程

1. 先写 scenario 跑一次，观察 diff 命中哪些非确定字段。
2. 如果是 **真正非确定**（时间/pid/host/随机）→ 扩展上表对应的 sed 规则。
3. 如果是 **引擎差异**（字段顺序、默认值缺失、trailing newline）→ 修 writer，
   *不* 写新 normalize 规则。这条很关键：normalize 只掩盖噪声，不能掩盖真 bug。
4. 每条新规则必须在本文件列一行，解释"为什么必须归一"。

---

## 反模式（禁止）

- 通用化归一（例："把所有 ISO 时间戳替换成 `<TS>`"）→ 会吃掉 writer 真该写
  "2026-01-01" 但错写成 "2026-02-02" 的 bug。**始终带字段名**。
- 把 diff 逐行正则化成空行 → 测试变成"永远通过"的摆设。
- 在 normalize 层把字段排序 → Shell/Node 字段顺序本身就是协议契约（P0-4）。

---

## 相关

- 协议 ID 格式：[protocol/conventions/id-format.md](../../protocol/conventions/id-format.md)（P0-8）
- 字段顺序契约：[lib/state/writer.sh](../../lib/state/writer.sh) `state_enqueue_message`
  与 [node/src/core/state/writer.ts](../../node/src/core/state/writer.ts) `enqueueMessage`（P0-4）
- CI 入口：[.github/workflows/dual-engine.yml](../../.github/workflows/dual-engine.yml)
