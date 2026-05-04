---
title: task:create --effort 人类可读时间单位
review_status: accepted
review_ticket: manual
reviewed_at: 2026-05-04T00:00:00Z
proof:
  task_id: TASK-245 + hotfix
  exit_code: 0
  timestamp: 2026-05-04T00:00:00Z
  tool_name: cargo test -p eket-cli -- task_create
---

# task:create --effort 人类可读时间单位

**场景**：Master 拆卡时脑子里转的是"0.5天/1天"，`--effort 480` 纯分钟格式摩擦大，容易漏填或填错。

**方案**：`--effort` 支持带单位后缀，1d = 8h = 480min：

```bash
eket task:create "重构认证" --expertise rust --effort 2d    # 2天=960min，超阈值触发拆分提示
eket task:create "修复bug" --expertise rust --effort 0.5d   # 半天=240min，正常
eket task:create "调研" --expertise any --effort 3h         # 3小时=180min
eket task:create "快速修复" --expertise rust --effort 30    # 30分钟（纯数字=分钟）
```

**阈值配置**（`.eket/config.yml`）：

```yaml
task_size:
  warn_days: 1      # 推荐：人类可读，超过1天触发
  # warn_minutes: 480  # 兼容旧格式
```

**警告信息**（人类可读）：
```
⚠ 预估工时 2天 超过阈值 1天，建议拆分
继续创建单张卡？(y/N)
```

**踩坑**：
- 纯数字 `--effort 1` 被解析为 1分钟，不触发警告（看起来像"1天"但实际是"1分钟"）——必须带单位 `1d`
- `0.5d` 合法（浮点天数），`1.5h` 也合法，但 `1d30m` 不支持（无混合格式）

**来源**：TASK-245，2026-05-04 用户反馈
