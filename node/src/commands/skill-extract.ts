/**
 * EKET Framework - skill:extract / skill:list commands (TASK-043)
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { Command } from 'commander';

import { generateSkillFile, type AutoSkill } from '../core/skill-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname_here = dirname(__filename);
// skill-extract.ts is at node/src/commands/ → ../../../.. = repo root
const REPO_ROOT = join(__dirname_here, '..', '..', '..', '..');

// In-process registry (persists for lifetime of process)
const autoSkillRegistry: Map<string, AutoSkill> = new Map();

export function registerSkillExtractCommand(program: Command): void {
  program
    .command('skill:extract')
    .description('从 ticket 复盘提炼通用 Skill 并注册')
    .requiredOption('--ticket <id>', 'Ticket ID, e.g. TASK-042')
    .requiredOption('--summary <text>', '解法描述')
    .option('--steps <steps>', '逗号分隔的步骤列表')
    .option('--category <cat>', 'Skill 分类（可选，默认推断）')
    .action(
      async (opts: { ticket: string; summary: string; steps?: string; category?: string }) => {
        const { filePath, skill } = await generateSkillFile(REPO_ROOT, opts);
        autoSkillRegistry.set(skill.id, skill);
        console.log(`[skill:extract] Skill 已生成: ${skill.id}`);
        console.log(`[skill:extract] 文件路径: ${filePath}`);
        console.log(`[skill:extract] 分类: ${skill.category}`);
        console.log(`[skill:extract] Trigger: ${skill.trigger.join(', ')}`);
      },
    );

  program
    .command('skill:list')
    .description('列出已注册的自动生成 Skill')
    .action(() => {
      const skills = Array.from(autoSkillRegistry.values());
      if (skills.length === 0) {
        console.log('[skill:list] 暂无已注册 Skill（本次进程内）');
        return;
      }
      skills.forEach((s) => {
        console.log(`  ${s.id}  [${s.category}]  ${s.name}`);
      });
    });
}
