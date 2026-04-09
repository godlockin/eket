/**
 * Tests for CLI Completion Generator
 */

import { generateCompletion } from '../src/utils/completion.js';

describe('CLI Completion Generator', () => {
  describe('generateCompletion', () => {
    it('should generate bash completion script', () => {
      const script = generateCompletion('bash');
      expect(script).toContain('_eket_cli_completion');
      expect(script).toContain('complete -F _eket_cli_completion');
    });

    it('should generate zsh completion script', () => {
      const script = generateCompletion('zsh');
      expect(script).toContain('_eket_cli_completion');
      expect(script).toContain('compdef');
    });

    it('should throw error for unsupported shell', () => {
      expect(() => generateCompletion('fish' as any)).toThrow('Unsupported shell');
    });

    it('should include all CLI commands in bash script', () => {
      const script = generateCompletion('bash');
      const expectedCommands = [
        'redis:check',
        'sqlite:check',
        'instance:start',
        'task:claim',
        'web:dashboard',
      ];

      expectedCommands.forEach((cmd) => {
        expect(script).toContain(cmd);
      });
    });

    it('should include role options in bash script', () => {
      const script = generateCompletion('bash');
      const expectedRoles = [
        'frontend_dev',
        'backend_dev',
        'qa_engineer',
        'devops_engineer',
      ];

      expectedRoles.forEach((role) => {
        expect(script).toContain(role);
      });
    });
  });
});
