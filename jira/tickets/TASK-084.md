---
id: TASK-084
title: P0 清理根目录垃圾文件 + node/template 残留
type: chore
priority: P0
status: done
created_by: Master
created_at: 2026-04-19
dependencies: []
acceptance_criteria:
  - 根目录 `import json,sys;...` 文件已删除
  - `CLAUDE.md.bak` 已删除
  - `node/template/` 目录已删除
  - `git status` 显示上述三项已移除
  - `cd node && npm test` 全量通过（无回归）
---

## 需求

删除三个明确无用的文件/目录：

1. **根目录 cookie 文件**：`import json,sys; [print(x['name'], x['type']) for x in json.load(sys.stdin)]`
   - 误创建的 Netscape cookie 文件，与项目无关
2. **`CLAUDE.md.bak`**：旧版 CLAUDE.md 备份，内容已过时，正式文件 `CLAUDE.md` 已是最新版
3. **`node/template/`**：只有 6 个 `.claude/commands/*.sh`，是 `template/` 的旧版残留，与主 `template/` 分叉且不同步

## 实现细节

```bash
rm "import json,sys; [print(x['name'], x['type']) for x in json.load(sys.stdin)]"
rm CLAUDE.md.bak
rm -rf node/template/
```

验证 `npm test` 不受影响（node/template 不参与任何测试/构建）。

## Slaver 完成记录

- **领取时间**: 2026-04-19
- **完成时间**: 2026-04-19
- **执行者**: Slaver

### 实现细节
- 删除根目录 cookie 文件（python 代码字符串命名的误创建文件）
- 删除 `CLAUDE.md.bak`
- 删除 `node/template/` 目录（含 6 个 `.claude/commands/*.sh` 残留文件）
- 测试结果：1199 tests passed, 62 suites，无回归
