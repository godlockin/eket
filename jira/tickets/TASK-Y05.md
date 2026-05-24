# TASK-Y05: 实时 Web 运行时仪表盘与拓扑可视化

**ID**: TASK-Y05  
**Epic**: EPIC-009  
**优先级**: P2  
**预估**: 8h  
**依赖**: TASK-Y04  
**Agent Type**: frontend  
**Category**: 🖥️ Web / Dashboard / Visualization

---

## Goal

将抽象的 SDLC 事件图谱（Event Graph）与多级 Agent 状态转化为直观的、对人类友好的实时可视化看板。升级内置的 Web Dashboard 服务，利用 `vis.js` 或类似图形库实现 Agent 节点的拓扑网络渲染与时序甘特图呈现，打通人机协同的最后一道可视化壁垒。

---

## Acceptance Criteria

**AC-1**: 实时 Agent 心跳拓扑渲染  
- Given: 打开 Web Dashboard 界面 (默认端口 3000)
- When: 多个 Slaver 及 Master 活跃运行中
- Then: 动态渲染一张拓扑网络图，清晰展示每个 Agent 的 `agent_id`、当前心跳状态（正常/黄色警告/假死红色）以及领取的 `task_id`

**AC-2**: 交互式 SDLC 事件图谱展示  
- Given: 点击拓扑图中的某个 Ticket 节点
- When: 触发详情查询
- Then: 利用 `graph-query` 联表数据，以有向无环图（DAG）渲染该任务的流转历史、调用链依赖（来自 AST codebase map）以及发生的 Block 瓶颈

**AC-3**: Token 与算力时序甘特图  
- Given: 查看项目整体看板
- When: 选择时间范围
- Then: 显示每个 Slaver 的工作甘特时序图，并以柱状图同步直观呈现 Token 消费堆叠，红线标示预算熔断阈值

**AC-4**: 极简与高颜值的暗黑美学  
- Given: 渲染 Web UI 页面
- When: 查看视觉效果
- Then: 采用 premium 暗黑磨砂玻璃风格 (Glassmorphism)，配合流畅的网络拓扑节点连线微动画，确保带给人类项目经理（PM）强烈的视觉震撼力

---

## Implementation Sketch

在 `node/src/commands/server-start.ts` 或新建立的 `dashboard-server.ts` 中集成静态页面：

```typescript
// node/src/commands/server-start.ts 或新建文件
import express from 'express';
import { Server } from 'ws';
import { createServer } from 'http';

export function startLiveDashboard(port: number = 3000): void {
  const app = express();
  const server = createServer(app);
  const wss = new Server({ server });

  // 1. 提供静态资源与 vis.js 图形库
  app.use(express.static(path.join(process.cwd(), 'web/dist')));

  // 2. 监听 Websocket 事件流广播
  wss.on('connection', (ws) => {
    console.log('[Dashboard] Human viewer connected via WebSocket');
    
    // 轮询或基于 Redis Event-Bus 实时向 Web 端推送最新的心跳和 Ticket 变化
    const timer = setInterval(async () => {
      const liveTopology = await fetchActiveTopologyFromDB();
      ws.send(JSON.stringify({ type: 'topology_update', data: liveTopology }));
    }, 2000);

    ws.on('close', () => clearInterval(timer));
  });

  server.listen(port, () => {
    console.log(`[Dashboard] 🚀 满血版仪表盘已启动: http://localhost:${port}`);
  });
}
```

在 `web/dist/index.html` 中引入前端绘制逻辑：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <title>EKET Multi-Agent System Dashboard</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    body { background-color: #0b0f19; color: #e2e8f0; font-family: 'Outfit', sans-serif; }
    #network-holder { width: 100%; height: 600px; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(10px); }
  </style>
</head>
<body>
  <h1>EKET Live Agent Network</h1>
  <div id="network-holder"></div>
  <script>
    const container = document.getElementById('network-holder');
    const socket = new WebSocket(`ws://${location.host}`);
    let network = null;

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'topology_update') {
        const { nodes, edges } = formatVisData(msg.data);
        if (!network) {
          network = new vis.Network(container, { nodes, edges }, {
            physics: { barnesHut: { gravitationalConstant: -3000 } },
            nodes: { shape: 'dot', size: 16, font: { color: '#ffffff' } }
          });
        } else {
          network.setData({ nodes, edges });
        }
      }
    };
  </script>
</body>
</html>
```

---

## Test Strategy

**Manual**: 运行 `npm run dev` 启动测试环境，在终端执行 `eket web:dashboard`。打开浏览器访问 `http://localhost:3000`。手动断开一个 Slaver 的网络心跳，确认拓扑网络图上的节点颜色立刻从绿色渐变过渡为红色警告。

---

**Blocked By**: TASK-Y04  
**Blocks**: None  
**Created**: 2026-05-24
---
status: ready
assignee: ""
branch: ""
ac_completed: 0/4
test_coverage: 0%
