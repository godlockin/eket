#!/usr/bin/env node
/**
 * EKET Read Guard Hook
 *
 * 防止"盲改"问题：编辑文件前必须先读取
 *
 * 触发时机: PreToolUse (Edit, Write, NotebookEdit)
 *
 * 功能:
 * - 跟踪会话中已读取的文件
 * - 编辑前检查是否已读取
 * - 未读取时发出警告（可配置为阻止）
 *
 * 配置 (.claude/settings.json):
 * {
 *   "hooks": {
 *     "PreToolUse": ["node template/hooks/read-guard.js"]
 *   }
 * }
 *
 * 环境变量:
 *   EKET_READ_GUARD_MODE      模式: warn (默认) | block | off
 *   EKET_READ_GUARD_WHITELIST 白名单路径正则 (逗号分隔)
 */

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────
const CONFIG = {
  mode: process.env.EKET_READ_GUARD_MODE || 'warn', // warn | block | off
  stateFile: path.join(process.cwd(), '.eket', 'state', 'read-guard.json'),
  logFile: path.join(process.cwd(), '.eket', 'logs', 'read-guard.log'),
  // 白名单：这些文件可以不先读取就编辑
  whitelist: (process.env.EKET_READ_GUARD_WHITELIST || '')
    .split(',')
    .filter(Boolean)
    .concat([
      /\.eket\/state\//,      // 状态文件
      /\.eket\/logs\//,       // 日志文件
      /node_modules\//,       // node_modules
      /\.git\//,              // git 目录
      /package-lock\.json$/,  // lock 文件
      /yarn\.lock$/,
      /\.env$/,               // 环境变量
      /\.env\.local$/,
    ]),
  // 需要检查的工具
  editTools: ['Edit', 'Write', 'NotebookEdit'],
  // 读取工具
  readTools: ['Read'],
};

// ─────────────────────────────────────────────
// 状态管理
// ─────────────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      const state = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8'));
      // 检查是否是同一会话
      if (state.sessionId === process.env.CLAUDE_CODE_SESSION_ID) {
        return state;
      }
    }
  } catch {
    // ignore
  }
  return {
    sessionId: process.env.CLAUDE_CODE_SESSION_ID || 'unknown',
    readFiles: [],  // 已读取的文件路径
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
// 日志
// ─────────────────────────────────────────────
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logLine = JSON.stringify({ timestamp, level, message, ...data });

  try {
    const dir = path.dirname(CONFIG.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(CONFIG.logFile, logLine + '\n');
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────
// 路径规范化
// ─────────────────────────────────────────────
function normalizePath(filePath) {
  if (!filePath) return '';
  // 转换为绝对路径
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  // 规范化路径分隔符
  return abs.replace(/\\/g, '/');
}

// ─────────────────────────────────────────────
// 白名单检查
// ─────────────────────────────────────────────
function isWhitelisted(filePath) {
  const normalized = normalizePath(filePath);

  for (const pattern of CONFIG.whitelist) {
    if (pattern instanceof RegExp) {
      if (pattern.test(normalized)) return true;
    } else if (typeof pattern === 'string') {
      if (normalized.includes(pattern)) return true;
    }
  }

  return false;
}

// ─────────────────────────────────────────────
// 主检查逻辑
// ─────────────────────────────────────────────
function checkReadGuard(toolName, toolInput, state) {
  // 跳过非编辑工具
  if (!CONFIG.editTools.includes(toolName)) {
    return { allowed: true };
  }

  // 获取文件路径
  const filePath = toolInput.file_path || toolInput.filePath || toolInput.path || '';
  if (!filePath) {
    return { allowed: true };
  }

  const normalizedPath = normalizePath(filePath);

  // 检查白名单
  if (isWhitelisted(normalizedPath)) {
    return { allowed: true, reason: 'whitelisted' };
  }

  // 检查是否已读取
  const wasRead = state.readFiles.some(readPath => {
    const normalizedRead = normalizePath(readPath);
    return normalizedRead === normalizedPath;
  });

  if (wasRead) {
    return { allowed: true, reason: 'already_read' };
  }

  // 检查文件是否存在（新文件可以不先读取）
  const fileExists = fs.existsSync(filePath);
  if (!fileExists && toolName === 'Write') {
    return { allowed: true, reason: 'new_file' };
  }

  // 未读取就编辑
  return {
    allowed: false,
    reason: 'not_read',
    filePath: normalizedPath,
  };
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
function main() {
  // 关闭模式
  if (CONFIG.mode === 'off') {
    console.log(JSON.stringify({ hookSpecificOutput: { mode: 'off' } }));
    return;
  }

  let input = '';
  process.stdin.setEncoding('utf-8');

  process.stdin.on('data', (chunk) => {
    input += chunk;
  });

  process.stdin.on('end', () => {
    try {
      const hookData = input ? JSON.parse(input) : {};
      const toolName = hookData.tool_name || hookData.toolName || '';
      const toolInput = hookData.tool_input || hookData.input || {};

      // 加载状态
      let state = loadState();

      // 如果是读取操作，记录文件
      if (CONFIG.readTools.includes(toolName)) {
        const filePath = toolInput.file_path || toolInput.filePath || '';
        if (filePath) {
          const normalized = normalizePath(filePath);
          if (!state.readFiles.includes(normalized)) {
            state.readFiles.push(normalized);
            saveState(state);
          }
        }
        console.log(JSON.stringify({
          hookSpecificOutput: {
            action: 'tracked_read',
            totalReads: state.readFiles.length,
          }
        }));
        return;
      }

      // 检查编辑操作
      const result = checkReadGuard(toolName, toolInput, state);

      if (!result.allowed) {
        const message = `文件 "${path.basename(result.filePath)}" 尚未读取，建议先 Read 再 ${toolName}`;

        log('warn', message, {
          tool: toolName,
          filePath: result.filePath,
          mode: CONFIG.mode,
        });

        if (CONFIG.mode === 'block') {
          // 阻止模式：返回错误
          console.error('');
          console.error('╔═══════════════════════════════════════════════════════════════╗');
          console.error('║  🛡️  Read Guard: 编辑被阻止                                    ║');
          console.error('╠═══════════════════════════════════════════════════════════════╣');
          console.error(`║  文件: ${path.basename(result.filePath).substring(0, 50).padEnd(50)} ║`);
          console.error('║  原因: 文件尚未读取，可能导致盲改                             ║');
          console.error('║  解决: 请先运行 Read 工具读取文件内容                         ║');
          console.error('╚═══════════════════════════════════════════════════════════════╝');
          console.error('');

          // 返回阻止信号
          console.log(JSON.stringify({
            hookSpecificOutput: {
              blocked: true,
              reason: 'not_read_first',
              message: message,
            }
          }));
        } else {
          // 警告模式：输出警告但允许继续
          console.error('');
          console.error(`[EKET Read Guard] ⚠️ ${message}`);
          console.error(`[EKET Read Guard] 提示: 先读取文件可避免覆盖重要内容`);
          console.error('');

          console.log(JSON.stringify({
            hookSpecificOutput: {
              warning: true,
              reason: 'not_read_first',
              message: message,
            }
          }));
        }
      } else {
        console.log(JSON.stringify({
          hookSpecificOutput: {
            allowed: true,
            reason: result.reason || 'ok',
          }
        }));
      }

    } catch (err) {
      console.error(`[EKET Read Guard] Error: ${err.message}`);
      // 出错时不阻止操作
      console.log(JSON.stringify({
        hookSpecificOutput: {
          error: err.message,
          allowed: true,
        }
      }));
    }
  });
}

main();
