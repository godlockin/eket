# TASK-017: Python SDK Examples 完善

**优先级**: P2
**Round**: 14
**目标版本**: v2.6.0
**分支**: `feature/TASK-017-python-sdk-examples`
**状态**: done
**completed_at**: 2026-04-14T00:00:00Z
**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

---

## 背景

`sdk/python/examples/` 已有 5 个示例文件，但存在问题：
1. 部分 examples 使用旧 API（`client.register_agent` 参数可能不匹配最新类型）
2. 缺少错误处理示范
3. 缺少 `complete_workflow.py` 端到端完整流程
4. 没有 README 指引如何运行

---

## 现有 examples

```
register_agent.py      ← 注册 Agent
claim_task.py          ← 认领任务
submit_pr.py           ← 提交 PR
auto_heartbeat.py      ← 心跳维持
complete_workflow.py   ← 完整流程（需验证）
```

---

## 任务清单

### 1. 验证并修复现有 examples
- [ ] `register_agent.py` — 确认参数与当前 `EketClient.register_agent()` 签名一致
- [ ] `claim_task.py` — 确认 Task 数据结构正确
- [ ] `submit_pr.py` — 确认 `SubmitPRParams` 字段正确
- [ ] `auto_heartbeat.py` — 确认心跳 API 存在
- [ ] `complete_workflow.py` — 端到端串联，确认可运行（即使 server 不存在也要有清晰错误）

### 2. 新增示例（按需）
- [ ] `error_handling.py` — 演示 ValidationError/NetworkError/NotFoundError 处理
- [ ] `config_example.py` — 演示 JWT token、timeout 等配置项

### 3. 运行说明
- [ ] `sdk/python/examples/README.md` — 说明前置条件、运行方式、预期输出

### 4. 验证每个 example 无语法/import 错误
```bash
# 每个文件至少 python3 -c "import ast; ast.parse(open('x.py').read())" 通过
# 或 python3 -m py_compile x.py
```

---

## 验收标准

- [ ] 所有 .py examples `python3 -m py_compile` 通过（无语法错误）
- [ ] examples/README.md 存在，说明清晰
- [ ] `error_handling.py` 存在
- [ ] 现有 26/26 Python SDK tests 仍通过

---

## 参考

- SDK 源码: `sdk/python/eket_sdk/`
- 类型定义: `sdk/python/eket_sdk/models.py`
- 客户端: `sdk/python/eket_sdk/client.py`
