/**
 * Skill Stacker — 批量加载 skill 定义并合并为统一上下文
 * TASK-118: Skill Stacking + Task Envelope
 */

import * as fs from 'fs';
import * as path from 'path';

export interface StackedContext {
  skillIds: string[];
  mergedTriggers: string[];
  mergedConstraints: string[];
  loadedAt: number;
}

interface SkillDefinition {
  id?: string;
  triggers?: string[];
  constraints?: string[];
  [key: string]: unknown;
}

export class SkillStacker {
  constructor(private skillsRoot: string) {}

  async loadStack(skillIds: string[]): Promise<StackedContext> {
    const mergedTriggers: string[] = [];
    const mergedConstraints: string[] = [];

    for (const skillId of skillIds) {
      const def = await this.loadSkillDef(skillId);
      if (def) {
        if (Array.isArray(def.triggers)) {
          mergedTriggers.push(...def.triggers);
        }
        if (Array.isArray(def.constraints)) {
          mergedConstraints.push(...def.constraints);
        }
      }
    }

    return {
      skillIds,
      mergedTriggers: [...new Set(mergedTriggers)],
      mergedConstraints: [...new Set(mergedConstraints)],
      loadedAt: Date.now(),
    };
  }

  private async loadSkillDef(skillId: string): Promise<SkillDefinition | null> {
    // Try <skillsRoot>/<skillId>.json first, then search subdirectories
    const directPath = path.join(this.skillsRoot, `${skillId}.json`);
    if (fs.existsSync(directPath)) {
      return JSON.parse(fs.readFileSync(directPath, 'utf-8')) as SkillDefinition;
    }

    // Search one level of subdirectories
    if (fs.existsSync(this.skillsRoot)) {
      const entries = fs.readdirSync(this.skillsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPath = path.join(this.skillsRoot, entry.name, `${skillId}.json`);
          if (fs.existsSync(subPath)) {
            return JSON.parse(fs.readFileSync(subPath, 'utf-8')) as SkillDefinition;
          }
        }
      }
    }

    return null;
  }
}
