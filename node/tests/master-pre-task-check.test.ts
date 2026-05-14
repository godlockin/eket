/**
 * Master Pre-Task Check 单元测试
 * TASK-626 - Pre-Task 自动检查脚本
 *
 * 测试覆盖：
 * - Ticket 文件存在性检查
 * - 依赖文件存在性检查（创建/修改/删除）
 * - 重复任务检测
 * - 文件归属合规检查
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { runPreTaskCheck } from '../src/commands/task-create.js';

// 测试用临时目录
const TEST_ROOT = path.join(process.cwd(), '.test-tmp-pre-check');
const TICKETS_DIR = path.join(TEST_ROOT, 'jira', 'tickets');
const SCRIPTS_DIR = path.join(TEST_ROOT, 'scripts');

describe('Master Pre-Task Check', () => {
  beforeEach(() => {
    // 创建测试目录结构
    fs.mkdirSync(TICKETS_DIR, { recursive: true });
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

    // 复制脚本到测试目录
    // 脚本在项目根目录 (../scripts/)
    const projectRoot = path.resolve(process.cwd(), '..');
    const sourceScript = path.join(projectRoot, 'scripts', 'master-pre-task-check.sh');
    const targetScript = path.join(SCRIPTS_DIR, 'master-pre-task-check.sh');

    if (fs.existsSync(sourceScript)) {
      fs.copyFileSync(sourceScript, targetScript);
      fs.chmodSync(targetScript, 0o755);
    }
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(TEST_ROOT)) {
      fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  describe('基础检查', () => {
    it('脚本不存在时应跳过检查', async () => {
      // 删除脚本
      const scriptPath = path.join(SCRIPTS_DIR, 'master-pre-task-check.sh');
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
      }

      const result = await runPreTaskCheck('TASK-999', TEST_ROOT);
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
    });

    it('Ticket 文件不存在应报错', async () => {
      const result = await runPreTaskCheck('TASK-999', TEST_ROOT);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Ticket 文件不存在');
    });

    it('正常 Ticket 应通过检查', async () => {
      // 创建简单 ticket
      const ticketPath = path.join(TICKETS_DIR, 'TASK-100.md');
      fs.writeFileSync(
        ticketPath,
        `# TASK-100: 测试任务

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P2

## 验收标准
- 实现功能 X
`,
        'utf-8',
      );

      const result = await runPreTaskCheck('TASK-100', TEST_ROOT);
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('依赖文件检查', () => {
    it('创建已存在文件应报错', async () => {
      // 创建 ticket 要求创建 README.md
      const ticketPath = path.join(TICKETS_DIR, 'TASK-200.md');
      fs.writeFileSync(
        ticketPath,
        `# TASK-200: 创建 README

## 验收标准
- 创建 \`README.md\`
`,
        'utf-8',
      );

      // 先创建 README.md
      const readmePath = path.join(TEST_ROOT, 'README.md');
      fs.writeFileSync(readmePath, '# Test', 'utf-8');

      const result = await runPreTaskCheck('TASK-200', TEST_ROOT);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('重复任务');
      expect(result.output).toContain('README.md');
    });

    it('修改不存在文件应报错', async () => {
      // 创建 ticket 要求修改不存在的文件
      const ticketPath = path.join(TICKETS_DIR, 'TASK-201.md');
      fs.writeFileSync(
        ticketPath,
        `# TASK-201: 修改配置

## 验收标准
- 修改 \`config/app.yml\`
`,
        'utf-8',
      );

      const result = await runPreTaskCheck('TASK-201', TEST_ROOT);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('依赖缺失');
      expect(result.output).toContain('config/app.yml');
    });

    it('删除不存在文件应报错', async () => {
      // 创建 ticket 要求删除不存在的文件
      const ticketPath = path.join(TICKETS_DIR, 'TASK-202.md');
      fs.writeFileSync(
        ticketPath,
        `# TASK-202: 清理旧文件

## 验收标准
- 删除 \`old/deprecated.ts\`
`,
        'utf-8',
      );

      const result = await runPreTaskCheck('TASK-202', TEST_ROOT);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('依赖缺失');
      expect(result.output).toContain('old/deprecated.ts');
    });
  });

  describe('重复任务检测', () => {
    it('相同标题应警告', async () => {
      // 创建已存在的 ticket
      const existingPath = path.join(TICKETS_DIR, 'TASK-300.md');
      fs.writeFileSync(
        existingPath,
        `# TASK-300: 实现用户登录

## 验收标准
- 功能实现
`,
        'utf-8',
      );

      // 创建新 ticket（标题相同）
      const newPath = path.join(TICKETS_DIR, 'TASK-301.md');
      fs.writeFileSync(
        newPath,
        `# TASK-301: 实现用户登录

## 验收标准
- 功能实现
`,
        'utf-8',
      );

      const result = await runPreTaskCheck('TASK-301', TEST_ROOT);

      // 警告（exit 2）但不阻止
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('可能重复任务');
    });

    it('不同标题应通过', async () => {
      // 创建已存在的 ticket
      const existingPath = path.join(TICKETS_DIR, 'TASK-310.md');
      fs.writeFileSync(
        existingPath,
        `# TASK-310: 实现登录

## 验收标准
- 功能实现
`,
        'utf-8',
      );

      // 创建新 ticket（标题不同）
      const newPath = path.join(TICKETS_DIR, 'TASK-311.md');
      fs.writeFileSync(
        newPath,
        `# TASK-311: 实现注册

## 验收标准
- 功能实现
`,
        'utf-8',
      );

      const result = await runPreTaskCheck('TASK-311', TEST_ROOT);
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('文件归属检查', () => {
    it('Ticket 文件应在 jira/ 目录', async () => {
      // 创建要求在根目录创建 ticket 文件的任务
      const ticketPath = path.join(TICKETS_DIR, 'TASK-400.md');
      fs.writeFileSync(
        ticketPath,
        `# TASK-400: 错误的文件归属

## 验收标准
- 创建 \`TASK-999.md\`
`,
        'utf-8',
      );

      const result = await runPreTaskCheck('TASK-400', TEST_ROOT);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('文件归属违规');
    });

    it('基础设施文件应需审批', async () => {
      // 创建要求修改 Dockerfile 的任务
      const ticketPath = path.join(TICKETS_DIR, 'TASK-401.md');
      fs.writeFileSync(
        ticketPath,
        `# TASK-401: 修改 Docker 配置

## 验收标准
- 创建 \`Dockerfile\`
`,
        'utf-8',
      );

      const result = await runPreTaskCheck('TASK-401', TEST_ROOT);
      expect(result.passed).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('基础设施文件');
    });
  });

  describe('集成测试', () => {
    it('复杂场景：多项检查同时进行', async () => {
      // 创建正常的 ticket
      const ticketPath = path.join(TICKETS_DIR, 'TASK-500.md');
      fs.writeFileSync(
        ticketPath,
        `# TASK-500: 完整测试

## 验收标准
- 创建 \`node/src/utils/new-helper.ts\`
- 修改 \`package.json\`
`,
        'utf-8',
      );

      // 创建 package.json（依赖存在）
      const pkgPath = path.join(TEST_ROOT, 'package.json');
      fs.writeFileSync(pkgPath, '{}', 'utf-8');

      const result = await runPreTaskCheck('TASK-500', TEST_ROOT);
      expect(result.passed).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });
});
