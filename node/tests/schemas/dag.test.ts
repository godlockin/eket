/**
 * EKET DAG Schema Tests
 * TASK-643: Shell injection protection tests
 */

import {
  validateDag,
  validateForeachItem,
  escapeShellArg,
  SAFE_ITEM_PATTERN,
  ValidationOptions,
} from '../../src/schemas/dag.js';

describe('TASK-643: Shell injection protection', () => {
  describe('escapeShellArg', () => {
    it('wraps simple string in single quotes', () => {
      expect(escapeShellArg('hello')).toBe("'hello'");
      expect(escapeShellArg('file.txt')).toBe("'file.txt'");
      expect(escapeShellArg('my-item_1')).toBe("'my-item_1'");
    });

    it('escapes internal single quotes', () => {
      expect(escapeShellArg("it's")).toBe("'it'\\''s'");
      expect(escapeShellArg("don't")).toBe("'don'\\''t'");
    });

    it('safely handles dangerous shell characters', () => {
      expect(escapeShellArg('a; rm -rf /')).toBe("'a; rm -rf /'");
      expect(escapeShellArg('$(cat /etc/passwd)')).toBe("'$(cat /etc/passwd)'");
      expect(escapeShellArg('`whoami`')).toBe("'`whoami`'");
      expect(escapeShellArg('foo|bar')).toBe("'foo|bar'");
      expect(escapeShellArg('foo&bar')).toBe("'foo&bar'");
    });
  });

  describe('SAFE_ITEM_PATTERN', () => {
    it('matches safe characters', () => {
      expect(SAFE_ITEM_PATTERN.test('hello')).toBe(true);
      expect(SAFE_ITEM_PATTERN.test('file.txt')).toBe(true);
      expect(SAFE_ITEM_PATTERN.test('my-item_1')).toBe(true);
      expect(SAFE_ITEM_PATTERN.test('path/to/file')).toBe(true);
      expect(SAFE_ITEM_PATTERN.test('item with spaces')).toBe(true);
    });

    it('rejects dangerous characters', () => {
      expect(SAFE_ITEM_PATTERN.test('a; rm -rf /')).toBe(false);
      expect(SAFE_ITEM_PATTERN.test('$(cat /etc/passwd)')).toBe(false);
      expect(SAFE_ITEM_PATTERN.test('`whoami`')).toBe(false);
      expect(SAFE_ITEM_PATTERN.test('foo|bar')).toBe(false);
      expect(SAFE_ITEM_PATTERN.test('foo&bar')).toBe(false);
      expect(SAFE_ITEM_PATTERN.test('${HOME}')).toBe(false);
    });
  });

  describe('validateForeachItem', () => {
    it('returns null for safe items', () => {
      expect(validateForeachItem('hello')).toBeNull();
      expect(validateForeachItem('file.txt')).toBeNull();
      expect(validateForeachItem('my-item_1')).toBeNull();
    });

    it('returns error for unsafe items', () => {
      expect(validateForeachItem('a; rm -rf /')).toContain('Unsafe characters');
      expect(validateForeachItem('$(cat /etc/passwd)')).toContain('Unsafe characters');
    });

    it('bypasses validation with unsafeItems=true', () => {
      expect(validateForeachItem('a; rm -rf /', true)).toBeNull();
      expect(validateForeachItem('$(cat /etc/passwd)', true)).toBeNull();
    });
  });

  describe('validateDag with foreach items', () => {
    const validDag = {
      version: '1.0',
      epic: 'EPIC-017',
      nodes: [
        {
          id: 'batch-process',
          type: 'foreach',
          items: ['item1', 'item2', 'item-3'],
          script: 'echo ${item}',
        },
      ],
    };

    const maliciousDag = {
      version: '1.0',
      epic: 'EPIC-017',
      nodes: [
        {
          id: 'batch-process',
          type: 'foreach',
          items: ['safe', 'a; rm -rf /', '$(cat /etc/passwd)'],
          script: 'echo ${item}',
        },
      ],
    };

    it('accepts safe foreach items', () => {
      const result = validateDag(validDag);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects malicious foreach items', () => {
      const result = validateDag(maliciousDag);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNSAFE_ITEM')).toBe(true);
      expect(result.errors.length).toBe(2); // Two unsafe items
    });

    it('bypasses validation with unsafeItems option', () => {
      const options: ValidationOptions = { unsafeItems: true };
      const result = validateDag(maliciousDag, options);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('provides descriptive error for each unsafe item', () => {
      const result = validateDag(maliciousDag);
      const unsafeErrors = result.errors.filter((e) => e.code === 'UNSAFE_ITEM');
      expect(unsafeErrors.length).toBe(2);
      expect(unsafeErrors[0].path).toBe('nodes[0].items[1]');
      expect(unsafeErrors[1].path).toBe('nodes[0].items[2]');
    });
  });
});

describe('validateDag - existing tests', () => {
  it('validates correct DAG', () => {
    const dag = {
      version: '1.0',
      epic: 'EPIC-017',
      nodes: [
        { id: 'TASK-001', script: 'echo hello' },
        { id: 'TASK-002', script: 'echo world', deps: ['TASK-001'] },
      ],
    };
    const result = validateDag(dag);
    expect(result.valid).toBe(true);
  });

  it('detects circular dependencies', () => {
    const dag = {
      version: '1.0',
      epic: 'EPIC-017',
      nodes: [
        { id: 'TASK-001', script: 'echo a', deps: ['TASK-002'] },
        { id: 'TASK-002', script: 'echo b', deps: ['TASK-001'] },
      ],
    };
    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('validates gate nodes require condition', () => {
    const dag = {
      version: '1.0',
      epic: 'EPIC-017',
      nodes: [{ id: 'gate-check', type: 'gate' }],
    };
    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_FIELD')).toBe(true);
  });

  it('validates foreach nodes require items', () => {
    const dag = {
      version: '1.0',
      epic: 'EPIC-017',
      nodes: [{ id: 'batch', type: 'foreach', script: 'echo ${item}' }],
    };
    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_FIELD')).toBe(true);
  });
});
