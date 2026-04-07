# k6 测试报告目录

此目录用于存储 k6 压力测试的 JSON 报告。

## 报告命名规则

```
load-test-<timestamp>.json
```

示例:
```
load-test-2026-04-07T10-30-45-123Z.json
```

## 查看报告

k6 自动生成 JSON 格式的详细报告，包含：

- 请求统计
- 响应时间分布
- 错误率
- 自定义指标
- VU (Virtual Users) 统计

## 分析报告

使用 jq 工具分析 JSON 报告：

```bash
# 查看请求总数
jq '.metrics.http_reqs.values.count' load-test-*.json

# 查看 P95 延迟
jq '.metrics.http_req_duration.values["p(95)"]' load-test-*.json

# 查看错误率
jq '.metrics.http_req_failed.values.rate' load-test-*.json
```

## 报告保留策略

- 保留最近 30 天的报告
- 定期清理旧报告

```bash
# 清理 30 天前的报告
find . -name "load-test-*.json" -mtime +30 -delete
```
