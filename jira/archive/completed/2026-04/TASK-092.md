# TASK-092: web/ 确认职责 — 原始 HTML dashboard vs Node.js dashboard

## 元数据
- **状态**: done
- **类型**: chore
- **优先级**: P2
- **负责人**: Slaver
- **创建时间**: 2026-04-19
- **依赖**: 无

## 背景

项目根目录 `web/` 包含原始 HTML+JS dashboard（`index.html`, `app.js`, `styles.css`, `locales/`），
而 Node.js 端有 `node/src/api/dashboard-server.ts` 提供 `web:dashboard` 命令。
需确认两者关系：`web/` 是 Node dashboard 的前端源文件？还是独立的过时旧版本？

## 验收标准

1. 读取 `web/index.html` 和 `node/src/api/dashboard-server.ts`，
   确认 Node.js dashboard 是否 serve `web/` 目录下的文件
2. 若是（Node serves web/）：保留 `web/`，添加 README.md 说明前后端关系
3. 若否（独立旧版）：将 `web/` 移入 `docs/archive/web-original/`
4. 结论记录在本 ticket 的「实现细节」节

## 检查命令

```bash
grep -r 'web/' node/src/api/dashboard-server.ts
grep -r 'web/' node/src/
cat web/index.html | head -20
```

## 实现细节

**决策**: 保留 web/，添加 README.md

**评估结论**:
- `node/src/api/web-server.ts:63`: `staticPath: config.staticPath || path.resolve(__dirname, '../../../web')`
- Node.js web server 在启动时明确将 `web/` 作为静态资源目录挂载
- `web/` 不是独立旧版本，是 Node dashboard 的前端源文件

**执行操作**:
- 添加 `web/README.md` 说明依赖关系和文件职责
- web/ 目录保留

**PR**: https://github.com/godlockin/eket/pull/105
