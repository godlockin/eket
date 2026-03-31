/**
 * 来源: src/utils/swarm/reconnection.ts
 *
 * Swarm 重连模块：处理 teammate 的团队上下文初始化。
 * - 全新生成：从 CLI args 初始化（main.tsx 中设置 dynamicTeamContext）
 * - 会话恢复：从转录文件中存储的 teamName/agentName 初始化
 *
 * 关键设计：computeInitialTeamContext 在首次 render 前同步调用，
 * 避免 useEffect 中的异步初始化导致的竞态问题。
 */

export function computeInitialTeamContext():
  | AppState['teamContext']
  | undefined {
  // dynamicTeamContext 由 main.tsx 从 CLI args 设置
  const context = getDynamicTeamContext()

  if (!context?.teamName || !context?.agentName) {
    return undefined  // 不是 teammate 模式
  }

  const { teamName, agentId, agentName } = context

  // 读取 team file 获取 leadAgentId
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    logError(new Error(`Could not read team file for ${teamName}`))
    return undefined
  }

  const teamFilePath = getTeamFilePath(teamName)
  const isLeader = !agentId  // 没有 agentId 意味着是 leader

  return {
    teamName,
    teamFilePath,
    leadAgentId: teamFile.leadAgentId,
    agentId: agentId ?? teamFile.leadAgentId,
    agentName,
    isLeader,
  }
}
