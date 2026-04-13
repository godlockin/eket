/**
 * Master Poll Command
 *
 * Master 轮询脚本 - 定期检查 PR、仲裁请求和人类通知
 * 版本：v2.1.4
 *
 * 功能：
 * 1. 检查 PR 队列
 * 2. 检查仲裁请求
 * 3. 检查人类反馈
 * 4. 检查 Slaver 状态
 * 5. 更新项目状态
 * 6. 更新心跳
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { printError, logInfo, logWarning } from '../utils/error-handler.js';

// Color codes
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

interface MasterStatus {
  instanceId: string;
  status: 'idle' | 'working' | 'waiting_human';
  pendingPrs: number;
  pendingArbitrations: number;
  pendingHumanDecisions: number;
}

interface PollConfig {
  pollInterval: number;
  idlePollInterval: number;
  workPollInterval: number;
  once: boolean;
}

/**
 * 获取 Master 实例信息
 */
function getMasterInstanceInfo(): { instanceId: string; role: string } {
  const stateDir = '.eket/state';
  const configPath = path.join(stateDir, 'instance_config.yml');

  let instanceId = 'unknown';
  let role = 'unknown';

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const instanceIdMatch = content.match(/instance_id:\s*(\S+)/);
    const roleMatch = content.match(/role:\s*(\S+)/);

    if (instanceIdMatch) instanceId = instanceIdMatch[1];
    if (roleMatch) role = roleMatch[1];
  }

  return { instanceId, role };
}

/**
 * 检查 Master 状态
 */
function checkMasterStatus(): MasterStatus {
  const { instanceId } = getMasterInstanceInfo();

  let status: MasterStatus['status'] = 'idle';
  let pendingPrs = 0;
  let pendingArbitrations = 0;
  let pendingHumanDecisions = 0;

  // 检查 PR 队列
  const reviewDir = 'outbox/review_requests';
  if (fs.existsSync(reviewDir)) {
    const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.md'));
    pendingPrs = files.length;
    if (pendingPrs > 0) {
      status = 'working';
    }
  }

  // 检查仲裁请求
  const blockerDir = 'inbox/blocker_reports';
  if (fs.existsSync(blockerDir)) {
    const files = fs.readdirSync(blockerDir).filter(f => f.endsWith('.md'));
    pendingArbitrations = files.length;
    if (pendingArbitrations > 0) {
      status = 'working';
    }
  }

  // 检查人类反馈
  const feedbackDir = 'inbox/human_feedback';
  if (fs.existsSync(feedbackDir)) {
    const files = fs.readdirSync(feedbackDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const filePath = path.join(feedbackDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('## 人类反馈') && !content.includes('状态：processed')) {
        pendingHumanDecisions++;
        status = 'waiting_human';
      }
    }
  }

  // 检查人类需求输入
  const humanInputPath = 'inbox/human_input.md';
  if (fs.existsSync(humanInputPath)) {
    const content = fs.readFileSync(humanInputPath, 'utf-8');
    if (content.includes('## 需求描述') && !content.includes('状态：processed')) {
      pendingHumanDecisions++;
      status = 'waiting_human';
    }
  }

  return {
    instanceId,
    status,
    pendingPrs,
    pendingArbitrations,
    pendingHumanDecisions,
  };
}

/**
 * 检查 PR 队列
 */
function checkPrQueue(): number {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查 PR 队列...');

  const reviewDir = 'outbox/review_requests';
  let pendingPrCount = 0;

  if (fs.existsSync(reviewDir)) {
    const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.md'));
    pendingPrCount = files.length;

    if (pendingPrCount > 0) {
      logInfo(`发现 ${pendingPrCount} 个待审核 PR`);

      // 检查超时 PR
      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(reviewDir, file);
        const stat = fs.statSync(filePath);
        const age = Math.floor((now - stat.mtimeMs) / 60000); // 分钟

        if (age > 30) {
          logWarning(`PR ${file} 已等待 ${age} 分钟`);
        }
      }

      console.log('');
      console.log('┌──────────────────────────────────────────────────────────────┐');
      console.log('│  待审核 PR 列表                                                 │');
      console.log('├──────────────────────────────────────────────────────────────┤');

      for (const file of files) {
        const ticketId = file.replace('pr_', '').split('_')[0];
        console.log(`│  ${file}`);
        console.log(`│    Ticket: ${ticketId}`);
      }

      console.log('└──────────────────────────────────────────────────────────────┘');
    } else {
      logInfo('PR 队列为空');
    }
  } else {
    logWarning('PR 队列目录不存在');
  }

  return pendingPrCount;
}

/**
 * 检查仲裁请求
 */
function checkArbitrationRequests(): number {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查仲裁请求...');

  const blockerDir = 'inbox/blocker_reports';
  let pendingCount = 0;

  if (fs.existsSync(blockerDir)) {
    const files = fs.readdirSync(blockerDir).filter(f => f.endsWith('.md'));
    pendingCount = files.length;

    if (pendingCount > 0) {
      logWarning(`发现 ${pendingCount} 个阻塞报告`);

      console.log('');
      console.log('┌──────────────────────────────────────────────────────────────┐');
      console.log('│  阻塞报告列表                                                 │');
      console.log('├──────────────────────────────────────────────────────────────┤');

      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(blockerDir, file);
        const stat = fs.statSync(filePath);
        const age = Math.floor((now - stat.mtimeMs) / 60000); // 分钟

        console.log(`│  ${COLORS.red}${file}${COLORS.reset}`);
        console.log(`│    等待时间：${age} 分钟`);

        if (age > 30) {
          console.log('│    ${COLORS.red}⚠ 超时警告：超过 30 分钟未处理${COLORS.reset}');
        }
        console.log('');
      }

      console.log('└──────────────────────────────────────────────────────────────┘');
    } else {
      logInfo('无阻塞报告');
    }
  } else {
    logInfo('阻塞报告目录不存在');
  }

  return pendingCount;
}

/**
 * 检查人类反馈
 */
function checkHumanFeedback(): number {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查人类反馈...');

  let pendingCount = 0;

  // 检查人类回复
  const feedbackDir = 'inbox/human_feedback';
  if (fs.existsSync(feedbackDir)) {
    const files = fs.readdirSync(feedbackDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(feedbackDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (content.includes('## 人类反馈') && !content.includes('状态：processed')) {
        pendingCount++;
        logInfo(`发现待处理的人类反馈：${file}`);
      }
    }
  }

  // 检查人类需求输入
  const humanInputPath = 'inbox/human_input.md';
  if (fs.existsSync(humanInputPath)) {
    const content = fs.readFileSync(humanInputPath, 'utf-8');
    if (content.includes('## 需求描述') && !content.includes('状态：processed')) {
      logInfo('发现新的需求输入');
      pendingCount++;
    }
  }

  if (pendingCount === 0) {
    logInfo('无待处理的人类反馈');
  }

  return pendingCount;
}

/**
 * 检查 Slaver 状态
 */
function checkSlaverStatus(): void {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查 Slaver 状态...');

  const slaversDir = '.eket/state/slavers';
  if (!fs.existsSync(slaversDir)) {
    logInfo('Slaver 目录不存在');
    return;
  }

  const files = fs.readdirSync(slaversDir).filter(f => f.endsWith('.yml'));
  let idleCount = 0;
  let busyCount = 0;
  const now = Date.now();

  for (const file of files) {
    const filePath = path.join(slaversDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    const statusMatch = content.match(/status:\s*(\S+)/);
    const status = statusMatch ? statusMatch[1] : 'unknown';

    if (status === 'idle') idleCount++;
    if (status === 'busy' || status === 'working' || status === 'active') busyCount++;

    // 检查超时
    const stat = fs.statSync(filePath);
    const age = Math.floor((now - stat.mtimeMs) / 60000); // 分钟

    if (age > 30) {
      const slaverId = file.replace('.yml', '');
      logWarning(`Slaver ${slaverId} 超过 30 分钟无更新`);
    }
  }

  if (idleCount > 0) {
    logWarning(`发现 ${idleCount} 个空闲 Slaver`);
  }
  if (busyCount > 0) {
    logInfo(`有 ${busyCount} 个 Slaver 正在工作`);
  }
}

/**
 * 更新项目状态
 */
function updateProjectStatus(): void {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 更新项目状态...');

  const stateDir = 'jira/state';
  fs.mkdirSync(stateDir, { recursive: true });

  const now = new Date().toISOString();

  // 更新项目状态报告
  const statusContent = `# 项目状态报告
# 生成于：${now}

last_updated: ${now}

slavers:
  active: []
  idle: []
  busy: []

cards:
  milestones: []
  sprints: []
  epics: []
  tickets: []

progress:
  sprint_target: null
  deadline: null
  days_remaining: null
  completed: 0
  total: 0
  completion_rate: 0%

risks: []
action_items: []
`;

  fs.writeFileSync(path.join(stateDir, 'project-status.yml'), statusContent, 'utf-8');
  logInfo('项目状态已更新');
}

/**
 * 更新心跳
 */
function updateHeartbeat(instanceId: string, status: MasterStatus): void {
  const stateDir = '.eket/state';
  fs.mkdirSync(stateDir, { recursive: true });

  const now = new Date().toISOString();
  const heartbeatContent = `# Master 心跳
instance_id: ${instanceId}
last_check: ${now}
status: ${status.status}
pending_prs: ${status.pendingPrs}
pending_arbitrations: ${status.pendingArbitrations}
pending_human_decisions: ${status.pendingHumanDecisions}
`;

  fs.writeFileSync(path.join(stateDir, `master_${instanceId}_heartbeat.yml`), heartbeatContent, 'utf-8');
}

/**
 * 显示轮询摘要
 */
function showPollSummary(status: MasterStatus, config: PollConfig): void {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Master 轮询摘要                                              │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  状态：${status.status}`);
  console.log(`│  PR 待审核：${status.pendingPrs} 个`);
  console.log(`│  仲裁请求：${status.pendingArbitrations} 个`);
  console.log(`│  人类反馈：${status.pendingHumanDecisions} 个`);
  console.log(`│  轮询间隔：${config.idlePollInterval}秒 (空闲) / ${config.workPollInterval}秒 (工作中)`);
  console.log('└──────────────────────────────────────────────────────────────┘');
}

/**
 * 执行一轮检查
 */
function runSingleCheck(instanceId: string): MasterStatus {
  const status = checkMasterStatus();

  checkPrQueue();
  console.log('');
  checkArbitrationRequests();
  console.log('');
  checkHumanFeedback();
  console.log('');
  checkSlaverStatus();
  console.log('');
  updateProjectStatus();

  updateHeartbeat(instanceId, status);

  return status;
}

/**
 * 主轮询循环
 */
async function runPollLoop(config: PollConfig): Promise<void> {
  const { instanceId } = getMasterInstanceInfo();

  logInfo('Master 轮询启动');
  logInfo(`实例 ID: ${instanceId}`);
  console.log('');

  let iteration = 0;

  while (true) {
    iteration++;

    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    logInfo(`轮询 #${iteration} 开始`);
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');

    const status = runSingleCheck(instanceId);

    // 根据状态调整轮询间隔
    let currentInterval = config.pollInterval;
    switch (status.status) {
      case 'idle':
        currentInterval = config.idlePollInterval;
        break;
      case 'working':
        currentInterval = config.workPollInterval;
        break;
      case 'waiting_human':
        currentInterval = 10; // 等待人类时快速响应
        break;
    }

    showPollSummary(status, config);

    console.log('');
    logInfo(`等待 ${currentInterval} 秒后进行下一轮检查...`);
    console.log('');

    await new Promise(resolve => setTimeout(resolve, currentInterval * 1000));
  }
}

/**
 * 注册 Master Poll 命令
 */
export function registerMasterPoll(program: Command): void {
  program
    .command('master:poll')
    .description('启动 Master 轮询（定期 PR/仲裁/人类反馈检查）')
    .option('-i, --interval <seconds>', 'Base poll interval in seconds', '10')
    .option('--idle-interval <seconds>', 'Idle poll interval in seconds', '600')
    .option('--work-interval <seconds>', 'Working poll interval in seconds', '300')
    .option('--once', 'Run once and exit')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli master:poll                      # Start polling with defaults
  $ eket-cli master:poll -i 30                # 30 seconds base interval
  $ eket-cli master:poll --once               # Run once and exit
  $ eket-cli master:poll --idle-interval 600  # 10 minutes idle interval

Environment Variables:
  EKET_MASTER_POLL_INTERVAL       Base poll interval (seconds)
  EKET_MASTER_IDLE_POLL_INTERVAL  Idle poll interval (seconds)
  EKET_MASTER_WORK_POLL_INTERVAL  Working poll interval (seconds)

Related Commands:
  $ eket-cli master:review-pr                   # Review a specific PR
  $ eket-cli slaver:poll                        # Slaver polling command
`
    )
    .action(async (options) => {
      const config: PollConfig = {
        pollInterval: parseInt(process.env.EKET_MASTER_POLL_INTERVAL || options.interval, 10),
        idlePollInterval: parseInt(process.env.EKET_MASTER_IDLE_POLL_INTERVAL || options.idleInterval, 10),
        workPollInterval: parseInt(process.env.EKET_MASTER_WORK_POLL_INTERVAL || options.workInterval, 10),
        once: options.once,
      };

      // 检查角色
      const { role } = getMasterInstanceInfo();
      if (role !== 'master') {
        printError({
          code: 'INVALID_ROLE',
          message: '当前实例不是 Master 角色',
          solutions: [
            'Run instance:start with --role master',
            'Check .eket/state/instance_config.yml for current role',
          ],
        });
        console.log(`当前角色：${role}`);
        process.exit(1);
      }

      if (config.once) {
        const { instanceId } = getMasterInstanceInfo();
        const status = runSingleCheck(instanceId);
        showPollSummary(status, config);
      } else {
        await runPollLoop(config);
      }
    });
}
