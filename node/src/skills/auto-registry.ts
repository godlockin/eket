// node/src/skills/auto-registry.ts
// Registry for auto-generated skills (AutoSkill) from skill:extract
// Separate from SkillsRegistry to avoid conflicts with full Skill interface

import type { AutoSkill } from '../core/skill-generator.js';

class AutoSkillRegistry {
  private skills: Map<string, AutoSkill> = new Map();

  register(skill: AutoSkill): void {
    this.skills.set(skill.id, skill);
  }

  findById(id: string): AutoSkill | undefined {
    return this.skills.get(id);
  }

  findByTriggers(triggers: string[]): AutoSkill[] {
    const lower = triggers.map((t) => t.toLowerCase());
    return Array.from(this.skills.values()).filter((s) =>
      s.trigger.some((t) => lower.includes(t.toLowerCase())),
    );
  }

  list(): AutoSkill[] {
    return Array.from(this.skills.values());
  }

  clear(): void {
    this.skills.clear();
  }
}

export const autoRegistry = new AutoSkillRegistry();
export { AutoSkillRegistry };
