# EKET Python SDK — Examples

演示如何使用 `eket_sdk` 与 EKET Protocol server 交互。

---

## 前置条件

| 要求 | 说明 |
|------|------|
| Python | 3.8+ |
| eket_sdk | `pip install -e sdk/python` |
| EKET server | 默认监听 `http://localhost:8080` |

```bash
# 安装 SDK（从项目根目录执行）
pip install -e sdk/python
```

---

## 运行方式

```bash
# 从项目根目录执行
python3 sdk/python/examples/<example_name>.py
```

---

## 示例列表

### `register_agent.py` — 注册 Agent

注册一个新 Agent，检查 server 健康状态，列出所有已注册 Agent。

```bash
python3 sdk/python/examples/register_agent.py
```

**预期输出**（server 在线时）：
```
✅ Agent registered successfully!
   Instance ID: agent-xxxxxxxx
   Role: slaver
   Specialty: backend
   Status: active
```

---

### `claim_task.py` — 认领并执行任务

注册 Agent → 列出可用任务 → 认领任务 → 模拟进度更新 → 标记完成。

```bash
python3 sdk/python/examples/claim_task.py
```

---

### `submit_pr.py` — 提交 Pull Request

注册 Agent → 提交 PR → 向 Master 发送 Review 请求消息。

```bash
python3 sdk/python/examples/submit_pr.py
```

---

### `auto_heartbeat.py` — 后台心跳

在后台线程中持续发送心跳，同时主线程执行任务；演示状态切换（IDLE / ACTIVE）。

```bash
python3 sdk/python/examples/auto_heartbeat.py
```

---

### `complete_workflow.py` — 完整端到端流程

注册 → 心跳 → 列任务 → 认领 → 进度更新 → 提交 PR → 发消息 → 注销。完整演示 Slaver 生命周期。

```bash
python3 sdk/python/examples/complete_workflow.py
```

---

### `error_handling.py` — 错误处理

演示如何捕获并处理各类 SDK 异常：

| 异常类 | 触发场景 |
|--------|----------|
| `ValidationError` | 缺少必填字段、参数类型错误 |
| `AuthenticationError` | JWT token 无效或过期 |
| `NotFoundError` | Agent / Task / PR 不存在 |
| `ConflictError` | 任务已被其他 Agent 认领 |
| `ServerError` | Server 5xx 响应 |
| `EketError`（基类）| 连接失败、请求超时等 |

```bash
python3 sdk/python/examples/error_handling.py
```

---

## 注意事项

- **Server 不在线时**：所有发起网络请求的示例会抛出 `EketError`（code: `CONNECTION_ERROR`），这是正常行为。`error_handling.py` 展示了如何优雅处理这种情况。
- **JWT Token**：调用 `register_agent()` 后，token 自动存储在 `client.jwt_token`，后续请求会自动携带。
- **资源清理**：示例结尾调用 `client.close()` 释放连接池；建议使用 `with` 语句自动管理：

  ```python
  with EketClient(server_url="http://localhost:8080") as client:
      agent = client.register_agent(...)
  ```

---

## 运行所有 examples 语法检查

```bash
for f in sdk/python/examples/*.py; do
    python3 -m py_compile "$f" && echo "OK: $f" || echo "FAIL: $f"
done
```
