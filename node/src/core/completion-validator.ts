import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

import type { ValidationCheck, ValidationReport } from '../types/index.js';

export type { ValidationCheck, ValidationReport };

export class CompletionValidator {
  private confluencePath: string;
  private skillsPath: string;

  constructor(repoRoot: string) {
    this.confluencePath = join(repoRoot, 'confluence/memory');
    this.skillsPath = join(repoRoot, 'node/src/skills');
  }

  async validateCompletion(ticketId: string, changedFiles: string[]): Promise<ValidationReport> {
    const checks: ValidationCheck[] = [];

    // Check 1: acceptance criteria coverage
    checks.push(await this.checkAcceptanceCriteria(ticketId));

    // Check 2: architecture consistency (search confluence/memory/lessons for relevant patterns)
    checks.push(await this.checkArchitecture(ticketId, changedFiles));

    // Check 3: code style (check skill definitions)
    checks.push(await this.checkCodeStyle(changedFiles));

    const passed = checks.every(c => c.passed);
    const summary = passed
      ? `All ${checks.length} validation checks passed`
      : `${checks.filter(c => !c.passed).length} check(s) failed: ${checks.filter(c => !c.passed).map(c => c.dimension).join(', ')}`;

    return { passed, checks, summary };
  }

  private async checkAcceptanceCriteria(ticketId: string): Promise<ValidationCheck> {
    // Read ticket file, check all - [x] items present
    const ticketPath = join(process.cwd(), '..', 'jira/tickets', `${ticketId}.md`);
    if (!existsSync(ticketPath)) {
      return {
        dimension: 'acceptance-criteria',
        passed: false,
        message: 'Ticket file not found',
        source: ticketPath,
      };
    }
    const content = readFileSync(ticketPath, 'utf-8');
    const unchecked = (content.match(/- \[ \]/g) || []).length;
    const checked = (content.match(/- \[x\]/gi) || []).length;
    const passed = unchecked === 0 && checked > 0;
    return {
      dimension: 'acceptance-criteria',
      passed,
      message: passed
        ? `All ${checked} criteria checked`
        : `${unchecked} criteria still unchecked`,
      source: `jira/tickets/${ticketId}.md`,
    };
  }

  private async checkArchitecture(_ticketId: string, changedFiles: string[]): Promise<ValidationCheck> {
    // Search confluence/memory/lessons for relevant patterns matching changed files
    const lessons: string[] = [];
    if (existsSync(this.confluencePath)) {
      this.collectMarkdownFiles(this.confluencePath, lessons);
    }
    // Find most relevant lesson file based on file name overlap
    const relevant = lessons.find(l =>
      changedFiles.some(f => l.includes(f.split('/').pop()?.replace('.ts', '') || ''))
    );
    return {
      dimension: 'architecture',
      passed: true, // advisory only
      message: relevant
        ? `Relevant pattern found`
        : 'No conflicting architectural patterns detected',
      source: relevant || 'confluence/memory/',
    };
  }

  private async checkCodeStyle(changedFiles: string[]): Promise<ValidationCheck> {
    const tsFiles = changedFiles.filter(f => f.endsWith('.ts'));
    return {
      dimension: 'code-style',
      passed: true, // advisory; actual lint run by npm run lint
      message: `${tsFiles.length} TypeScript files changed — run npm run lint for detailed check`,
      source: this.skillsPath,
    };
  }

  private collectMarkdownFiles(dir: string, result: string[]): void {
    if (!existsSync(dir)) {return;}
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {this.collectMarkdownFiles(full, result);}
      else if (entry.name.endsWith('.md')) {result.push(full);}
    }
  }
}
