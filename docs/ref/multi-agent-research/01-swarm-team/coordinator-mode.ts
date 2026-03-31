/**
 * 来源: src/coordinator/coordinatorMode.ts
 *
 * Coordinator 模式：通过环境变量 CLAUDE_CODE_COORDINATOR_MODE 激活。
 *
 * 关键设计：
 * 1. Coordinator 专属高权限工具集（Worker 没有）：
 *    - TeamCreate / TeamDelete：团队生命周期管理
 *    - SendMessage：广播或单播给 teammate
 *    - SyntheticOutput：合成输出工具
 *
 * 2. Worker 工具集受限：只能做具体执行（Bash/Read/Edit/Agent/...）
 *    不能操控团队结构
 *
 * 3. 支持会话恢复时的模式匹配（matchSessionMode）
 *
 * 对你的价值：
 * - 将此模式扩展为你的"角色权限分层"基础
 * - Coordinator = 你的 orchestrator
 * - INTERNAL_WORKER_TOOLS = 你的管理平面，普通 worker 不可触碰
 */

// Coordinator 独享的"管理平面"工具（Worker 不可使用）
const INTERNAL_WORKER_TOOLS = new Set([
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'SyntheticOutput',
])

export function isCoordinatorMode(): boolean {
  // 通过环境变量动态激活，支持运行时切换
  return isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
}

/**
 * 会话恢复时检查模式是否匹配，不一致则自动修正。
 * 返回警告信息（如切换发生），或 undefined（无需切换）。
 */
export function matchSessionMode(
  sessionMode: 'coordinator' | 'normal' | undefined,
): string | undefined {
  if (!sessionMode) return undefined

  const currentIsCoordinator = isCoordinatorMode()
  const sessionIsCoordinator = sessionMode === 'coordinator'

  if (currentIsCoordinator === sessionIsCoordinator) return undefined

  // 直接修改 env var — isCoordinatorMode() 每次都实时读取，无缓存问题
  if (sessionIsCoordinator) {
    process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
  } else {
    delete process.env.CLAUDE_CODE_COORDINATOR_MODE
  }

  return sessionIsCoordinator
    ? 'Entered coordinator mode to match resumed session.'
    : 'Exited coordinator mode to match resumed session.'
}

/**
 * 生成注入 Coordinator 上下文的 system prompt 片段。
 * 告知 Coordinator：Worker 有哪些工具、MCP 服务器、Scratchpad 目录。
 */
export function getCoordinatorUserContext(
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
): { [k: string]: string } {
  if (!isCoordinatorMode()) return {}

  // Worker 可用工具 = 全部工具 - 管理平面工具
  const workerTools = Array.from(ASYNC_AGENT_ALLOWED_TOOLS)
    .filter(name => !INTERNAL_WORKER_TOOLS.has(name))
    .sort()
    .join(', ')

  let content = `Workers spawned via the Agent tool have access to these tools: ${workerTools}`

  if (mcpClients.length > 0) {
    const serverNames = mcpClients.map(c => c.name).join(', ')
    content += `\n\nWorkers also have access to MCP tools from connected MCP servers: ${serverNames}`
  }

  if (scratchpadDir) {
    // Scratchpad：跨 Worker 的共享持久化目录，无需权限提示
    content += `\n\nScratchpad directory: ${scratchpadDir}\nWorkers can read and write here without permission prompts. Use this for durable cross-worker knowledge — structure files however fits the work.`
  }

  return { workerToolsContext: content }
}

/**
 * Coordinator 的完整 System Prompt（精简版，完整版见源文件）
 *
 * 关键设计决策（值得借鉴）：
 *
 * 1. "Worker 结果以 <task-notification> XML 形式作为 user 消息送达"
 *    → 统一了异步结果的消息格式，避免 coordinator 混淆用户输入和 worker 输出
 *
 * 2. "并行是你的超能力。Worker 是异步的。"
 *    → 明确鼓励 fan-out，读操作自由并行，写操作单文件串行
 *
 * 3. "Continue vs Spawn" 决策矩阵：
 *    - 高上下文重叠 → Continue (SendMessage)
 *    - 低上下文重叠 → Spawn (Agent)
 *    → 这是 token 效率和上下文污染之间的核心权衡
 *
 * 4. "永远不要写'基于你的发现' —— 自己综合理解"
 *    → 防止 coordinator 把理解责任推回给 worker（Telephone Game 问题）
 */
export const COORDINATOR_SYSTEM_PROMPT_EXCERPT = `
You are a coordinator. Your job is to:
- Help the user achieve their goal
- Direct workers to research, implement and verify code changes
- Synthesize results and communicate with the user

## Worker Result Format
Worker results arrive as user-role messages containing <task-notification> XML:

<task-notification>
  <task-id>{agentId}</task-id>
  <status>completed|failed|killed</status>
  <summary>{human-readable status summary}</summary>
  <result>{agent's final text response}</result>
  <usage>
    <total_tokens>N</total_tokens>
    <tool_uses>N</tool_uses>
    <duration_ms>N</duration_ms>
  </usage>
</task-notification>

## Concurrency Rules
- Read-only tasks (research): run in parallel freely
- Write-heavy tasks (implementation): one at a time per file set
- Verification: can run alongside implementation on different areas

## Continue vs Spawn Decision
| Situation                              | Mechanism | Why                                      |
|----------------------------------------|-----------|------------------------------------------|
| Research explored exactly target files | Continue  | Worker has files in context + clear plan |
| Research broad, implementation narrow  | Spawn     | Avoid dragging exploration noise         |
| Correcting failure / extending work    | Continue  | Worker has error context                 |
| Verifying code another worker wrote    | Spawn     | Fresh eyes, no implementation bias       |
`
