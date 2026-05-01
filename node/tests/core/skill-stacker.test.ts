/**
 * Tests for SkillStacker (TASK-118)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { SkillStacker } from '../../src/core/skill-stacker.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-stacker-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SkillStacker', () => {
  test('load single skill with triggers and constraints', async () => {
    const skillDef = {
      id: 'git-master',
      triggers: ['git commit', 'git push'],
      constraints: ['no force push to main'],
    };
    fs.writeFileSync(path.join(tmpDir, 'git-master.json'), JSON.stringify(skillDef));

    const stacker = new SkillStacker(tmpDir);
    const ctx = await stacker.loadStack(['git-master']);

    expect(ctx.skillIds).toEqual(['git-master']);
    expect(ctx.mergedTriggers).toContain('git commit');
    expect(ctx.mergedConstraints).toContain('no force push to main');
    expect(ctx.loadedAt).toBeGreaterThan(0);
  });

  test('load multiple skills and merge triggers/constraints deduped', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'skill-a.json'),
      JSON.stringify({ triggers: ['trigger-shared', 'trigger-a'], constraints: ['c-shared'] })
    );
    fs.writeFileSync(
      path.join(tmpDir, 'skill-b.json'),
      JSON.stringify({ triggers: ['trigger-shared', 'trigger-b'], constraints: ['c-shared', 'c-b'] })
    );

    const stacker = new SkillStacker(tmpDir);
    const ctx = await stacker.loadStack(['skill-a', 'skill-b']);

    expect(ctx.skillIds).toEqual(['skill-a', 'skill-b']);
    // deduped
    expect(ctx.mergedTriggers.filter((t) => t === 'trigger-shared')).toHaveLength(1);
    expect(ctx.mergedTriggers).toContain('trigger-a');
    expect(ctx.mergedTriggers).toContain('trigger-b');
    expect(ctx.mergedConstraints.filter((c) => c === 'c-shared')).toHaveLength(1);
  });

  test('handle missing skill gracefully (no file = skip)', async () => {
    const stacker = new SkillStacker(tmpDir);
    const ctx = await stacker.loadStack(['nonexistent-skill']);

    expect(ctx.skillIds).toEqual(['nonexistent-skill']);
    expect(ctx.mergedTriggers).toHaveLength(0);
    expect(ctx.mergedConstraints).toHaveLength(0);
  });

  test('load skill from subdirectory', async () => {
    const subDir = path.join(tmpDir, 'security');
    fs.mkdirSync(subDir);
    fs.writeFileSync(
      path.join(subDir, 'security-review.json'),
      JSON.stringify({ triggers: ['security scan'], constraints: ['must pass SAST'] })
    );

    const stacker = new SkillStacker(tmpDir);
    const ctx = await stacker.loadStack(['security-review']);

    expect(ctx.mergedTriggers).toContain('security scan');
    expect(ctx.mergedConstraints).toContain('must pass SAST');
  });

  test('empty skillIds returns empty context', async () => {
    const stacker = new SkillStacker(tmpDir);
    const ctx = await stacker.loadStack([]);

    expect(ctx.skillIds).toHaveLength(0);
    expect(ctx.mergedTriggers).toHaveLength(0);
    expect(ctx.mergedConstraints).toHaveLength(0);
  });
});
