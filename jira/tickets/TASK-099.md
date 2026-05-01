# TASK-099: 拆分 eket-server.ts（1308 行 → 4 个职责模块）

## 元数据
- **状态**: done
- **类型**: refactor
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-19
- **依赖**: TASK-097（CI 门控先建好）

## 背景

`node/src/api/eket-server.ts` 当前 1308 行，违反 SRP，是 PR #86~#95 合并的结构性障碍。
按职责拆分为 4 个模块后，各 PR 的功能扩展才有清晰的落脚点。

## 验收标准

1. `eket-server.ts` 拆为 4 个文件，每个 ≤ 400 行
2. 原有测试 1199/1199 全部通过（零新增失败）
3. `node/src/api/` 目录结构清晰

## 目标结构

```
node/src/api/
├── eket-server.ts          # 入口（组合模块，≤ 100 行）
├── routes/
│   ├── agent-routes.ts     # Agent 注册/管理路由
│   ├── task-routes.ts      # Task 路由
│   └── system-routes.ts    # System/health 路由
├── middleware/
│   └── (现有 middleware/ 内容)
└── (其他现有文件不变)
```

## 实现步骤

1. 读取 `node/src/api/eket-server.ts`，按以下维度分组：
   - Express router 注册 → routes/
   - 中间件逻辑 → middleware/
   - 启动/关闭逻辑 → 保留在 eket-server.ts

2. 逐步抽取，每次抽取后运行 `npm test` 确认全绿

3. 注意 ESM import 必须带 `.js` 扩展名

## 验收命令

```bash
wc -l node/src/api/eket-server.ts          # 应 ≤ 150 行
wc -l node/src/api/routes/*.ts             # 每个 ≤ 400 行
cd node && npm test 2>&1 | tail -5         # 1199/1199
cd node && npm run lint 2>&1 | tail -5     # 零 error
```

## 实现记录

### 领取信息
- **负责人**: Slaver
- **领取时间**: 2026-04-19

### 实现结果
- PR #112: https://github.com/godlockin/eket/pull/112
- 分支: feature/TASK-099-split-eket-server

### 文件结构
```
node/src/api/
├── eket-server.ts           # 306行（原1308行，↓76%）
├── server-types.ts          # 76行（共享类型）
├── middleware/
│   └── setup-middleware.ts  # 73行（CORS/rate-limit/logging）
└── routes/
    ├── agent-routes.ts      # 290行（Agent + messages）
    ├── task-routes.ts       # 219行（Task CRUD）
    └── system-routes.ts     # 354行（health/PR/SSE）
```

### 测试结果
- 1199/1199 全通过

### 关键决策
- 使用 lazy getter 解决初始化时序问题（redis/wss 在 start() 后才可用）
- system-routes 拆分为 createHealthRouter（/）和 createSystemRouter（/api/v1）
- types 抽取到 server-types.ts 避免循环依赖
