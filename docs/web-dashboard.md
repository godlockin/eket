# EKET Web Dashboard (Phase 5.1)

轻量级 Web 监控面板，实时显示 EKET 系统状态、Instance 状态和任务进度。

## 功能特性

- **零构建依赖**: 原生 HTML/CSS/JavaScript，无需构建工具
- **自动刷新**: 每 5 秒自动轮询更新数据
- **响应式设计**: 支持桌面和移动端
- **实时监控**: Instance 状态、系统健康度、任务进度

## 快速开始

### 方式一：使用启动脚本

```bash
./scripts/start-web-dashboard.sh
```

### 方式二：使用 CLI 命令

```bash
# 进入 node 目录
cd node

# 编译 TypeScript
npm run build

# 启动 Web Dashboard
node dist/index.js web:dashboard

# 自定义端口和主机
node dist/index.js web:dashboard --port 8080 --host 0.0.0.0
```

### 方式三：使用环境变量

```bash
export EKET_WEB_PORT=3000
export EKET_WEB_HOST=localhost
./scripts/start-web-dashboard.sh
```

## 访问地址

默认地址：http://localhost:3000

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/dashboard` | GET | 获取完整仪表盘数据 |
| `/api/status` | GET | 获取系统状态 |
| `/api/instances` | GET | 获取所有 Instance |
| `/api/tasks` | GET | 获取任务列表 |
| `/api/stats` | GET | 获取统计数据 |

### API 响应格式

```json
{
  "success": true,
  "data": {
    "systemStatus": {
      "level": 1,
      "description": "Level 1 (Redis+SQLite)",
      "redisConnected": true,
      "sqliteConnected": true,
      "messageQueueConnected": true
    },
    "instances": [...],
    "tasks": [...],
    "stats": {
      "totalInstances": 5,
      "activeInstances": 2,
      "idleInstances": 2,
      "offlineInstances": 1,
      "totalTasks": 10,
      "inProgressTasks": 3,
      "completedTasksToday": 5,
      "successRate": 100
    },
    "timestamp": 1711440000000
  },
  "timestamp": 1711440000000
}
```

## UI 布局

```
┌─────────────────────────────────────────────────────────┐
│  EKET Monitor Dashboard                      [刷新]     │
├─────────────────────────────────────────────────────────┤
│  System Status: Level 1 (Redis+SQLite)                  │
├─────────────────────────────────────────────────────────┤
│  Statistics                                             │
│  [总 Instances] [忙碌] [空闲] [离线] [总任务] [进行中]   │
├─────────────────────────────────────────────────────────┤
│  Instances (5)                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ID           │ Role    │ Type │ Status  │ 心跳    │  │
│  ├───────────────────────────────────────────────────┤  │
│  │ master-001   │ master  │ human│ ● idle  │ 10:30   │  │
│  │ slaver-002   │ frontend│ human│ ● busy  │ 10:29   │  │
│  │ slaver-003   │ backend │ ai   │ ● busy  │ 10:28   │  │
│  │ slaver-004   │ qa      │ ai   │ ○ offline│ --    │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Active Tasks (3)                                       │
│  - FEAT-001: 用户登录 (frontend_dev) [进行中]            │
│  - FEAT-002: API 设计 (backend_dev) [进行中]             │
│  - FEAT-003: 单元测试 (qa_engineer) [等待中]             │
└─────────────────────────────────────────────────────────┘
```

## 系统降级级别

| 级别 | 描述 | 状态 |
|------|------|------|
| Level 1 | Redis + SQLite | 完整功能 |
| Level 2 | Redis only | 部分功能 |
| Level 3 | SQLite only | 部分功能 |
| Level 5 | 无后端 | 降级模式 |

## 状态指示器

- ● 绿色：正常/空闲
- ● 黄色：忙碌
- ○ 红色：离线

## 文件结构

```
eket/
├── web/
│   ├── index.html        # 主页面
│   ├── styles.css        # 样式表
│   └── app.js            # 前端逻辑
├── node/
│   └── src/
│       └── api/
│           └── web-server.ts  # Web 服务器和 API
└── scripts/
    └── start-web-dashboard.sh # 启动脚本
```

## 配置选项

| 选项 | 环境变量 | 默认值 | 描述 |
|------|---------|--------|------|
| 端口 | `EKET_WEB_PORT` | 3000 | Web 服务器监听端口 |
| 主机 | `EKET_WEB_HOST` | localhost | Web 服务器监听主机 |

## 自动刷新

- 刷新间隔：5 秒
- 标签页隐藏时自动暂停
- 标签页可见时自动恢复

## 浏览器兼容性

- Chrome/Edge (推荐)
- Firefox
- Safari
- 移动端浏览器

## 故障排查

### 无法访问页面

检查 Web 服务器是否启动：
```bash
curl http://localhost:3000/api/status
```

### Redis 连接失败

确保 Redis 正在运行：
```bash
./lib/adapters/hybrid-adapter.sh redis:check
```

### 数据不刷新

检查浏览器控制台是否有错误，确认 API 端点正常响应。

## 开发调试

### 前端调试

打开浏览器开发者工具，查看 Console 和 Network 标签。

### 后端调试

查看服务器日志输出：
```bash
node dist/index.js web:dashboard --port 3000
```

## 下一步 (Phase 5.2+)

- [ ] 任务详情视图
- [ ] Instance 历史记录
- [ ] 图表和趋势分析
- [ ] WebSocket 实时推送
- [ ] 告警通知功能
- [ ] 自定义仪表盘

## 技术栈

- **前端**: 原生 HTML5 + CSS3 + Vanilla JavaScript
- **后端**: Node.js + TypeScript
- **通信**: HTTP REST API
- **设计**: 响应式布局，移动优先

---

**版本**: 0.1.0 (Phase 5.1)
**最后更新**: 2026-03-26
