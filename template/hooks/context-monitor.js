#!/usr/bin/env node
/**
 * EKET Context Monitor Hook
 *
 * 监控 Claude Code 上下文使用率，在接近阈值时发出警告
 *
 * 触发时机: PostToolUse
 *
 * 功能:
 * - 跟踪工具调用次数
 * - 估算上下文使用量
 * - 超过阈值时输出警告
 * - 记录到日志文件
 *
 * 配置 (.claude/settings.json):
 * {
 *   "hooks": {
 *     "PostToolUse": ["node template/hooks/context-monitor.js"]
 *   }
 * }
 *
 * 环境变量:
 *   EKET_CONTEXT_WARN_THRESHOLD  警告阈值 (默认: 0.7, 即 70%)
 *   EKET_CONTEXT_CRITICAL_THRESHOLD  严重阈值 (默认: 0.85, 即 85%)
 *   EKET_CONTEXT_LOG_DIR  日志目录 (默认: .eket/logs)
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────
const CONFIG = {
  warnThreshold: parseFloat(process.env.EKET_CONTEXT_WARN_THRESHOLD || '0.7'),
  criticalThreshold: parseFloat(process.env.EKET_CONTEXT_CRITICAL_THRESHOLD || '0.85'),
  logDir: process.env.EKET_CONTEXT_LOG_DIR || path.join(process.cwd(), '.eket', 'logs'),
  stateFile: path.join(process.cwd(), '.eket', 'state', 'context-monitor.json'),
  // 估算的 token 限制 (Claude 3.5 Sonnet)
  estimatedContextLimit: 200000,
  // 每种工具的估算 token 消耗
  tokenEstimates: {
    Read: 500,      // 读取文件平均 500 tokens
    Write: 200,     // 写入操作记录
    Edit: 150,      // 编辑操作记录
    Bash: 300,      // Bash 命令和输出
    WebFetch: 1000, // 网页内容
    WebSearch: 200, // 搜索结果
    Agent: 2000,    // 子 agent 调用
    default: 100,   // 其他工具
  }
};

// ─────────────────────────────────────────────
// 状态管理
// ─────────────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {
    sessionId: process.env.CLAUDE_CODE_SESSION_ID || 'unknown',
    toolCalls: 0,
    estimatedTokens: 0,
    lastWarningLevel: null,
    startTime: Date.now(),
  };
}

function saveState(state) {
  try {
    const dir = path.dirname(CONFIG.stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────
// Token 估算
// ─────────────────────────────────────────────
function estimateTokens(toolName, input) {
  const base = CONFIG.tokenEstimates[toolName] || CONFIG.tokenEstimates.default;

  // 根据输入大小调整
  let multiplier = 1;
  if (input) {
    const inputStr = JSON.stringify(input);
    if (inputStr.length > 5000) multiplier = 3;
    else if (inputStr.length > 1000) multiplier = 2;
  }

  return base * multiplier;
}

// ─────────────────────────────────────────────
// 日志
// ─────────────────────────────────────────────
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logLine = JSON.stringify({
    timestamp,
    level,
    message,
    ...data
  });

  // 输出到 stderr (Claude Code 会显示)
  if (level === 'warn' || level === 'critical') {
    console.error(`[EKET Context Monitor] ${level.toUpperCase()}: ${message}`);
  }

  // 写入日志文件
  try {
    if (!fs.existsSync(CONFIG.logDir)) {
      fs.mkdirSync(CONFIG.logDir, { recursive: true });
    }
    const logFile = path.join(CONFIG.logDir, 'context-monitor.log');
    fs.appendFileSync(logFile, logLine + '\n');
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────
// 警告检查
// ─────────────────────────────────────────────
function checkThresholds(state) {
  const usage = state.estimatedTokens / CONFIG.estimatedContextLimit;

  if (usage >= CONFIG.criticalThreshold && state.lastWarningLevel !== 'critical') {
    state.lastWarningLevel = 'critical';
    log('critical', `上下文使用率 ${(usage * 100).toFixed(1)}% - 建议执行 /compact 或完成当前任务`, {
      usage: usage,
      estimatedTokens: state.estimatedTokens,
      toolCalls: state.toolCalls,
    });

    // 输出建议
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠️  上下文即将溢出！                                          ║');
    console.error('╠═══════════════════════════════════════════════════════════════╣');
    console.error(`║  当前使用: ${(usage * 100).toFixed(1)}%                                              ║`);
    console.error('║  建议操作:                                                    ║');
    console.error('║    1. 完成当前子任务并提交                                    ║');
    console.error('║    2. 运行 /compact 压缩上下文                                ║');
    console.error('║    3. 开启新会话继续工作                                      ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    console.error('');

  } else if (usage >= CONFIG.warnThreshold && state.lastWarningLevel !== 'warn' && state.lastWarningLevel !== 'critical') {
    state.lastWarningLevel = 'warn';
    log('warn', `上下文使用率 ${(usage * 100).toFixed(1)}% - 注意控制任务范围`, {
      usage: usage,
      estimatedTokens: state.estimatedTokens,
      toolCalls: state.toolCalls,
    });

    console.error('');
    console.error(`[EKET] ⚠️ 上下文使用率: ${(usage * 100).toFixed(1)}% - 建议尽快完成当前任务`);
    console.error('');
  }

  return state;
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
function main() {
  // 从 stdin 读取 hook 输入
  let input = '';

  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (chunk) => {
    input += chunk;
  });

  process.stdin.on('end', () => {
    try {
      const hookData = input ? JSON.parse(input) : {};
      const toolName = hookData.tool_name || hookData.toolName || 'unknown';
      const toolInput = hookData.tool_input || hookData.input || {};

      // 加载状态
      let state = loadState();

      // 检查是否是新会话
      const currentSession = process.env.CLAUDE_CODE_SESSION_ID || 'unknown';
      if (state.sessionId !== currentSession) {
        state = {
          sessionId: currentSession,
          toolCalls: 0,
          estimatedTokens: 0,
          lastWarningLevel: null,
          startTime: Date.now(),
        };
      }

      // 更新统计
      state.toolCalls++;
      state.estimatedTokens += estimateTokens(toolName, toolInput);

      // 检查阈值
      state = checkThresholds(state);

      // 保存状态
      saveState(state);

      // 输出 hook 结果 (允许继续执行)
      console.log(JSON.stringify({
        hookSpecificOutput: {
          contextUsage: (state.estimatedTokens / CONFIG.estimatedContextLimit * 100).toFixed(1) + '%',
          toolCalls: state.toolCalls,
        }
      }));

    } catch (err) {
      // Hook 失败不应阻止操作
      console.error(`[EKET Context Monitor] Error: ${err.message}`);
      console.log(JSON.stringify({ hookSpecificOutput: { error: err.message } }));
    }
  });
}

main();
