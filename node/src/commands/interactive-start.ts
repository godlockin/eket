/**
 * EKET Framework - Interactive Start Wizard
 *
 * Provides an interactive wizard for starting instances with:
 * - Role selection
 * - Configuration generation
 * - One-click startup
 */

import inquirer from 'inquirer';
import ora from 'ora';

import { startInstance } from './start-instance.js';
import { logSuccess } from '../utils/error-handler.js';

interface Choice {
  name: string;
  value: string;
  disabled?: boolean;
}

/**
 * Available instance modes
 */
const INSTANCE_MODES: Choice[] = [
  { name: '🤖 AI 自动模式 (自动领取任务)', value: 'ai-auto' },
  { name: '👤 人工模式 (手动控制)', value: 'human' },
  { name: '🔧 AI 手动模式 (半自动)', value: 'ai-manual' },
];

/**
 * Main interactive wizard
 */
export async function runInteractiveStart(): Promise<void> {
  console.log('\n========================================');
  console.log('🚀 EKET Interactive Start Wizard');
  console.log('========================================\n');

  // Step 1: Select instance mode
  const { mode } = await inquirer.prompt<{ mode: string }>([
    {
      type: 'list',
      name: 'mode',
      message: '选择实例模式:',
      choices: INSTANCE_MODES,
      default: 'ai-auto',
    },
  ]);

  // Step 2: If human mode, select role
  let role: string | undefined;
  if (mode === 'human') {
    const roles = await getAvailableRoles();
    // @ts-ignore - inquirer v13 type compatibility
    const { selectedRole } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedRole',
      message: '选择 Agent 角色:',
      choices: roles,
      pageSize: 20,
    }]);
    role = selectedRole;
  } else if (mode === 'ai-manual') {
    // AI 手动模式也可以选择角色
    const { wantRole } = await inquirer.prompt<{ wantRole: boolean }>([
      {
        type: 'confirm',
        name: 'wantRole',
        message: '是否指定 Agent 角色？',
        default: false,
      },
    ]);

    if (wantRole) {
      const roles = await getAvailableRoles();
      // @ts-ignore - inquirer v13 type compatibility
      const { selectedRole } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedRole',
        message: '选择 Agent 角色:',
        choices: roles,
        pageSize: 20,
      }]);
      role = selectedRole;
    }
  }

  // Step 3: Confirm configuration
  console.log('\n=== Configuration Summary ===');
  console.log(`Mode: ${mode}`);
  console.log(`Role: ${role || 'Not specified'}`);
  console.log(`Project Root: ${process.cwd()}`);

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      message: '确认启动配置？',
      default: true,
    },
  ]);

  if (!confirmed) {
    console.log('\nCancelled by user.');
    return;
  }

  // Step 4: Start instance
  const spinner = ora('Starting instance...').start();

  try {
    const result = await startInstance({
      human: mode === 'human',
      auto: mode === 'ai-auto',
      role,
      projectRoot: process.cwd(),
    });

    if (!result.success) {
      spinner.fail('Instance start failed');
      console.error(`\nError: ${result.error.message}`);
      console.error('\nSuggestions:');
      console.error('  - Run `eket-cli system:doctor` for diagnosis');
      console.error('  - Check if project is initialized (`eket-cli project:init`)');
      console.error('  - Verify Redis/SQLite configuration');
      process.exit(1);
    }

    spinner.succeed('Instance started successfully');

    const modeDisplay =
      result.data.instanceType === 'master'
        ? 'Master'
        : `Slaver (${mode}${role ? ` - ${role}` : ''})`;

    logSuccess(`Instance role: ${modeDisplay}`, [
      `Project: ${result.data.projectRoot}`,
      role ? `Agent role: ${role}` : null,
    ].filter(Boolean) as string[]);
  } catch (error) {
    spinner.fail('Instance start failed');
    console.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Get available roles for selection
 */
async function getAvailableRoles(): Promise<Choice[]> {
  // Read roles from start-instance module
  const coordinatorRoles: Choice[] = [
    { name: '📋 product_manager - 产品经理', value: 'product_manager' },
    { name: '🏗️ architect - 架构师', value: 'architect' },
    { name: '👨‍💻 tech_manager - 技术负责人', value: 'tech_manager' },
    { name: '📝 doc_monitor - 文档管理员', value: 'doc_monitor' },
  ];

  const executorRoles: Choice[] = [
    { name: '🎨 frontend_dev - 前端开发', value: 'frontend_dev' },
    { name: '⚙️ backend_dev - 后端开发', value: 'backend_dev' },
    { name: '✅ qa_engineer - 测试工程师', value: 'qa_engineer' },
    { name: '🚀 devops_engineer - 运维工程师', value: 'devops_engineer' },
    { name: '✏️ designer - 设计师', value: 'designer' },
    { name: '🔍 tester - 测试员', value: 'tester' },
    { name: '💻 fullstack - 全栈开发', value: 'fullstack' },
  ];

  return [
    { name: '─── 协调者角色 ───', value: '---coordinators---', disabled: true },
    ...coordinatorRoles,
    { name: '─── 执行者角色 ───', value: '---executors---', disabled: true },
    ...executorRoles,
  ];
}

/**
 * CLI entry point
 */
export async function runInteractiveStartCLI(): Promise<void> {
  try {
    await runInteractiveStart();
  } catch (error) {
    console.error(`\n❌ Wizard failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}
