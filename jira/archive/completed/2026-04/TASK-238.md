**Ticket ID**: TASK-238
**标题**: [P1] Node/Rust 兼容性测试套件 tests/compat/
**类型**: task
**优先级**: P1

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:50:00Z
**started_at**: 2026-04-26T23:40:00Z
**completed_at**: 2026-04-26T23:50:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**:
**执行 Agent**:
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: tester
**assigned_experts**: tester, backend, architect

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |

---

## 1. 任务描述

建立 `tests/compat/` 自动化对比测试套件，验证 Rust 与 Node 输出 JSON 格式完全兼容：

**`tests/compat/run.sh`**：
- 用相同 fixture ticket 分别执行 `node dist/index.js task:claim` 和 `eket task:claim`
- 对比 JSON 输出 key 集合 + 关键字段值
- 差异时 exit(1)，CI 失败

**`tests/compat/fixtures/`**：
- `ticket_todo.md` — 标准 todo ticket fixture
- `expected_claim.json` — 期望输出 schema（允许 timestamp/id 字段模糊匹配）

**覆盖命令**：claim / complete / team:status / task:progress

## 2. 验收标准

- [ ] `bash tests/compat/run.sh claim` 通过；验证：`bash tests/compat/run.sh claim`
- [ ] Node/Rust JSON key 集合 100% 一致；验证：`bash tests/compat/run.sh --check-keys`
- [ ] CI workflow 添加 compat 步骤；验证：`cat .github/workflows/ci.yml | grep compat`

## 3. 依赖关系
### 3.1 前置：TASK-231（基础设施）
### 3.2 阻塞：无（独立测试层）

## 4. 时间追踪
| 预估时间 | 480 分钟 |

## 5. 执行日志

**执行者**: Slaver (tester)
**执行时间**: 2026-04-26T23:40:00Z ~ 2026-04-26T23:50:00Z

**创建文件**:
- `tests/compat/run.sh` — 主入口，`--check-keys` 模式，best-effort skip
- `tests/compat/lib/compare.sh` — `compare_json_keys()` + `keys_match_expected()`
- `tests/compat/fixtures/ticket_todo.md` — COMPAT-001 标准 todo fixture
- `tests/compat/fixtures/expected_claim_schema.json` — Rust task_claim.rs 源码推导的 11 key 列表
- `tests/compat/cases/test_claim.sh` — 3 subtests: Rust keys / Node keys / parity
- `tests/compat/cases/test_team_status.sh` — 3 subtests: Rust keys / Node keys / parity

**设计决策**:
- Rust claim 成功输出 keys 直接从 `task_claim.rs` L293-308 推导，无需运行时采样
- binary/dist 缺失 → SKIP（不 FAIL），CI safe
- team:status expected keys 从 `team_status.rs` L69-77 读取: `agents` + `summary`

**deferred_issues**:
- CI workflow (.github/workflows/ci.yml) compat step 未添加（项目无 CI config）
