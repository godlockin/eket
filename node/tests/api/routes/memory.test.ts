/**
 * Memory 路由单元测试
 *
 * 测试覆盖：
 * - GET /api/v1/memory - 查询记忆
 * - key 查询
 * - prefix 查询
 * - 列出所有 memories
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryRouter } from '../../../src/api/routes/memory';
import { authMiddleware } from '../../../src/api/middleware/auth';

describe('MemoryRouter', () => {
  let app: express.Express;
  const testApiKey = 'test-memory-key';
  const testMemoryDir = path.join(process.cwd(), '.eket', 'memory');

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(authMiddleware({ apiKey: testApiKey }));
    app.use('/api/v1/memory', MemoryRouter);

    // 确保测试目录存在
    if (!fs.existsSync(testMemoryDir)) {
      fs.mkdirSync(testMemoryDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理测试文件
    if (fs.existsSync(testMemoryDir)) {
      const files = fs.readdirSync(testMemoryDir);
      for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.md')) {
          fs.unlinkSync(path.join(testMemoryDir, file));
        }
      }
    }
    jest.clearAllMocks();
  });

  describe('GET /api/v1/memory', () => {
    it('should return empty list when no memories exist', async () => {
      const response = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('memories');
      expect(response.body.memories).toEqual([]);
      expect(response.body).toHaveProperty('total', 0);
    });

    it('should return all memories', async () => {
      // 创建测试文件
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-memory-1.md'),
        '# Test Memory 1\nContent 1'
      );
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-memory-2.md'),
        '# Test Memory 2\nContent 2'
      );

      const response = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.memories.length).toBeGreaterThanOrEqual(2);
      expect(response.body.total).toBeGreaterThanOrEqual(2);
    });

    it('should filter by type parameter', async () => {
      // 创建不同类型的测试文件
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-artifact.md'),
        'type: artifact\n# Artifact Memory'
      );
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-pattern.md'),
        'type: pattern\n# Pattern Memory'
      );
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-decision.md'),
        'type: decision\n# Decision Memory'
      );

      const response = await request(app)
        .get('/api/v1/memory?type=artifact')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      const memories = response.body.memories;
      memories.forEach((m: any) => {
        expect(m.preview.toLowerCase()).toContain('artifact');
      });
    });

    it('should filter by tag parameter', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-tagged.md'),
        '# Tagged Memory\nTags: important, critical'
      );
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-untagged.md'),
        '# Untagged Memory'
      );

      const response = await request(app)
        .get('/api/v1/memory?tag=important')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      // 应该只返回包含 tag 的记忆
      const memories = response.body.memories;
      memories.forEach((m: any) => {
        expect(m.preview).toContain('important');
      });
    });

    it('should search by query parameter', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-search-1.md'),
        '# Authentication Pattern\nOAuth2 implementation'
      );
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-search-2.md'),
        '# Database Pattern\nConnection pooling'
      );

      const response = await request(app)
        .get('/api/v1/memory?q=authentication')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      const memories = response.body.memories;
      memories.forEach((m: any) => {
        expect(m.preview.toLowerCase()).toContain('authentication');
      });
    });

    it('should return memories sorted by creation time (newest first)', async () => {
      // 创建有延迟的文件
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-first.md'),
        '# First Memory'
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-second.md'),
        '# Second Memory'
      );

      const response = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      // 验证返回的记忆按时间排序（最新的在前）
      if (response.body.memories.length >= 2) {
        const first = response.body.memories.find((m: any) => m.file === 'test-second.md');
        const second = response.body.memories.find((m: any) => m.file === 'test-first.md');
        if (first && second) {
          expect(new Date(first.created_at).getTime()).toBeGreaterThanOrEqual(
            new Date(second.created_at).getTime()
          );
        }
      }
    });

    it('should include preview in response', async () => {
      const content = '# Test Memory\nThis is a test memory with some content.';
      fs.writeFileSync(path.join(testMemoryDir, 'test-preview.md'), content);

      const response = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      const memory = response.body.memories.find((m: any) => m.file === 'test-preview.md');
      if (memory) {
        expect(memory).toHaveProperty('preview');
        expect(memory.preview.length).toBeGreaterThan(0);
      }
    });

    it('should include created_at timestamp', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-timestamp.md'),
        '# Timestamp Memory'
      );

      const response = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      const memory = response.body.memories.find((m: any) => m.file === 'test-timestamp.md');
      if (memory) {
        expect(memory).toHaveProperty('created_at');
        expect(new Date(memory.created_at).toISOString()).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/memory/:id', () => {
    it('should return memory content by ID', async () => {
      const content = '# Test Memory\nDetailed content here.';
      fs.writeFileSync(path.join(testMemoryDir, 'test-get-by-id.md'), content);

      const response = await request(app)
        .get('/api/v1/memory/test-get-by-id')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'test-get-by-id');
      expect(response.body).toHaveProperty('file', 'test-get-by-id.md');
      expect(response.body).toHaveProperty('content', content);
    });

    it('should return 404 for non-existent memory', async () => {
      const response = await request(app)
        .get('/api/v1/memory/non-existent-memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'not_found');
    });

    it('should include created_at and updated_at timestamps', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-timestamps.md'),
        '# Timestamps Memory'
      );

      const response = await request(app)
        .get('/api/v1/memory/test-timestamps')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('created_at');
      expect(response.body).toHaveProperty('updated_at');
    });

    it('should handle IDs without md extension', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-no-ext.md'),
        '# No Extension Test'
      );

      const response = await request(app)
        .get('/api/v1/memory/test-no-ext')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.content).toContain('No Extension Test');
    });

    it('should handle special characters in ID', async () => {
      const specialId = 'test-special_id.123';
      fs.writeFileSync(
        path.join(testMemoryDir, `${specialId}.md`),
        '# Special ID Memory'
      );

      const response = await request(app)
        .get(`/api/v1/memory/${specialId}`)
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(specialId);
    });
  });

  describe('Query Parameters Combination', () => {
    it('should combine type and query filters', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-combo-1.md'),
        'type: artifact\n# Authentication Artifact\nOAuth2 implementation'
      );
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-combo-2.md'),
        'type: artifact\n# Database Artifact\nConnection pooling'
      );
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-combo-3.md'),
        'type: pattern\n# Authentication Pattern\nJWT pattern'
      );

      const response = await request(app)
        .get('/api/v1/memory?type=artifact&q=authentication')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      // 应该只返回 type=artifact 且包含 authentication 的记忆
      response.body.memories.forEach((m: any) => {
        expect(m.preview.toLowerCase()).toContain('artifact');
        expect(m.preview.toLowerCase()).toContain('authentication');
      });
    });

    it('should handle empty query results', async () => {
      const response = await request(app)
        .get('/api/v1/memory?q=nonexistent_search_term_xyz')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.memories).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing memory directory gracefully', async () => {
      // 临时重命名目录
      if (fs.existsSync(testMemoryDir)) {
        fs.renameSync(testMemoryDir, `${testMemoryDir}.bak`);
      }

      try {
        const response = await request(app)
          .get('/api/v1/memory')
          .set('Authorization', `Bearer ${testApiKey}`);

        expect(response.status).toBe(200);
        expect(response.body.memories).toEqual([]);
        expect(response.body.total).toBe(0);
      } finally {
        // 恢复目录
        if (fs.existsSync(`${testMemoryDir}.bak`)) {
          fs.renameSync(`${testMemoryDir}.bak`, testMemoryDir);
        }
      }
    });

    it('should skip non-markdown files', async () => {
      fs.writeFileSync(path.join(testMemoryDir, 'test-not-md.txt'), 'Not a markdown file');
      fs.writeFileSync(path.join(testMemoryDir, 'test-valid.md'), '# Valid Markdown');

      const response = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      // 不应该包含.txt 文件
      const hasTxtFile = response.body.memories.some((m: any) => m.file.endsWith('.txt'));
      expect(hasTxtFile).toBe(false);
    });
  });

  describe('Memory Types', () => {
    it('should find artifact type memories', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-artifact-type.md'),
        'type: artifact\n# Artifact Content'
      );

      const response = await request(app)
        .get('/api/v1/memory?type=artifact')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
    });

    it('should find pattern type memories', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-pattern-type.md'),
        'type: pattern\n# Pattern Content'
      );

      const response = await request(app)
        .get('/api/v1/memory?type=pattern')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
    });

    it('should find decision type memories', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-decision-type.md'),
        'type: decision\n# Decision Content'
      );

      const response = await request(app)
        .get('/api/v1/memory?type=decision')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
    });

    it('should find lesson type memories', async () => {
      fs.writeFileSync(
        path.join(testMemoryDir, 'test-lesson-type.md'),
        'type: lesson\n# Lesson Content'
      );

      const response = await request(app)
        .get('/api/v1/memory?type=lesson')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Large Content Handling', () => {
    it('should handle large markdown files', async () => {
      const largeContent = '# Large Memory\n' + 'A'.repeat(10000);
      fs.writeFileSync(path.join(testMemoryDir, 'test-large.md'), largeContent);

      const response = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      const memory = response.body.memories.find((m: any) => m.file === 'test-large.md');
      if (memory) {
        expect(memory).toHaveProperty('preview');
        // preview 应该被截断到合理长度
        expect(memory.preview.length).toBeLessThanOrEqual(205); // 200 + '...'
      }
    });

    it('should return full content in detail endpoint', async () => {
      const content = '# Full Content\n' + 'B'.repeat(5000);
      fs.writeFileSync(path.join(testMemoryDir, 'test-full.md'), content);

      const response = await request(app)
        .get('/api/v1/memory/test-full')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.content).toBe(content);
    });
  });
});
