/**
 * Submit PR Command
 * 用于提交 PR 到代码仓库
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { enqueueMessage } from '../core/state/writer.js';
import type { Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import { findProjectRoot } from '../utils/process-cleanup.js';
import { parseSimpleYAML } from '../utils/yaml-parser.js';

interface SubmitPROptions {
  title?: string;
  description?: string;
  reviewers?: string;
  draft: boolean;
  autoMerge: boolean;
}

interface PRConfig {
  platform: 'github' | 'gitlab' | 'gitee';
  owner: string;
  repo: string;
  apiToken?: string;
  baseUrl?: string;
}

interface BranchInfo {
  currentBranch: string;
  targetBranch: string;
  commitMessage: string;
}

interface PRData {
  number: number;
  htmlUrl: string;
  title: string;
}

/**
 * 注册 submit-pr 命令
 */
export function registerSubmitPR(program: Command): void {
  program
    .command('submit-pr')
    .description('提交 PR 到代码仓库')
    .option('-t, --title <title>', 'PR 标题')
    .option('-d, --description <description>', 'PR 描述')
    .option('-r, --reviewers <reviewers>', 'Reviewers（逗号分隔）')
    .option('--draft', '创建为 Draft PR', false)
    .option('--auto-merge', '启用自动合并', false)
    .action(async (options: SubmitPROptions) => {
      console.log('\n=== 提交 PR ===\n');

      // 1. 检查项目状态
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error('错误：未找到 EKET 项目');
        process.exit(1);
      }

      // 2. 读取配置
      const config = await loadConfig(projectRoot);
      if (!config) {
        console.error('错误：未找到项目配置');
        process.exit(1);
      }

      // 3. 获取当前分支信息
      const branchInfoResult = await getBranchInfo(projectRoot);
      if (!branchInfoResult.success) {
        console.error('错误：无法获取分支信息');
        process.exit(1);
      }
      const branchInfo = branchInfoResult.data;

      console.log(`当前分支：${branchInfo.currentBranch}`);
      console.log(`目标分支：${branchInfo.targetBranch}`);

      // 4. 推送分支
      console.log('\n推送分支到远程...');
      const pushResult = await pushBranch(projectRoot, branchInfo.currentBranch);
      if (!pushResult.success) {
        console.error('推送失败:', pushResult.error.message);
        process.exit(1);
      }
      console.log('✓ 推送成功');

      // 5. 获取代码仓库配置
      const prConfigResult = await getPRConfig(config);
      if (!prConfigResult.success) {
        console.log('警告：未配置 PR 平台，跳过 PR 创建');
        console.log('请手动创建 PR 或配置 .eket/config.yml');
        return;
      }
      const prConfig = prConfigResult.data;

      // 6. 创建 PR
      console.log(`\n创建 ${prConfig.platform.toUpperCase()} PR...`);
      const prDataResult = await createPR(prConfig, {
        title: options.title || branchInfo.commitMessage || '更新',
        description: options.description || generatePRDescription(branchInfo),
        head: branchInfo.currentBranch,
        base: branchInfo.targetBranch,
        draft: options.draft,
      });

      if (!prDataResult.success) {
        console.error('创建 PR 失败:', prDataResult.error.message);
        process.exit(1);
      }
      const prData = prDataResult.data;

      console.log(`✓ PR 创建成功：${prData.htmlUrl}`);

      // 7. 添加 Reviewers
      if (options.reviewers) {
        const reviewers = options.reviewers.split(',').map((r) => r.trim());
        await addReviewers(prConfig, prData.number, reviewers);
        console.log(`✓ 已添加 Reviewers: ${reviewers.join(', ')}`);
      }

      // 8. 启用自动合并
      if (options.autoMerge) {
        await enableAutoMerge(prConfig, prData.number);
        console.log('✓ 已启用自动合并');
      }

      // 9. 发送通知
      await sendPRNotification(prData);
      console.log('✓ 通知已发送');

      console.log('\n========================================');
      console.log('  PR 提交完成');
      console.log('========================================\n');
      console.log(`PR: ${prData.htmlUrl}`);
      console.log(`分支：${branchInfo.currentBranch} → ${branchInfo.targetBranch}`);
      console.log(`标题：${prData.title}`);
      console.log('\n等待 Review 通过后即可合并...\n');
    });
}

/**
 * 加载项目配置
 */
async function loadConfig(projectRoot: string): Promise<Record<string, unknown> | null> {
  const configPath = path.join(projectRoot, '.eket', 'config', 'config.yml');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return parseSimpleYAML(content);
}

/**
 * 获取分支信息
 */
async function getBranchInfo(projectRoot: string): Promise<Result<BranchInfo>> {
  try {
    // 获取当前分支
    const branchResult = await execFileNoThrow('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectRoot,
    });

    if (branchResult.status !== 0) {
      return { success: false, error: new EketError(EketErrorCode.GIT_BRANCH_FAILED, '无法获取当前分支') };
    }

    const currentBranch = branchResult.stdout.trim();

    // 判断目标分支
    let targetBranch = 'main';
    if (currentBranch.startsWith('feature/')) {
      targetBranch = 'testing';
    } else if (currentBranch.startsWith('bugfix/')) {
      targetBranch = 'testing';
    } else if (currentBranch.startsWith('hotfix/')) {
      targetBranch = 'main';
    }

    // 获取最近提交信息
    const commitResult = await execFileNoThrow('git', ['log', '-1', '--pretty=%s'], {
      cwd: projectRoot,
    });

    return {
      success: true,
      data: {
        currentBranch,
        targetBranch,
        commitMessage: commitResult.stdout.trim(),
      },
    };
  } catch {
    return { success: false, error: new EketError(EketErrorCode.GIT_BRANCH_FAILED, '获取分支信息失败') };
  }
}

/**
 * 推送分支
 */
async function pushBranch(projectRoot: string, branch: string): Promise<Result<void>> {
  try {
    const result = await execFileNoThrow('git', ['push', '-u', 'origin', branch], {
      cwd: projectRoot,
    });
    if (result.status === 0) {
      return { success: true, data: undefined };
    } else {
      return {
        success: false,
        error: new EketError(EketErrorCode.GIT_PUSH_FAILED, `推送失败：${result.stderr}`),
      };
    }
  } catch {
    return { success: false, error: new EketError(EketErrorCode.GIT_PUSH_FAILED, '推送异常') };
  }
}

/**
 * 获取 PR 配置
 */
async function getPRConfig(config: Record<string, unknown>): Promise<Result<PRConfig>> {
  try {
    // 从 code_repo URL 解析
    const repos = config.repositories as Record<string, unknown> | undefined;
    if (!repos) {
      return { success: false, error: new EketError(EketErrorCode.CONFIG_ERROR, '未配置 repositories') };
    }

    const codeRepo = repos.code_repo as Record<string, unknown> | undefined;
    if (!codeRepo) {
      return { success: false, error: new EketError(EketErrorCode.CONFIG_ERROR, '未配置 code_repo') };
    }

    const url = codeRepo.url as string;
    if (!url) {
      return { success: false, error: new EketError(EketErrorCode.CONFIG_ERROR, '未配置 code_repo.url') };
    }

    // 解析 URL
    let platform: 'github' | 'gitlab' | 'gitee' = 'github';
    let owner = '';
    let repo = '';

    if (url.includes('github.com')) {
      platform = 'github';
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    } else if (url.includes('gitlab.com')) {
      platform = 'gitlab';
      const match = url.match(/gitlab\.com[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    } else if (url.includes('gitee.com')) {
      platform = 'gitee';
      const match = url.match(/gitee\.com[:/]([^/]+)\/([^/.]+)/);
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    }

    if (!owner || !repo) {
      return {
        success: false,
        error: new EketError(EketErrorCode.URL_PARSE_ERROR, '无法从 URL 解析 owner/repo'),
      };
    }

    return {
      success: true,
      data: {
        platform,
        owner,
        repo,
        apiToken: codeRepo.token as string | undefined,
        baseUrl: getAPIBaseURL(platform),
      },
    };
  } catch {
    return { success: false, error: new EketError(EketErrorCode.CONFIG_ERROR, '解析 PR 配置失败') };
  }
}

/**
 * 获取 API 基础 URL
 */
function getAPIBaseURL(platform: string): string {
  switch (platform) {
    case 'github':
      return 'https://api.github.com';
    case 'gitlab':
      return 'https://gitlab.com/api/v4';
    case 'gitee':
      return 'https://gitee.com/api/v5';
    default:
      return 'https://api.github.com';
  }
}

/**
 * 创建 PR
 */
async function createPR(
  config: PRConfig,
  data: {
    title: string;
    description: string;
    head: string;
    base: string;
    draft: boolean;
  }
): Promise<Result<PRData>> {
  const { platform, owner, repo, apiToken, baseUrl } = config;

  if (!apiToken) {
    return { success: false, error: new EketError(EketErrorCode.CONFIG_ERROR, '未配置 API Token') };
  }

  let apiUrl: string;
  let body: Record<string, unknown>;
  let headers: Record<string, string>;

  switch (platform) {
    case 'github':
      apiUrl = `${baseUrl}/repos/${owner}/${repo}/pulls`;
      body = {
        title: data.title,
        body: data.description,
        head: data.head,
        base: data.base,
        draft: data.draft,
      };
      headers = {
        Authorization: `token ${apiToken}`,
        Accept: 'application/vnd.github.v3+json',
      };
      break;

    case 'gitlab':
      apiUrl = `${baseUrl}/projects/${encodeURIComponent(`${owner}/${repo}`)}/merge_requests`;
      body = {
        title: data.title,
        description: data.description,
        source_branch: data.head,
        target_branch: data.base,
      };
      headers = {
        'PRIVATE-TOKEN': apiToken,
      };
      break;

    case 'gitee':
      apiUrl = `${baseUrl}/repos/${owner}/${repo}/pulls`;
      body = {
        title: data.title,
        body: data.description,
        head: data.head,
        base: data.base,
      };
      headers = {
        Authorization: `token ${apiToken}`,
      };
      break;

    default:
      return {
        success: false,
        error: new EketError(EketErrorCode.UNSUPPORTED_PLATFORM, `不支持的平台：${platform}`),
      };
  }

  try {
    // 使用 curl 发送请求
    const { execFileNoThrow } = await import('../utils/execFileNoThrow.js');
    const result = await execFileNoThrow('curl', [
      '-X',
      'POST',
      '-H',
      ...Object.entries(headers).flatMap(([k, v]) => [k, v]),
      '-d',
      JSON.stringify(body),
      apiUrl,
    ]);

    if (result.status !== 0) {
      return {
        success: false,
        error: new EketError(EketErrorCode.PR_CREATE_FAILED, `创建 PR 失败：${result.stderr}`),
      };
    }

    const response = JSON.parse(result.stdout);

    return {
      success: true,
      data: {
        number: response.number || response.iid,
        htmlUrl: response.html_url || response.web_url,
        title: response.title,
      },
    };
  } catch {
    return { success: false, error: new EketError(EketErrorCode.PR_CREATE_FAILED, '创建 PR 异常') };
  }
}

/**
 * 添加 Reviewers (GitHub only)
 */
async function addReviewers(
  config: PRConfig,
  prNumber: number,
  reviewers: string[]
): Promise<void> {
  if (config.platform !== 'github') {
    return; // 仅 GitHub 支持
  }

  if (!config.apiToken) {
    return;
  }

  const { execFileNoThrow } = await import('../utils/execFileNoThrow.js');
  const apiUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/pulls/${prNumber}/requested_reviewers`;

  const result = await execFileNoThrow('curl', [
    '-X',
    'POST',
    '-H',
    `Authorization: token ${config.apiToken}`,
    '-H',
    'Accept: application/vnd.github.v3+json',
    '-d',
    JSON.stringify({ reviewers }),
    apiUrl,
  ]);

  if (result.status !== 0) {
    console.error('添加 Reviewers 失败:', result.stderr);
  }
}

/**
 * 启用自动合并 (GitHub only)
 */
async function enableAutoMerge(config: PRConfig, prNumber: number): Promise<void> {
  if (config.platform !== 'github') {
    return;
  }

  if (!config.apiToken) {
    return;
  }

  const { execFileNoThrow } = await import('../utils/execFileNoThrow.js');
  const apiUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/pulls/${prNumber}/merge`;

  const result = await execFileNoThrow('curl', [
    '-X',
    'PUT',
    '-H',
    `Authorization: token ${config.apiToken}`,
    '-H',
    'Accept: application/vnd.github.v3+json',
    '-d',
    JSON.stringify({ merge_method: 'squash' }),
    apiUrl,
  ]);

  if (result.status !== 0) {
    console.error('启用自动合并失败:', result.stderr);
  }
}

/**
 * 生成 PR 描述
 */
function generatePRDescription(branchInfo: {
  currentBranch: string;
  targetBranch: string;
  commitMessage: string;
}): string {
  const ticketMatch = branchInfo.currentBranch.match(/(?:feature|bugfix|hotfix)\/([^-]+)-(.+)/);
  const ticketId = ticketMatch ? ticketMatch[1] : '';

  return `## 变更说明

${branchInfo.commitMessage}

## 相关 Ticket

${ticketId ? `-${ticketId}` : '- N/A'}

## 测试

- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动测试完成

## 检查清单

- [ ] 代码符合项目规范
- [ ] 已添加必要的注释
- [ ] 已更新相关文档
`;
}

/**
 * 发送 PR 通知
 */
async function sendPRNotification(prData: {
  number: number;
  htmlUrl: string;
  title: string;
}): Promise<void> {
  const projectRoot = await findProjectRoot();
  if (!projectRoot) {
    console.error('警告：无法发送通知，未找到项目根目录');
    return;
  }

  // P0-1/2: 使用 writer 的单一入口；走 shared/message_queue/inbox/ + schema 校验。
  if (!process.env.EKET_ROOT) {
    process.env.EKET_ROOT = projectRoot;
  }
  await enqueueMessage({
    from: 'system',
    to: 'coordinator',
    type: 'pr_review_request',
    payload: {
      pr_number: prData.number,
      pr_url: prData.htmlUrl,
      pr_title: prData.title,
      status: 'pending_review',
    },
  });
}
