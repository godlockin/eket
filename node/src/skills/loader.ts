/**
 * EKET Framework - Skill Loader
 * Version: 0.9.2
 *
 * 动态加载器：从文件系统动态加载 Skills
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

import type { Skill, SkillLoaderConfig, SkillLoadResult, LoadedSkill } from './types.js';

/**
 * Skill 加载器实现
 * 支持从目录动态加载 Skill 模块
 */
export class SkillLoader {
  /** 配置 */
  private config: Required<SkillLoaderConfig>;

  /** 已加载的 Skills 缓存 */
  private cache: Map<string, LoadedSkill>;

  /** 加载锁（防止并发加载同一 Skill） */
  private loadLocks: Map<string, Promise<Skill | null>>;

  constructor(config?: Partial<SkillLoaderConfig>) {
    // 默认配置
    this.config = {
      skillsRootDir: './skills',
      recursive: true,
      fileExtension: '.ts',
      enableCache: true,
      cacheTTL: 5 * 60 * 1000, // 5 分钟
      ...config,
    };

    this.cache = new Map();
    this.loadLocks = new Map();
  }

  /**
   * 从目录加载所有 Skills
   * @param dir - 要扫描的目录（相对于 skillsRootDir）
   * @returns 加载结果
   */
  async loadFromDirectory(dir?: string): Promise<SkillLoadResult> {
    const scanDir = dir ? path.resolve(this.config.skillsRootDir, dir) : this.config.skillsRootDir;

    // 检查目录是否存在
    if (!fs.existsSync(scanDir)) {
      return {
        success: false,
        error: `Directory not found: ${scanDir}`,
      };
    }

    const stats = {
      total: 0,
      loaded: 0,
      failed: 0,
      skipped: 0,
    };

    const loadedSkills: Skill[] = [];

    try {
      // 扫描目录
      const files = await this.scanDirectory(scanDir);

      for (const file of files) {
        stats.total++;

        try {
          const skill = await this.loadSkillFromFile(file);
          if (skill) {
            loadedSkills.push(skill);
            stats.loaded++;
          } else {
            stats.skipped++;
          }
        } catch (err) {
          stats.failed++;
          console.error(`[SkillLoader] Failed to load ${file}:`, err);
        }
      }

      return {
        success: true,
        skills: loadedSkills,
        stats,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        stats,
      };
    }
  }

  /**
   * 加载单个 Skill
   * @param name - Skill 名称
   * @returns Skill 实例或 null
   */
  async loadSkill(name: string): Promise<Skill | null> {
    // 检查缓存
    if (this.config.enableCache) {
      const cached = this.getCachedSkill(name);
      if (cached) {
        return cached;
      }
    }

    // 检查是否正在加载中（防止并发）
    const lockKey = name;
    if (this.loadLocks.has(lockKey)) {
      return this.loadLocks.get(lockKey)!;
    }

    // 创建加载 Promise
    const loadPromise = this.doLoadSkill(name);
    this.loadLocks.set(lockKey, loadPromise);

    try {
      const skill = await loadPromise;

      // 缓存结果
      if (skill && this.config.enableCache) {
        this.cacheSkill(name, skill);
      }

      return skill;
    } finally {
      // 释放锁
      this.loadLocks.delete(lockKey);
    }
  }

  /**
   * 重新加载所有 Skills
   * 清空缓存并重新扫描
   */
  async reloadAll(): Promise<SkillLoadResult> {
    // 清空缓存
    this.clearCache();

    // 重新加载
    return await this.loadFromDirectory();
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    const count = this.cache.size;
    this.cache.clear();
    console.log(`[SkillLoader] Cleared ${count} cached skills`);
  }

  /**
   * 从缓存获取 Skill
   */
  private getCachedSkill(name: string): Skill | null {
    const cached = this.cache.get(name);

    if (!cached) {
      return null;
    }

    // 检查是否过期
    if (cached.expired) {
      this.cache.delete(name);
      return null;
    }

    return cached.skill;
  }

  /**
   * 缓存 Skill
   */
  private cacheSkill(name: string, skill: Skill): void {
    const loadedSkill: LoadedSkill = {
      skill,
      filePath: '',
      loadedAt: Date.now(),
      expired: false,
    };

    this.cache.set(name, loadedSkill);

    // 设置过期定时器
    setTimeout(() => {
      const cached = this.cache.get(name);
      if (cached) {
        cached.expired = true;
      }
    }, this.config.cacheTTL);
  }

  /**
   * 实际加载 Skill 的逻辑
   */
  private async doLoadSkill(name: string): Promise<Skill | null> {
    // 查找 Skill 文件
    const skillFile = await this.findSkillFile(name);

    if (!skillFile) {
      console.warn(`[SkillLoader] Skill file not found: ${name}`);
      return null;
    }

    return await this.loadSkillFromFile(skillFile);
  }

  /**
   * 从文件加载 Skill
   */
  private async loadSkillFromFile(filePath: string): Promise<Skill | null> {
    try {
      // 读取文件内容
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');

      // 检查是否是 TypeScript 文件（包括 .ts 和 .mts）
      const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.mts');

      let module: Record<string, unknown>;

      if (isTypeScript) {
        // 对于 TypeScript 文件，使用 vm 评估代码
        // 这在测试环境和生产环境都有效
        module = this.evaluateModuleWithVM(fileContent, filePath);
      } else {
        // 对于 JavaScript 文件，使用 import() 加载
        module = await import(filePath);
      }

      // 尝试获取导出的 Skill
      const skill = this.extractSkillFromModule(module, filePath);

      if (skill) {
        // 更新缓存中的文件路径
        const cached = this.cache.get(skill.name);
        if (cached) {
          cached.filePath = filePath;
        }
      }

      return skill;
    } catch (err) {
      console.error(`[SkillLoader] Error loading ${filePath}:`, err);
      return null;
    }
  }

  /**
   * 使用 VM 模块评估代码
   */
  private evaluateModuleWithVM(code: string, filePath: string): Record<string, unknown> {
    // 创建沙箱上下文
    const sandbox: vm.Context = {
      module: { exports: {} },
      exports: {},
      require: (moduleName: string) => {
        // 简单处理 require，返回空对象
        // 复杂依赖需要在测试中 mock
        return {};
      },
      console,
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
    };

    // 编译并运行代码
    const context = vm.createContext(sandbox);
    const script = new vm.Script(code, { filename: filePath });
    script.runInContext(context);

    // 返回导出的内容
    return sandbox.module?.exports || sandbox.exports || {};
  }

  /**
   * 从模块中提取 Skill
   */
  private extractSkillFromModule(module: Record<string, unknown>, filePath: string): Skill | null {
    // 优先查找默认导出
    if (module.default && this.isValidSkill(module.default)) {
      return module.default as Skill;
    }

    // 检查 module 本身是否是 skill（CommonJS module.exports = {...} 模式）
    if (this.isValidSkill(module)) {
      return module as Skill;
    }

    // 查找命名导出
    for (const key of Object.keys(module)) {
      const exported = module[key];
      if (this.isValidSkill(exported)) {
        return exported as Skill;
      }
    }

    // 查找以文件名命名的导出
    const fileName = path.basename(filePath, this.config.fileExtension);
    const pascalCaseName = this.toPascalCase(fileName);

    if (module[pascalCaseName] && this.isValidSkill(module[pascalCaseName])) {
      return module[pascalCaseName] as Skill;
    }

    return null;
  }

  /**
   * 验证是否是有效的 Skill
   */
  private isValidSkill(obj: unknown): obj is Skill {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    const skill = obj as Record<string, unknown>;

    // 检查必须属性
    if (typeof skill.name !== 'string') {
      return false;
    }

    if (typeof skill.description !== 'string') {
      return false;
    }

    if (!skill.category) {
      return false;
    }

    // 检查必须方法
    if (typeof skill.execute !== 'function') {
      return false;
    }

    return true;
  }

  /**
   * 扫描目录获取 Skill 文件
   */
  private async scanDirectory(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // 跳过 node_modules 和隐藏目录
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }

          // 递归扫描子目录
          if (this.config.recursive) {
            const subFiles = await this.scanDirectory(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          // 检查文件扩展名
          if (
            entry.name.endsWith(this.config.fileExtension) ||
            entry.name.endsWith('.js') ||
            entry.name.endsWith('.mts')
          ) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.error(`[SkillLoader] Error scanning directory ${dir}:`, err);
    }

    return files;
  }

  /**
   * 查找 Skill 文件
   */
  private async findSkillFile(name: string): Promise<string | null> {
    // 支持的路径格式
    const possiblePaths = [
      // 直接路径：skills/requirement_decomposition.ts
      path.resolve(this.config.skillsRootDir, `${name}${this.config.fileExtension}`),
      path.resolve(this.config.skillsRootDir, `${name}.js`),

      // 分类路径：skills/requirements/requirement_decomposition.ts
      ...this.getPossibleCategoryPaths(name),

      // 子目录路径：skills/requirements/requirement_decomposition/skill.ts
      ...this.getPossibleSubdirPaths(name),
    ];

    // 检查文件是否存在
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    return null;
  }

  /**
   * 获取可能的分类目录路径
   */
  private getPossibleCategoryPaths(name: string): string[] {
    const categories = [
      'requirements',
      'design',
      'development',
      'testing',
      'devops',
      'documentation',
      'analysis',
      'security',
      'data',
      'custom',
    ];

    return categories.map((cat) =>
      path.resolve(this.config.skillsRootDir, cat, `${name}${this.config.fileExtension}`)
    );
  }

  /**
   * 获取可能的子目录路径
   */
  private getPossibleSubdirPaths(name: string): string[] {
    const categories = [
      'requirements',
      'design',
      'development',
      'testing',
      'devops',
      'documentation',
    ];

    return categories.map((cat) => path.resolve(this.config.skillsRootDir, cat, name, 'skill.ts'));
  }

  /**
   * 字符串转帕斯卡命名法
   */
  private toPascalCase(str: string): string {
    return str
      .replace(/[_-]/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * 获取加载统计
   */
  getStats(): {
    cached: number;
    locks: number;
  } {
    return {
      cached: this.cache.size,
      locks: this.loadLocks.size,
    };
  }
}

/**
 * 创建 Skill 加载器实例
 */
export function createSkillLoader(config?: Partial<SkillLoaderConfig>): SkillLoader {
  return new SkillLoader(config);
}

/**
 * 便捷函数：从目录加载 Skills
 */
export async function loadSkillsFromDirectory(
  skillsRootDir: string,
  dir?: string
): Promise<SkillLoadResult> {
  const loader = createSkillLoader({ skillsRootDir });
  return await loader.loadFromDirectory(dir);
}

/**
 * 便捷函数：加载单个 Skill
 */
export async function loadSkill(skillsRootDir: string, name: string): Promise<Skill | null> {
  const loader = createSkillLoader({ skillsRootDir });
  return await loader.loadSkill(name);
}
