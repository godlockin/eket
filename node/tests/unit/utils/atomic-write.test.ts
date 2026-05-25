/**
 * Unit tests for atomic-write.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';

import { atomicWrite, atomicWriteJSON } from '../../../src/utils/atomic-write.js';

describe('atomic-write', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eket-atomic-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('atomicWrite', () => {
    it('should write content to file', async () => {
      const filepath = path.join(tempDir, 'test.txt');
      await atomicWrite(filepath, 'Hello, World!');

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe('Hello, World!');
    });

    it('should create parent directories if not exist', async () => {
      const filepath = path.join(tempDir, 'nested', 'deep', 'test.txt');
      await atomicWrite(filepath, 'Nested content');

      expect(existsSync(filepath)).toBe(true);
      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe('Nested content');
    });

    it('should overwrite existing file', async () => {
      const filepath = path.join(tempDir, 'overwrite.txt');
      await atomicWrite(filepath, 'Original');
      await atomicWrite(filepath, 'Updated');

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe('Updated');
    });

    it('should not leave tmp files on success', async () => {
      const filepath = path.join(tempDir, 'clean.txt');
      await atomicWrite(filepath, 'Content');

      const files = await fs.readdir(tempDir);
      expect(files).toEqual(['clean.txt']);
    });

    it('should handle empty content', async () => {
      const filepath = path.join(tempDir, 'empty.txt');
      await atomicWrite(filepath, '');

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe('');
    });

    it('should handle unicode content', async () => {
      const filepath = path.join(tempDir, 'unicode.txt');
      const unicodeContent = '你好世界 🚀 émojis';
      await atomicWrite(filepath, unicodeContent);

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe(unicodeContent);
    });

    it('should handle multiline content', async () => {
      const filepath = path.join(tempDir, 'multiline.txt');
      const multiline = 'Line 1\nLine 2\nLine 3';
      await atomicWrite(filepath, multiline);

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe(multiline);
    });
  });

  describe('atomicWriteJSON', () => {
    it('should write JSON with pretty formatting by default', async () => {
      const filepath = path.join(tempDir, 'data.json');
      const data = { name: 'test', value: 42 };
      await atomicWriteJSON(filepath, data);

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe(JSON.stringify(data, null, 2));
    });

    it('should write compact JSON when pretty is false', async () => {
      const filepath = path.join(tempDir, 'compact.json');
      const data = { name: 'test', value: 42 };
      await atomicWriteJSON(filepath, data, false);

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe(JSON.stringify(data));
    });

    it('should handle nested objects', async () => {
      const filepath = path.join(tempDir, 'nested.json');
      const data = {
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      };
      await atomicWriteJSON(filepath, data);

      const parsed = JSON.parse(await fs.readFile(filepath, 'utf-8'));
      expect(parsed.level1.level2.level3).toBe('deep');
    });

    it('should handle arrays', async () => {
      const filepath = path.join(tempDir, 'array.json');
      const data = { items: [1, 2, 3], tags: ['a', 'b'] };
      await atomicWriteJSON(filepath, data);

      const parsed = JSON.parse(await fs.readFile(filepath, 'utf-8'));
      expect(parsed.items).toEqual([1, 2, 3]);
      expect(parsed.tags).toEqual(['a', 'b']);
    });

    it('should handle null and undefined', async () => {
      const filepath = path.join(tempDir, 'nullish.json');
      const data = { nullValue: null, defined: 'yes' };
      await atomicWriteJSON(filepath, data);

      const parsed = JSON.parse(await fs.readFile(filepath, 'utf-8'));
      expect(parsed.nullValue).toBeNull();
      expect(parsed.defined).toBe('yes');
    });

    it('should handle boolean values', async () => {
      const filepath = path.join(tempDir, 'bool.json');
      const data = { active: true, deleted: false };
      await atomicWriteJSON(filepath, data);

      const parsed = JSON.parse(await fs.readFile(filepath, 'utf-8'));
      expect(parsed.active).toBe(true);
      expect(parsed.deleted).toBe(false);
    });

    it('should handle empty object', async () => {
      const filepath = path.join(tempDir, 'empty.json');
      await atomicWriteJSON(filepath, {});

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe('{}');
    });

    it('should handle empty array', async () => {
      const filepath = path.join(tempDir, 'empty-array.json');
      await atomicWriteJSON(filepath, []);

      const content = await fs.readFile(filepath, 'utf-8');
      expect(content).toBe('[]');
    });
  });
});
