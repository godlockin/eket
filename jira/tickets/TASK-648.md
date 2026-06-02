# TASK-648: DAG 实时进度 (--live) + Web API

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P1  
**预估**: 1.5d  
**依赖**: TASK-639, TASK-642  
**层级**: All  
**来源**: 产品需求 (TASK-639 遗留)

---

## 问题描述

TASK-639 遗留两个功能未实现：
1. `eket dag:status <run-id> --live` 实时刷新进度
2. Web API `/api/v1/dag/view` 返回 Mermaid 格式

## 验收标准

- [x] `dag:status --live` 每 2 秒刷新 ASCII 进度图
- [x] 支持 `--interval` 自定义刷新间隔
- [x] Ctrl+C 优雅退出
- [x] `/api/v1/dag/view?epic=EPIC-NNN` 返回 Mermaid
- [x] `/api/v1/dag/status?runId=xxx` 返回 JSON 状态

## 实现方案

### CLI --live 模式
```typescript
async function watchDagStatus(runId: string, interval: number) {
  const clearScreen = () => process.stdout.write('\x1B[2J\x1B[0f');
  
  while (true) {
    clearScreen();
    const status = await executor.getStatus(runId);
    console.log(visualizer.renderAscii(dag, status));
    await sleep(interval);
  }
}
```

### Web API
```typescript
// node/src/routes/dag-api.ts
router.get('/api/v1/dag/view', async (req, res) => {
  const { epic, format = 'mermaid' } = req.query;
  const dag = await loadDag(epic);
  const output = visualizer.render(dag, { format });
  res.type('text/plain').send(output);
});

router.get('/api/v1/dag/status', async (req, res) => {
  const { runId } = req.query;
  const status = await executor.getStatus(runId);
  res.json(status);
});
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (TASK-639 遗留) | Master |
| 2026-06-01 | 完成实现 | Slaver |

## 实现详情

### CLI --live 模式
- 文件: `node/src/commands/dag-commands.ts`
- 新增选项: `--live`, `--interval <ms>`, `--dag <file>`
- 功能: 每 N 毫秒刷新终端，显示进度条 + 节点状态
- 支持 Ctrl+C 优雅退出，运行完成自动退出

### Web API
- 文件: `node/src/api/routes/dag-api.ts`
- 路由:
  - `GET /api/v1/dag/view?epic=EPIC-NNN&format=mermaid|ascii|json` - DAG 可视化
  - `GET /api/v1/dag/status?runId=xxx` - 运行状态 JSON
  - `GET /api/v1/dag/list` - 列出所有 DAG 文件
- 已注册到 `eket-server.ts`
