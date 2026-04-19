---
id: TASK-085
title: P1 合并 examples 双轨 + node/src/api/examples 删除
type: chore
priority: P1
status: done
created_by: Master
created_at: 2026-04-19
dependencies: [TASK-084]
acceptance_criteria:
  - `node/src/api/examples/` 目录已删除
  - `examples/e2e-collaboration/scripts/` 内容保留（以此为主）
  - diff 检查确认 examples/ 版本包含更新的内容
  - `cd node && npm test` 全量通过
---

## 需求

`examples/e2e-collaboration/scripts/` 和 `node/src/api/examples/e2e-collaboration/scripts/` 内容不同步（4 个脚本均有差异），双轨维护。

## 实现细节

1. diff 两组脚本，确认 `examples/` 版本为最新（或合并缺失内容）：
```bash
diff examples/e2e-collaboration/scripts/cleanup.sh node/src/api/examples/e2e-collaboration/scripts/cleanup.sh
diff examples/e2e-collaboration/scripts/run-demo.sh node/src/api/examples/e2e-collaboration/scripts/run-demo.sh
diff examples/e2e-collaboration/scripts/start-redis.sh node/src/api/examples/e2e-collaboration/scripts/start-redis.sh
diff examples/e2e-collaboration/scripts/start-server.sh node/src/api/examples/e2e-collaboration/scripts/start-server.sh
```
2. 若 `node/src/api/examples/` 有独有内容，先合并到 `examples/`
3. 删除 `node/src/api/examples/`
4. 检查 `node/src/api/` 是否有任何 import/require 引用 examples 路径

## Slaver 完成记录

- **领取时间**: 2026-04-19
- **完成时间**: 2026-04-19
- **执行者**: Slaver

### 实现细节
- diff 检查：`node/src/api/examples/` 下 4 个脚本均为空文件（0B），`examples/` 版本为实质内容，无需合并
- 检查 `node/src/` 无任何文件 import/require 引用 `api/examples` 路径
- 删除 `node/src/api/examples/` 目录
- 测试结果：1199 tests passed, 62 suites，无回归
