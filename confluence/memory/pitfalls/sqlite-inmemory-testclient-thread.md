---
name: sqlite-inmemory-testclient-thread
type: pitfall
created: 2026-04-20
source: TASK-SPEC4-006
tags: [sqlite, fastapi, testing, python, threading]
confidence: high
---

# SQLite In-Memory + FastAPI TestClient 线程隔离

> SQLite :memory: 数据库在多线程环境下不共享，导致 TestClient 报 "no such table"

## 症状

`Base.metadata.create_all(eng)` 成功建表，但 TestClient 发请求时报 `OperationalError: no such table: feedback`。

打印 `inspect(eng).get_table_names()` 确认表已存在，但请求仍失败。

## 根因

SQLite `:memory:` 数据库是 **连接级别** 的。FastAPI TestClient 在子线程执行请求，主线程的 `create_all` 建表对子线程不可见 -- 每个线程拿到的是独立的空数据库。

## 方案

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

## 示例

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

@pytest.fixture
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()
```

## 反模式

```python
# 反模式：不使用 StaticPool
engine = create_engine("sqlite:///:memory:")
# TestClient 在子线程看不到建好的表
```

## 适用场景

- 任何需要 FastAPI TestClient + SQLite in-memory 的测试 fixture

## 不适用场景

- 直接调用 Store/Aggregator 的单元测试（单线程，无需 StaticPool）

## 相关

- [async-test-leak.md](async-test-leak.md) - 另一个测试隔离问题
- SQLAlchemy 文档：https://docs.sqlalchemy.org/en/20/dialects/sqlite.html
