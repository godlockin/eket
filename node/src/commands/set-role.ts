/**
 * Set Role Command
 * 人类用户设置自己的角色，加载对应技能的 Agent Profile
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { createInstanceRegistry } from '../core/instance-registry.js';
import type { AgentRole } from '../types/index.js';
import type { InstanceConfig } from '../types/instance.js';

/**
 * Agent 角色技能映射
 */
const ROLE_SKILLS: Record<string, string[]> = {
  product_manager: [
    'requirements_analysis',
    'user_story_mapping',
    'acceptance_criteria_definition',
    'stakeholder_communication',
  ],
  architect: ['architecture_design', 'system_design', 'technology_selection', 'api_design'],
  frontend_dev: [
    'react_development',
    'typescript',
    'css_styling',
    'component_design',
    'state_management',
  ],
  backend_dev: ['api_development', 'database_design', 'authentication', 'caching', 'microservices'],
  qa_engineer: [
    'unit_testing',
    'integration_testing',
    'e2e_testing',
    'test_automation',
    'quality_assurance',
  ],
  devops_engineer: ['docker', 'kubernetes', 'ci_cd', 'monitoring', 'infrastructure_as_code'],
  reviewer: ['code_review', 'security_review', 'performance_review', 'architecture_review'],
  business_analyst: [
    'process_analysis',
    'data_analysis',
    'documentation',
    'requirements_gathering',
  ],
  ux_designer: ['user_research', 'wireframing', 'prototyping', 'usability_testing'],
  security_expert: [
    'security_audit',
    'vulnerability_assessment',
    'penetration_testing',
    'security_hardening',
  ],
  data_scientist: [
    'data_analysis',
    'machine_learning',
    'statistical_modeling',
    'data_visualization',
  ],
  doc_monitor: ['technical_writing', 'documentation_review', 'api_documentation', 'user_guides'],
};

/**
 * 加载 Agent Profile
 */
async function loadAgentProfile(projectRoot: string, role: string): Promise<void> {
  const profileDir = path.join(projectRoot, '.eket', 'state', 'profiles');
  fs.mkdirSync(profileDir, { recursive: true });

  const profilePath = path.join(profileDir, `${role}_profile.json`);
  const skills = ROLE_SKILLS[role] || [];

  const profile = {
    id: `agent_${role}_${Date.now()}`,
    role: role as AgentRole,
    mode: 'execution' as const,
    capabilities: skills,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  console.log(`Agent Profile 已加载：${role}`);
  console.log(`  技能：${skills.join(', ')}`);
}

/**
 * 保存 Instance 配置
 */
function saveInstanceConfig(projectRoot: string, instanceId: string, config: InstanceConfig): void {
  const configDir = path.join(projectRoot, '.eket', 'state');
  fs.mkdirSync(configDir, { recursive: true });

  const configPath = path.join(configDir, 'instance_config.json');
  fs.writeFileSync(configPath, JSON.stringify({ instanceId, ...config }, null, 2));
}

/**
 * 注册 set-role 命令
 */
export function registerSetRole(program: Command): void {
  program
    .command('set-role <role>')
    .description('设置 Instance 角色')
    .option('-a, --auto', '启用自动模式', false)
    .option('--skills <skills>', '自定义技能列表（逗号分隔）')
    .action(async (role, options) => {
      console.log('\n=== 设置 Instance 角色 ===\n');

      // 验证角色
      const validRoles = Object.keys(ROLE_SKILLS);
      if (!validRoles.includes(role)) {
        console.error(`错误：无效角色 "${role}"`);
        console.log(`可用角色：${validRoles.join(', ')}`);
        process.exit(1);
      }

      // 获取项目根目录
      const projectRoot = process.cwd();

      // 确定技能列表
      let skills: string[];
      if (options.skills) {
        skills = options.skills.split(',').map((s: string) => s.trim());
      } else {
        skills = ROLE_SKILLS[role] || [];
      }

      // 创建 Instance 配置
      const config: InstanceConfig = {
        controller: 'human',
        role: 'slaver', // 默认为 slaver，Master 模式下会自动升级
        agent_type: role,
        skills,
        auto_mode: options.auto || false,
      };

      // 注册 Instance
      const registry = createInstanceRegistry();
      const connectResult = await registry.connect();

      if (!connectResult.success) {
        console.warn('警告：无法连接注册表，使用本地模式');
        // 本地模式：仅保存配置文件
        const instanceId = `human_${role}_${Date.now()}`;
        saveInstanceConfig(projectRoot, instanceId, config);
        await loadAgentProfile(projectRoot, role);
        console.log(`\n✓ 角色设置成功（本地模式）`);
        console.log(`  实例 ID: ${instanceId}`);
        console.log(`  控制器：human`);
        console.log(`  角色：${role}`);
        console.log(`  自动模式：${config.auto_mode ? '启用' : '禁用'}`);
        return;
      }

      try {
        // 生成实例 ID
        const instanceId = `human_${role}_${Date.now()}`;

        // 创建 Instance 信息
        const instance = {
          id: instanceId,
          type: 'human' as const,
          agent_type: role as AgentRole,
          skills,
          status: 'idle' as const,
          currentTaskId: undefined,
          currentLoad: 0,
          lastHeartbeat: Date.now(),
        };

        // 注册到注册表
        const registerResult = await registry.registerInstance(instance);

        if (!registerResult.success) {
          console.error('注册失败:', registerResult.error.message);
          process.exit(1);
        }

        // 保存本地配置
        saveInstanceConfig(projectRoot, instanceId, config);

        // 加载 Agent Profile
        await loadAgentProfile(projectRoot, role);

        console.log('\n✓ 角色设置成功');
        console.log(`  实例 ID: ${instanceId}`);
        console.log(`  控制器：human`);
        console.log(`  角色：${role}`);
        console.log(`  技能：${skills.join(', ')}`);
        console.log(`  自动模式：${config.auto_mode ? '启用' : '禁用'}`);
        console.log('\n下一步：/eket-start 开始任务');
      } finally {
        await registry.disconnect();
      }
    });
}
