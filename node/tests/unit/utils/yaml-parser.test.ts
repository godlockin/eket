/**
 * Unit tests for yaml-parser.ts
 */

import {
  parseYAMLValue,
  parseSimpleYAML,
  toSimpleYAML,
} from '../../../src/utils/yaml-parser.js';

describe('yaml-parser', () => {
  describe('parseYAMLValue', () => {
    it('should parse true boolean', () => {
      expect(parseYAMLValue('true')).toBe(true);
    });

    it('should parse false boolean', () => {
      expect(parseYAMLValue('false')).toBe(false);
    });

    it('should parse double-quoted string', () => {
      expect(parseYAMLValue('"hello world"')).toBe('hello world');
    });

    it('should parse single-quoted string', () => {
      expect(parseYAMLValue("'hello world'")).toBe('hello world');
    });

    it('should parse integer', () => {
      expect(parseYAMLValue('42')).toBe(42);
    });

    it('should parse float', () => {
      expect(parseYAMLValue('3.14')).toBe(3.14);
    });

    it('should parse empty array', () => {
      expect(parseYAMLValue('[]')).toEqual([]);
    });

    it('should parse simple array', () => {
      expect(parseYAMLValue('[a, b, c]')).toEqual(['a', 'b', 'c']);
    });

    it('should parse array with numbers', () => {
      expect(parseYAMLValue('[1, 2, 3]')).toEqual([1, 2, 3]);
    });

    it('should return plain string for unquoted text', () => {
      expect(parseYAMLValue('plain text')).toBe('plain text');
    });

    it('should handle whitespace', () => {
      expect(parseYAMLValue('  true  ')).toBe(true);
      expect(parseYAMLValue('  42  ')).toBe(42);
    });

    it('should handle negative looking number as string', () => {
      expect(parseYAMLValue('-5')).toBe('-5');
    });
  });

  describe('parseSimpleYAML', () => {
    it('should parse simple key-value pairs', () => {
      const yaml = `
name: test
version: 1.0
`;
      const result = parseSimpleYAML(yaml);
      expect(result.name).toBe('test');
      expect(result.version).toBe(1);
    });

    it('should parse nested structure', () => {
      const yaml = `
config:
  host: localhost
  port: 8080
`;
      const result = parseSimpleYAML(yaml);
      expect(result.config).toEqual({
        host: 'localhost',
        port: 8080,
      });
    });

    it('should parse deeply nested structure', () => {
      const yaml = `
level1:
  level2:
    level3:
      value: deep
`;
      const result = parseSimpleYAML(yaml);
      const config = result as { level1: { level2: { level3: { value: string } } } };
      expect(config.level1.level2.level3.value).toBe('deep');
    });

    it('should skip comments', () => {
      const yaml = `
# This is a comment
name: test
# Another comment
value: 42
`;
      const result = parseSimpleYAML(yaml);
      expect(result.name).toBe('test');
      expect(result.value).toBe(42);
    });

    it('should skip empty lines', () => {
      const yaml = `
name: test

value: 42

`;
      const result = parseSimpleYAML(yaml);
      expect(Object.keys(result)).toEqual(['name', 'value']);
    });

    it('should parse boolean values', () => {
      const yaml = `
enabled: true
disabled: false
`;
      const result = parseSimpleYAML(yaml);
      expect(result.enabled).toBe(true);
      expect(result.disabled).toBe(false);
    });

    it('should parse array values', () => {
      const yaml = `
tags: [frontend, backend]
`;
      const result = parseSimpleYAML(yaml);
      expect(result.tags).toEqual(['frontend', 'backend']);
    });

    it('should handle quoted strings', () => {
      const yaml = `
message: "Hello, World!"
single: 'Single quoted'
`;
      const result = parseSimpleYAML(yaml);
      expect(result.message).toBe('Hello, World!');
      expect(result.single).toBe('Single quoted');
    });

    it('should handle empty input', () => {
      const result = parseSimpleYAML('');
      expect(result).toEqual({});
    });

    it('should handle only comments', () => {
      const yaml = `
# Comment 1
# Comment 2
`;
      const result = parseSimpleYAML(yaml);
      expect(result).toEqual({});
    });

    it('should handle keys with hyphens', () => {
      const yaml = `
my-key: my-value
another-key: 123
`;
      const result = parseSimpleYAML(yaml);
      expect(result['my-key']).toBe('my-value');
      expect(result['another-key']).toBe(123);
    });
  });

  describe('toSimpleYAML', () => {
    it('should convert simple object to YAML', () => {
      const obj = { name: 'test', value: 42 };
      const yaml = toSimpleYAML(obj);

      expect(yaml).toContain('name: test');
      expect(yaml).toContain('value: 42');
    });

    it('should handle nested objects', () => {
      const obj = {
        config: {
          host: 'localhost',
          port: 8080,
        },
      };
      const yaml = toSimpleYAML(obj);

      expect(yaml).toContain('config:');
      expect(yaml).toContain('  host: localhost');
      expect(yaml).toContain('  port: 8080');
    });

    it('should handle boolean values', () => {
      const obj = { enabled: true, disabled: false };
      const yaml = toSimpleYAML(obj);

      expect(yaml).toContain('enabled: true');
      expect(yaml).toContain('disabled: false');
    });

    it('should handle null values', () => {
      const obj = { value: null };
      const yaml = toSimpleYAML(obj);

      expect(yaml).toContain('value: null');
    });

    it('should handle simple arrays', () => {
      const obj = { items: ['a', 'b', 'c'] };
      const yaml = toSimpleYAML(obj);

      expect(yaml).toContain('items:');
      expect(yaml).toContain('  - a');
      expect(yaml).toContain('  - b');
      expect(yaml).toContain('  - c');
    });

    it('should handle special characters in strings', () => {
      const obj = { path: '/api/v1:8080', comment: 'Has # inside' };
      const yaml = toSimpleYAML(obj);

      expect(yaml).toContain('path: "/api/v1:8080"');
      expect(yaml).toContain('comment: "Has # inside"');
    });

    it('should handle empty object', () => {
      const yaml = toSimpleYAML({});
      expect(yaml).toBe('');
    });

    it('should handle numbers', () => {
      const obj = { integer: 42, float: 3.14 };
      const yaml = toSimpleYAML(obj);

      expect(yaml).toContain('integer: 42');
      expect(yaml).toContain('float: 3.14');
    });
  });

  describe('roundtrip', () => {
    it('should parse what was generated (simple)', () => {
      const original = { name: 'test', value: 42, enabled: true };
      const yaml = toSimpleYAML(original);
      const parsed = parseSimpleYAML(yaml);

      expect(parsed.name).toBe(original.name);
      expect(parsed.value).toBe(original.value);
      expect(parsed.enabled).toBe(original.enabled);
    });

    it('should parse what was generated (nested)', () => {
      const original = {
        config: {
          host: 'localhost',
          port: 8080,
        },
      };
      const yaml = toSimpleYAML(original);
      const parsed = parseSimpleYAML(yaml);

      expect(parsed.config).toEqual(original.config);
    });
  });
});
