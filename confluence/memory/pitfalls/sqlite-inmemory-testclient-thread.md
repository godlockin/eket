# SQLite In-Memory + FastAPI TestClient 线程隔离

**症状**：`Base.metadata.create_all(eng)` 成功建表，但 TestClient 发请求时报 `OperationalError: no such table: feedback`。打印 `inspect(eng).get_table_names()` 确认表已存在。

**根因**：SQLite `:memory:` 数据库是 **连接级别** 的。FastAPI TestClient 在子线程执行请求，主线程的 `create_all` 建表对子线程不可见——每个线程拿到的是独立的空数据库。

**解法**：

```python
from sqlalchemy.pool import StaticPool

eng = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
```

- `StaticPool`：所有线程共享同一个物理连接，表结构可见
- `check_same_thread=False`：关闭 SQLite 的线程安全检查（测试场景可接受）

**适用场景**：任何需要 FastAPI TestClient + SQLite in-memory 的测试 fixture。

**不适用**：直接调用 Store/Aggregator 的单元测试（单线程，无需 StaticPool）。

**首次出现**：Spec 4 Task 6 — API routes 测试。调试耗时 ~30 分钟。
