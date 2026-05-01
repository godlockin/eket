# Spec 4 Feedback + Intent System 实战经验教训

**项目**：akea search — 多层意图聚合 + 反馈系统（12 Tasks, 32 Tests）

> ⚠️ 本文来自外部项目 akea search（Python/FastAPI），通用原则可参考，技术细节不直接适用于 EKET 主栈（Rust/Node.js）。

## 1. SQLite In-Memory + TestClient 线程隔离

详见 → `pitfalls/sqlite-inmemory-testclient-thread.md`

**TL;DR**：`:memory:` 是连接级别的，TestClient 子线程看不到主线程建的表。用 `StaticPool` + `check_same_thread=False`。

## 2. Multi-Pyproject Import 路径

**症状**：`ModuleNotFoundError: No module named 'apps'`，从 `backend/apps/search/` 目录运行 pytest 时触发。

**根因**：`backend/conftest.py` 把 `backend/` 加入 `sys.path`，所以 import 必须写 `from apps.search.feedback.models import Base`，且 pytest 必须从 `backend/` 目录执行。

**规则**：
- 运行测试：`cd backend && python -m pytest apps/search/feedback/tests/ -v`
- Import 写全路径：`from apps.search.feedback.xxx import Yyy`
- 不要手动设 `PYTHONPATH`，conftest 已处理

## 3. Slaver Agent 超时 — Python 项目特有陷阱

**症状**：派发给 Slaver 的 Python 后端任务反复 600s 超时。

**根因**：Slaver 不了解项目 import 约定，反复尝试不同路径直到超时。

**解法**：派发 Slaver 时在 prompt 中显式写明：
- 测试运行目录和命令
- Import 路径规范
- 不要设 PYTHONPATH

> 通用防卡死规则详见 → `agent-prompt-template.md`

## 4. intent_applied 返回 None vs 空 dict

**症状**：测试期望 `intent_applied is None`，实际返回 `{'filtered_n': 0, 'rerank_hint': '', ...}`。

**根因**：`pipeline.run()` 中 `intent_applied` 初始化为 `{}`，无论是否有 injection 都会被填充默认值。

**解法**：当 `intent_injection is None` 时，显式设 `intent_applied = None`。语义上 `None` = 意图系统未参与，`{}` 有歧义。

**设计原则**：用 `None` 表示"未参与"，用填充的 dict 表示"参与了但无变更"，两者语义不同。

## 5. Write Tool 大文件静默失败

详见 → `../context-token-budget-guide.md` §2

**TL;DR**：`Write` 含 >~8k tokens content 会 `InputValidationError: missing 'content'`。分块写入（首次 Write ~150 行，后续 Edit 追加 <500 行/块）。

## 6. NameError 风险：条件分支中的变量初始化

**症状**：pipeline 的精确编号路径（非向量检索）不定义 `filtered_n` / `rerank_hint`，后续引用报 NameError。

**解法**：在 if/else 分支前初始化默认值。**所有条件分支共用的变量必须在分支外初始化。**

---

**首次出现**：Spec 4 全程（Task 1-12），2026-04-29 ~ 2026-05-01。
