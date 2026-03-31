/**
 * 来源: src/utils/swarm/teamHelpers.ts
 *
 * TeamFile 是 Agent 团队的核心数据结构，存储于：
 * ~/.claude/teams/{team_name}/config.json
 *
 * 设计要点：
 * - leadAgentId + leadSessionId 双重标识，支持会话恢复后的领队发现
 * - members 中每个 Agent 独立指定 model / prompt / permissionMode
 * - teamAllowedPaths 实现团队级别的权限白名单（无需逐次审批）
 * - hiddenPaneIds 用于 UI 管理，与逻辑状态解耦
 */

import type { BackendType } from '../swarm/backends/types.js'
import type { PermissionMode } from '../permissions/PermissionMode.js'

export type TeamAllowedPath = {
  path: string        // 绝对路径
  toolName: string    // 适用工具，如 "Edit", "Write"
  addedBy: string     // 添加此规则的 Agent 名
  addedAt: number     // 时间戳
}

export type TeamFile = {
  name: string
  description?: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string      // 领队实际 Session UUID（用于发现）
  hiddenPaneIds?: string[]    // 当前隐藏的 UI 面板 ID
  teamAllowedPaths?: TeamAllowedPath[]  // 所有 teammate 无需单独审批即可写的路径
  members: Array<{
    agentId: string
    name: string
    agentType?: string        // 角色类型，如 "researcher", "test-runner"
    model?: string            // 可独立指定模型
    prompt?: string           // 角色专属 system prompt
    color?: string            // UI 显示颜色
    planModeRequired?: boolean  // 是否强制要求 plan 模式
    joinedAt: number
    tmuxPaneId: string
    cwd: string
    worktreePath?: string
    sessionId?: string
    subscriptions: string[]
    backendType?: BackendType
    isActive?: boolean        // false when idle, undefined/true when active
    mode?: PermissionMode     // 该 teammate 当前的权限模式
  }>
}

// ─── 常量 ────────────────────────────────────────────────────────────────────
// 来源: src/utils/swarm/constants.ts

export const TEAM_LEAD_NAME = 'team-lead'
export const SWARM_SESSION_NAME = 'claude-swarm'
export const SWARM_VIEW_WINDOW_NAME = 'swarm-view'
export const TMUX_COMMAND = 'tmux'
export const HIDDEN_SESSION_NAME = 'claude-hidden'

/** 隔离多个 Claude 实例的 tmux socket 名（含 PID 防冲突） */
export function getSwarmSocketName(): string {
  return `claude-swarm-${process.pid}`
}

/** 允许通过环境变量覆盖 teammate 的启动命令（测试/自定义环境） */
export const TEAMMATE_COMMAND_ENV_VAR = 'CLAUDE_CODE_TEAMMATE_COMMAND'

/** 传给 teammate 进程的颜色标识（用于彩色输出和面板识别） */
export const TEAMMATE_COLOR_ENV_VAR = 'CLAUDE_CODE_AGENT_COLOR'

/** 设置为 'true' 时，teammate 必须进入 plan 模式并获批后才能写代码 */
export const PLAN_MODE_REQUIRED_ENV_VAR = 'CLAUDE_CODE_PLAN_MODE_REQUIRED'

// ─── 路径工具函数 ──────────────────────────────────────────────────────────────

/** 清理名称，用于 tmux window name / worktree path / 文件路径 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

/** 清理 Agent 名，防止 agentName@teamName 格式中的歧义 */
export function sanitizeAgentName(name: string): string {
  return name.replace(/@/g, '-')
}

export function getTeamDir(teamName: string): string {
  return join(getTeamsDir(), sanitizeName(teamName))
}

export function getTeamFilePath(teamName: string): string {
  return join(getTeamDir(teamName), 'config.json')
}
