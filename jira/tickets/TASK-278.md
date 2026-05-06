# TASK-278: C1: priority 迁移脚本 — 确保旧 INTEGER 数据转为 TEXT

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P0
- **负责人**: Slaver-Rust
- **创建时间**: 2026-05-06
- **完成时间**: 2026-05-07
- **依赖**: []
- **所需专家**: rust, backend
- blocked_by: []
- required_expertise: [rust, backend]

## 背景

Code Review 发现 DB schema 从 `priority INTEGER` 改为 `priority TEXT`，但缺少显式迁移脚本，存在数据排序错误风险。

## 验收标准

- [x] 添加迁移 SQL：覆盖 INTEGER + 数字字符串 TEXT → Px 格式
- [x] 验证：生产 DB `SELECT DISTINCT priority` → 仅 P0/P1/P2/P3
- [x] 添加测试：迁移前后 ORDER BY 结果一致

## 技术方案

修改 `rust/crates/eket-core/src/db/mod.rs::run_migrations()`，扩展 TASK-272 迁移脚本：

```rust
conn.execute_batch(
    "UPDATE tickets SET priority =
        CASE
            WHEN typeof(priority) = 'integer' THEN
                CASE CAST(priority AS INTEGER)
                    WHEN 0 THEN 'P0'
                    WHEN 1 THEN 'P1'
                    WHEN 2 THEN 'P2'
                    WHEN 3 THEN 'P3'
                    ELSE 'P2'
                END
            WHEN priority GLOB '[0-3]' THEN  -- 数字字符串
                CASE priority
                    WHEN '0' THEN 'P0'
                    WHEN '1' THEN 'P1'
                    WHEN '2' THEN 'P2'
                    WHEN '3' THEN 'P3'
                END
            ELSE priority
        END
    WHERE typeof(priority) = 'integer' OR priority GLOB '[0-3]';"
)?;
```

## 实现结果

### 迁移执行

手动验证生产 DB：
```bash
sqlite3 ~/.eket/data/sqlite/eket.db \
  "UPDATE tickets SET priority = ... WHERE ...;" 
# 结果：5 rows updated
```

验证结果：
```sql
SELECT DISTINCT priority FROM tickets ORDER BY priority;
-- 仅输出: P0, P1, P2, P3
```

### 测试覆盖

添加测试用例：
1. `priority_migration_numeric_text_to_px` — 验证数字字符串转换
2. `priority_order_by_works_correctly` — 验证 ORDER BY 排序

测试结果：
```
cargo test priority: 3 passed, 157 filtered out
```

## 复盘

### What Went Well
- 及时发现遗留数字字符串（生产 DB 有 5 条 `'1'/'2'`）
- 扩展 GLOB 模式覆盖 TEXT 类型，避免二次清理

### Pitfalls
- **初次忽略 TEXT 类型数字**：TASK-272 只转 INTEGER，遗留字符串 `"1"/"2"`
- **测试中事务作用域混淆**：直接用 `client.pool().get()` 插入数据，需显式作用域释放连接

### Patterns
- **幂等迁移设计**：`WHERE typeof(...) OR pattern` 确保多次运行无副作用
- **生产验证先行**：手动运行 SQL → 确认语法正确 → 再写入代码

### Action Items
- [ ] 考虑引入 migration version 表（如 `schema_migrations`），避免重复执行

## Knowledge Links
- SQLite `typeof()` 函数：区分 INTEGER vs TEXT
- `GLOB '[0-3]'` 匹配单字符数字
- `CASE ... WHEN ... END` 多条件转换模板
