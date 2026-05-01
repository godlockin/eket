# 三级降级模式（Shell → Node.js → Redis+SQLite）

**场景**：框架需要在不同环境（仅 bash、有 Node.js、有 Redis）下都能运行  
**方案**：  
1. **Level 1 — Shell**：纯 bash 脚本，零依赖，任何 POSIX 环境可用  
   - 读写 `jira/tickets/*.md` 文件作为任务队列  
   - 用文件锁（`flock`）防止并发冲突  
2. **Level 2 — Node.js**：TypeScript + ESM，提供 CLI 工具和 HTTP Dashboard  
   - 自动检测 Node.js 可用性，降级到 Shell  
   - `node dist/index.js system:doctor` 诊断当前级别  
3. **Level 3 — Redis+SQLite**：分布式任务队列 + 持久化状态  
   - 仅在 `EKET_REDIS_HOST` 可达时激活  
   - 断路器防止 Redis 故障级联  

**关键规则**：  
- 每级必须在上级不可用时优雅降级，不抛出异常  
- 配置通过环境变量切换，代码中不硬编码级别  
- `system:doctor` 命令必须反映当前实际运行级别  

**来源**：EKET 架构设计（CLAUDE.md §项目简介）
