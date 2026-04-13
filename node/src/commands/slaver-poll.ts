/**
 * Slaver Poll Command
 *
 * Slaver 轮询脚本 - 定期检查任务、PR 反馈和消息队列
 * 版本：v2.1.4
 *
 * 功能：
 * 1. 检查当前任务状态
 * 2. 检查 PR 反馈
 * 3. 检查消息队列
 * 4. 检查可领取任务
 * 5. 检查人类反馈
 * 6. 检查阻塞报告
 * 7. 更新心跳
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

interface SlaverStatus {
  instanceId: string;
  role: string;
  specialty: string;
  status: 'idle' | 'working' | 'waiting_review';
  currentTicket: string | null;
  pendingPrFeedback: number;
  newMessages: number;
  readyTasks: number;
}

interface PollConfig {
  idlePollInterval: number;
  workPollInterval: number;
  once: boolean;
}

/**
 * 获取 Slaver 实例信息
 */
function getSlaverInstanceInfo(): { instanceId: string; role: string; specialty: string } {
  const stateDir = '.eket/state';
  const configPath = path.join(stateDir, 'instance_config.yml');

  let instanceId = 'unknown';
  let role = 'unknown';
  let specialty = 'none';

  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const instanceIdMatch = content.match(/instance_id:\s*(\S+)/);
    const roleMatch = content.match(/role:\s*(\S+)/);
    const specialtyMatch = content.match(/specialty:\s*(\S+)/);

    if (instanceIdMatch) instanceId = instanceIdMatch[1];
    if (roleMatch) role = roleMatch[1];
    if (specialtyMatch) specialty = specialtyMatch[1];
  }

  return { instanceId, role, specialty };
}

/**
 * 检查 Slaver 状态
 */
function checkSlaverStatus(instanceId: string): SlaverStatus {
  const { specialty } = getSlaverInstanceInfo();

  let status: SlaverStatus['status'] = 'idle';
  let currentTicket: string | null = null;
  let pendingPrFeedback = 0;
  let newMessages = 0;
  let readyTasks = 0;

  // 检查是否有进行中的任务
  const jiraDir = 'jira/tickets';
  if (fs.existsSync(jiraDir)) {
    for (const dir of ['feature', 'bugfix', 'task', 'fix']) {
      const typeDir = path.join(jiraDir, dir);
      if (!fs.existsSync(typeDir)) continue;

      const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const filePath = path.join(typeDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        const statusMatch = content.match(/^状态:\s*(\S+)/m);
        const assigneeMatch = content.match(/^(?:分配给：|负责人:)\s*(\S+)/m);

        const ticketStatus = statusMatch ? statusMatch[1] : 'unknown';
        const assignee = assigneeMatch ? assigneeMatch[1] : '';

        // 检查是否是自己负责的任务
        if ((ticketStatus === 'in_progress' || ticketStatus === 'review') &&
            (assignee.includes(instanceId) || content.includes(instanceId))) {
          status = 'working';
          currentTicket = file.replace('.md', '');

          if (ticketStatus === 'review') {
            status = 'waiting_review';
          }
          break;
        }
      }
    }
  }

  // 检查 PR 反馈
  const reviewDir = 'outbox/review_requests';
  if (fs.existsSync(reviewDir)) {
    const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(reviewDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (content.includes(instanceId) &&
          (content.includes('## Master Review') || content.includes('## 审核意见')) &&
          !content.includes('状态：processed')) {
        pendingPrFeedback++;
      }
    }
  }

  // 检查消息队列
  const inboxDir = 'shared/message_queue/inbox';
  if (fs.existsSync(inboxDir)) {
    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.json'));
    newMessages = files.length;
  }

  // 检查可领取任务
  if (fs.existsSync(jiraDir)) {
    for (const dir of ['feature', 'bugfix', 'task', 'fix']) {
      const typeDir = path.join(jiraDir, dir);
      if (!fs.existsSync(typeDir)) continue;

      const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));

      for (const file of files) {
        const filePath = path.join(typeDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        const statusMatch = content.match(/^状态:\s*(\S+)/m);
        const ticketStatus = statusMatch ? statusMatch[1] : 'unknown';

        if (ticketStatus === 'ready') {
          readyTasks++;
        }
      }
    }
  }

  return {
    instanceId,
    role: 'slaver',
    specialty,
    status,
    currentTicket,
    pendingPrFeedback,
    newMessages,
    readyTasks,
  };
}

/**
 * 检查当前任务状态
 */
function checkCurrentTask(currentTicket: string | null): void {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查当前任务状态...');

  if (!currentTicket) {
    logInfo('当前无进行中的任务');
    return;
  }

  logInfo(`当前任务：${currentTicket}`);

  // 查找任务文件
  let ticketFile: string | null = null;
  for (const dir of ['feature', 'bugfix', 'task', 'fix']) {
    const filePath = path.join('jira/tickets', dir, `${currentTicket}.md`);
    if (fs.existsSync(filePath)) {
      ticketFile = filePath;
      break;
    }
  }

  if (ticketFile) {
    const content = fs.readFileSync(ticketFile, 'utf-8');

    const statusMatch = content.match(/^状态:\s*(\S+)/m);
    const priorityMatch = content.match(/^优先级:\s*(\S+)/m);
    const assigneeMatch = content.match(/^(?:分配给：|负责人:)\s*(\S+)/m);

    const status = statusMatch ? statusMatch[1] : 'unknown';
    const priority = priorityMatch ? priorityMatch[1] : 'unknown';
    const assignee = assigneeMatch ? assigneeMatch[1] : 'unknown';

    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log(`│  任务详情：${currentTicket}`);
    console.log('├──────────────────────────────────────────────────────────────┤');
    console.log(`│  状态：${status}`);
    console.log(`│  优先级：${priority}`);
    console.log(`│  负责人：${assignee}`);
    console.log('└──────────────────────────────────────────────────────────────┘');

    // 检查阻塞
    const blockedMatch = content.match(/^blocked_by:\s*(.+)/m);
    if (blockedMatch) {
      const blockedBy = blockedMatch[1].trim();
      if (blockedBy && blockedBy !== 'null' && blockedBy !== '[]') {
        logWarning(`任务被阻塞：${blockedBy}`);
      }
    }
  } else {
    logWarning(`任务文件未找到：${currentTicket}`);
  }
}

/**
 * 检查 PR 反馈
 */
function checkPrFeedback(instanceId: string): number {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查 PR 反馈...');

  let pendingPrFeedback = 0;
  const reviewDir = 'outbox/review_requests';

  if (fs.existsSync(reviewDir)) {
    const files = fs.readdirSync(reviewDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(reviewDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (content.includes(instanceId) &&
          (content.includes('## Master Review') || content.includes('## 审核意见'))) {

        if (!content.includes('状态：processed')) {
          pendingPrFeedback++;
          logInfo(`发现待处理的 Review 反馈：${file}`);

          const resultMatch = content.match(/^(?:结果：|审核结果:)\s*(\S+)/m);
          const result = resultMatch ? resultMatch[1] : 'unknown';

          console.log(`    审核结果：${result}`);

          switch (result.toLowerCase()) {
            case 'approved':
              console.log('    ${COLORS.green}✓ 已批准，可以领取新任务或等待 merge${COLORS.reset}');
              break;
            case 'changes_requested':
              console.log('    ${COLORS.yellow}⚠ 需要修改${COLORS.reset}');
              break;
            case 'rejected':
              console.log('    ${COLORS.red}✗ 已驳回${COLORS.reset}');
              break;
          }
        }
      }
    }
  }

  // 检查消息队列中的 PR 相关消息
  const inboxDir = 'shared/message_queue/inbox';
  if (fs.existsSync(inboxDir)) {
    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(inboxDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (content.includes('"type"') && (content.includes('review') || content.includes('pr_'))) {
        logInfo(`发现 PR 相关消息：${file}`);
      }
    }
  }

  if (pendingPrFeedback === 0) {
    logInfo('无待处理的 PR 反馈');
  }

  return pendingPrFeedback;
}

/**
 * 检查消息队列
 */
function checkMessageQueue(): number {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查消息队列...');

  const inboxDir = 'shared/message_queue/inbox';
  let newMessageCount = 0;

  if (fs.existsSync(inboxDir)) {
    const files = fs.readdirSync(inboxDir).filter(f => f.endsWith('.json'));
    newMessageCount = files.length;

    if (newMessageCount > 0) {
      logInfo(`发现 ${newMessageCount} 条新消息`);

      console.log('');
      console.log('┌──────────────────────────────────────────────────────────────┐');
      console.log('│  新消息列表                                                   │');
      console.log('├──────────────────────────────────────────────────────────────┤');

      for (const file of files) {
        const filePath = path.join(inboxDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        const typeMatch = content.match(/"type"\s*:\s*"([^"]+)"/);
        const fromMatch = content.match(/"from"\s*:\s*"([^"]+)"/);
        const timeMatch = content.match(/"timestamp"\s*:\s*"([^"]+)"/);

        const msgType = typeMatch ? typeMatch[1] : 'unknown';
        const from = fromMatch ? fromMatch[1] : 'unknown';
        const timestamp = timeMatch ? timeMatch[1] : 'unknown';

        console.log(`│  ${COLORS.cyan}${file}${COLORS.reset}`);
        console.log(`│    类型：${msgType} | 来自：${from} | 时间：${timestamp}`);
        console.log('');
      }

      console.log('└──────────────────────────────────────────────────────────────┘');
    } else {
      logInfo('消息队列为空');
    }
  } else {
    logInfo('消息队列目录不存在');
  }

  return newMessageCount;
}

/**
 * 检查可领取任务
 */
function checkReadyTasks(specialty: string): number {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查可领取的任务...');

  const jiraDir = 'jira/tickets';
  let readyTaskCount = 0;

  if (!fs.existsSync(jiraDir)) {
    logWarning('Jira 目录不存在');
    return 0;
  }

  const readyTasks: Array<{ ticketId: string; priority: string; role: string }> = [];

  for (const dir of ['feature', 'bugfix', 'task', 'fix']) {
    const typeDir = path.join(jiraDir, dir);
    if (!fs.existsSync(typeDir)) continue;

    const files = fs.readdirSync(typeDir).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(typeDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      const statusMatch = content.match(/^状态:\s*(\S+)/m);
      const priorityMatch = content.match(/^优先级:\s*(\S+)/m);
      const roleMatch = content.match(/^适配角色:\s*(\S+)/m);

      const status = statusMatch ? statusMatch[1] : 'unknown';

      if (status === 'ready') {
        const ticketId = file.replace('.md', '');
        const priority = priorityMatch ? priorityMatch[1] : 'P3';
        const role = roleMatch ? roleMatch[1] : '';

        readyTaskCount++;
        readyTasks.push({ ticketId, priority, role });
      }
    }
  }

  if (readyTaskCount > 0) {
    console.log('');
    console.log('可领取任务：');

    for (const task of readyTasks) {
      const roleMatch = (!task.role || task.role === 'fullstack' || task.role.includes(specialty)) ? '✓' : '○';
      console.log(`  ${roleMatch} ${COLORS.cyan}${task.ticketId}${COLORS.reset} - 优先级：${task.priority}, 角色：${task.role || '未指定'}`);
    }

    console.log('');
    logInfo(`共 ${readyTaskCount} 个 ready 任务`);
    console.log('');
    console.log(`${COLORS.green}建议：运行 /eket-claim <ticket-id> 领取任务${COLORS.reset}`);
  } else {
    logInfo('无 ready 状态的任务');
  }

  return readyTaskCount;
}

/**
 * 检查人类反馈
 */
function checkHumanFeedback(): void {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查人类反馈...');

  const feedbackDir = 'inbox/human_feedback';

  if (fs.existsSync(feedbackDir)) {
    const files = fs.readdirSync(feedbackDir).filter(f => f.endsWith('.md'));

    if (files.length > 0) {
      const latestFile = files[0]; // 假设按时间排序
      const filePath = path.join(feedbackDir, latestFile);
      const stat = fs.statSync(filePath);
      const now = Date.now();
      const ageMinutes = Math.floor((now - stat.mtimeMs) / 60000);

      logInfo(`最新人类反馈：${latestFile} (${ageMinutes} 分钟前)`);

      // 检查是否包含 Slaver 相关内容
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes('Slaver') || content.includes('slaver') || content.includes('执行') || content.includes('修改')) {
        logWarning('反馈中包含 Slaver 相关内容，请检查');
      }
    } else {
      logInfo('无人类反馈');
    }
  } else {
    logInfo('人类反馈目录不存在');
  }
}

/**
 * 检查阻塞报告
 */
function checkBlockerReports(): void {
  console.log(`${COLORS.cyan}[CHECK]${COLORS.reset}`, new Date().toISOString().slice(0, 19).replace('T', ' '), '- 检查阻塞报告...');

  const blockerDir = 'inbox/blocker_reports';

  if (fs.existsSync(blockerDir)) {
    const files = fs.readdirSync(blockerDir).filter(f => f.endsWith('.md'));

    if (files.length > 0) {
      logWarning(`发现 ${files.length} 个阻塞报告`);

      for (const file of files) {
        const filePath = path.join(blockerDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        console.log('');
        console.log(`  ${COLORS.red}${file}${COLORS.reset}`);

        // 检查是否是自己提交的
        if (content.includes(process.env.HOSTNAME || '')) {
          console.log('    状态：等待 Master 仲裁');
        }
      }
    } else {
      logInfo('无阻塞报告');
    }
  } else {
    logInfo('阻塞报告目录不存在');
  }
}

/**
 * 更新心跳
 */
function updateHeartbeat(instanceId: string, status: SlaverStatus): void {
  const stateDir = '.eket/state';
  fs.mkdirSync(stateDir, { recursive: true });

  const now = new Date().toISOString();
  const heartbeatContent = `# Slaver 心跳
instance_id: ${instanceId}
specialty: ${status.specialty}
last_check: ${now}
status: ${status.status}
current_ticket: ${status.currentTicket || 'none'}
pending_pr_feedback: ${status.pendingPrFeedback}
new_messages: ${status.newMessages}
ready_tasks: ${status.readyTasks}
`;

  fs.writeFileSync(path.join(stateDir, `slaver_${instanceId}_heartbeat.yml`), heartbeatContent, 'utf-8');
}

/**
 * 显示轮询摘要
 */
function showPollSummary(status: SlaverStatus, config: PollConfig): void {
  console.log('');
  console.log('┌──────────────────────────────────────────────────────────────┐');
  console.log('│  Slaver 轮询摘要                                              │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  状态：${status.status}`);
  console.log(`│  当前任务：${status.currentTicket || '无'}`);
  console.log(`│  PR 反馈：${status.pendingPrFeedback} 个`);
  console.log(`│  新消息：${status.newMessages} 条`);
  console.log(`│  Ready 任务：${status.readyTasks} 个`);
  console.log(`│  轮询间隔：${config.idlePollInterval}秒 (空闲) / ${config.workPollInterval}秒 (工作中)`);
  console.log('└──────────────────────────────────────────────────────────────┘');
}

/**
 * 执行一轮检查
 */
function runSingleCheck(instanceId: string, specialty: string): SlaverStatus {
  const status = checkSlaverStatus(instanceId);

  checkCurrentTask(status.currentTicket);
  console.log('');
  checkPrFeedback(instanceId);
  console.log('');
  checkMessageQueue();
  console.log('');
  checkReadyTasks(specialty);
  console.log('');
  checkHumanFeedback();
  console.log('');
  checkBlockerReports();

  updateHeartbeat(instanceId, status);

  return status;
}

/**
 * 主轮询循环
 */
async function runPollLoop(config: PollConfig): Promise<void> {
  const { instanceId, specialty } = getSlaverInstanceInfo();

  logInfo('Slaver 轮询启动');
  logInfo(`实例 ID: ${instanceId}`);
  logInfo(`角色配置：${specialty}`);
  console.log('');

  let iteration = 0;

  while (true) {
    iteration++;

    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    logInfo(`轮询 #${iteration} 开始`);
    console.log('════════════════════════════════════════════════════════════════');
    console.log('');

    const status = runSingleCheck(instanceId, specialty);

    // 根据状态调整轮询间隔
    let currentInterval = config.idlePollInterval;
    switch (status.status) {
      case 'working':
        currentInterval = config.workPollInterval;
        break;
      case 'waiting_review':
        currentInterval = config.idlePollInterval; // 等待 PR 反馈时快速响应
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
 * 注册 Slaver Poll 命令
 */
export function registerSlaverPoll(program: Command): void {
  program
    .command('slaver:poll')
    .description('启动 Slaver 轮询（定期任务/PR 反馈/消息队列检查）')
    .option('-i, --interval <seconds>', 'Idle poll interval in seconds', '10')
    .option('-w, --work-interval <seconds>', 'Working poll interval in seconds', '300')
    .option('--once', 'Run once and exit')
    .addHelpText(
      'after',
      `
Examples:
  $ eket-cli slaver:poll                        # Start polling with defaults
  $ eket-cli slaver:poll -i 30                  # 30 seconds idle interval
  $ eket-cli slaver:poll -w 600                 # 10 minutes working interval
  $ eket-cli slaver:poll --once                 # Run once and exit

Environment Variables:
  EKET_SLAVER_IDLE_POLL_INTERVAL  Idle poll interval (seconds)
  EKET_SLAVER_WORK_POLL_INTERVAL  Working poll interval (seconds)

Related Commands:
  $ eket-cli slaver:register                    # Register Slaver identity
  $ eket-cli claim                              # Claim a task
  $ eket-cli master:poll                        # Master polling command
`
    )
    .action(async (options) => {
      const config: PollConfig = {
        idlePollInterval: parseInt(process.env.EKET_SLAVER_IDLE_POLL_INTERVAL || options.interval, 10),
        workPollInterval: parseInt(process.env.EKET_SLAVER_WORK_POLL_INTERVAL || options.workInterval, 10),
        once: options.once,
      };

      // 检查角色
      const { role } = getSlaverInstanceInfo();
      if (role !== 'slaver') {
        printError({
          code: 'INVALID_ROLE',
          message: '当前实例不是 Slaver 角色',
          solutions: [
            'Run instance:start with --role to create a Slaver instance',
            'Check .eket/state/instance_config.yml for current role',
          ],
        });
        console.log(`当前角色：${role}`);
        process.exit(1);
      }

      if (config.once) {
        const { instanceId, specialty } = getSlaverInstanceInfo();
        const status = runSingleCheck(instanceId, specialty);
        showPollSummary(status, config);
      } else {
        await runPollLoop(config);
      }
    });
}
