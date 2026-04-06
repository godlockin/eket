/**
 * EKET Framework - Dependency Injection Container
 * Version: 2.0.0
 *
 * 简单 IoC 容器，支持：
 * - 服务注册/解析
 * - 生命周期管理（Singleton/Transient）
 * - 依赖自动解析
 * - 服务作用域管理
 */

import { EketError, EketErrorCode } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * 服务生命周期
 */
export type ServiceLifetime = 'singleton' | 'transient';

/**
 * 服务描述符
 */
export interface ServiceDescriptor {
  lifetime: ServiceLifetime;
  factory?: () => unknown;
  instance?: unknown;
  dependencies?: string[];
}

/**
 * 服务注册配置
 */
export interface ServiceRegistration {
  name: string;
  lifetime: ServiceLifetime;
  factory?: () => unknown;
  dependencies?: string[];
}

/**
 * 容器配置
 */
export interface ContainerConfig {
  strict?: boolean; // 严格模式：未注册的服务抛出异常
  autoResolve?: boolean; // 自动解析依赖
}

/**
 * 容器统计信息
 */
export interface ContainerStats {
  totalServices: number;
  singletonServices: number;
  transientServices: number;
  resolvedCount: number;
}

// ============================================================================
// Constants
// ============================================================================

// ============================================================================
// Dependency Injection Container Class
// ============================================================================

export class DIContainer {
  private services: Map<string, ServiceDescriptor> = new Map();
  private config: Required<ContainerConfig>;
  private resolutionStack: string[] = []; // 用于检测循环依赖
  private resolvedCount = 0;

  constructor(config?: ContainerConfig) {
    this.config = {
      strict: config?.strict ?? false,
      autoResolve: config?.autoResolve ?? true,
    };
  }

  /**
   * 注册服务（工厂函数方式）
   * @param name - 服务名称
   * @param factory - 工厂函数
   * @param lifetime - 生命周期（默认 singleton）
   * @param dependencies - 依赖的服务名称列表
   */
  register<T>(
    name: string,
    factory: () => T,
    lifetime: ServiceLifetime = 'singleton',
    dependencies: string[] = []
  ): this {
    if (typeof factory !== 'function') {
      throw new EketError(EketErrorCode.DI_FACTORY_REQUIRED, `Factory function required for service "${name}"`);
    }

    this.services.set(name, {
      lifetime,
      factory: factory as () => unknown,
      dependencies,
    });

    return this;
  }

  /**
   * 注册服务（实例方式，仅 singleton）
   * @param name - 服务名称
   * @param instance - 服务实例
   */
  registerInstance<T>(name: string, instance: T): this {
    this.services.set(name, {
      lifetime: 'singleton',
      instance: instance as unknown,
    });

    return this;
  }

  /**
   * 注册服务（类方式，自动解析依赖）
   * @param name - 服务名称
   * @param Class - 类构造函数
   * @param lifetime - 生命周期
   */
  registerClass<T extends { new (...args: unknown[]): unknown }>(
    name: string,
    Class: T,
    lifetime: ServiceLifetime = 'singleton'
  ): this {
    // 尝试从类的静态属性获取依赖
    const dependencies = (Class as unknown as { dependencies?: string[] }).dependencies || [];

    this.register(
      name,
      () => {
        if (dependencies.length === 0) {
          return new Class();
        }

        const resolvedDeps = dependencies.map((dep) => this.resolve(dep));
        return new Class(...resolvedDeps);
      },
      lifetime,
      dependencies
    );

    return this;
  }

  /**
   * 解析服务
   * @param name - 服务名称
   */
  resolve<T>(name: string): T {
    const descriptor = this.services.get(name);

    if (!descriptor) {
      if (this.config.strict) {
        throw new EketError(
          EketErrorCode.DI_SERVICE_NOT_FOUND,
          `Service "${name}" not registered. Available services: ${Array.from(this.services.keys()).join(', ')}`
        );
      }
      throw new EketError(EketErrorCode.DI_SERVICE_NOT_FOUND, `Service "${name}" not registered`);
    }

    // 检测循环依赖
    if (this.resolutionStack.includes(name)) {
      throw new EketError(
        EketErrorCode.DI_CIRCULAR_DEPENDENCY,
        `Circular dependency detected: ${this.resolutionStack.join(' -> ')} -> ${name}`
      );
    }

    // Singleton 且有缓存实例
    if (descriptor.lifetime === 'singleton' && descriptor.instance !== undefined) {
      this.resolvedCount++;
      return descriptor.instance as T;
    }

    // Transient 或首次解析 Singleton
    this.resolutionStack.push(name);

    try {
      // 先解析依赖
      if (descriptor.dependencies && this.config.autoResolve) {
        for (const dep of descriptor.dependencies) {
          this.resolve(dep);
        }
      }

      // 创建实例
      const instance = descriptor.factory
        ? (descriptor.factory as () => T)()
        : (descriptor.instance as T);

      // 缓存 Singleton 实例
      if (descriptor.lifetime === 'singleton') {
        descriptor.instance = instance;
      }

      this.resolvedCount++;
      return instance;
    } catch (error) {
      throw new EketError(
        EketErrorCode.DI_RESOLUTION_FAILED,
        `Failed to resolve service "${name}": ${error instanceof Error ? error.message : 'Unknown'}`,
        { service: name }
      );
    } finally {
      this.resolutionStack.pop();
    }
  }

  /**
   * 检查服务是否已注册
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * 移除服务
   */
  unregister(name: string): boolean {
    const descriptor = this.services.get(name);
    if (descriptor && descriptor.lifetime === 'singleton') {
      descriptor.instance = undefined; // 清理缓存实例
    }
    return this.services.delete(name);
  }

  /**
   * 清空容器
   */
  clear(): void {
    // 先调用 singleton 服务的 dispose 方法（如果存在）
    for (const [_name, descriptor] of this.services.entries()) {
      if (descriptor.lifetime === 'singleton' && descriptor.instance) {
        const instance = descriptor.instance as { dispose?: () => void | Promise<void> };
        if (typeof instance.dispose === 'function') {
          try {
            instance.dispose();
          } catch {
            // Ignore disposal errors
          }
        }
      }
    }

    this.services.clear();
    this.resolutionStack = [];
    this.resolvedCount = 0;
  }

  /**
   * 获取容器统计信息
   */
  getStats(): ContainerStats {
    let singletonCount = 0;
    let transientCount = 0;

    for (const descriptor of this.services.values()) {
      if (descriptor.lifetime === 'singleton') {
        singletonCount++;
      } else {
        transientCount++;
      }
    }

    return {
      totalServices: this.services.size,
      singletonServices: singletonCount,
      transientServices: transientCount,
      resolvedCount: this.resolvedCount,
    };
  }

  /**
   * 获取所有注册的服务名称
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建 DI 容器实例
 */
export function createContainer(config?: ContainerConfig): DIContainer {
  return new DIContainer(config);
}

// ============================================================================
// Decorators (Optional - for decorator-based DI)
// ============================================================================

/**
 * 服务装饰器（标记类为可注入服务）
 */
export function Service() {
  return function <T extends { new (...args: unknown[]): unknown }>(Class: T) {
    (Class as unknown as { dependencies?: string[] }).dependencies =
      (Class as unknown as { dependencies?: string[] }).dependencies || [];
    return Class;
  };
}

/**
 * 依赖注入装饰器（标记构造函数参数为依赖）
 */
export function Inject(_serviceName?: string) {
  return function (_target: unknown, _propertyKey: string | symbol, _parameterIndex: number) {
    // 装饰器逻辑（需要配合反射使用）
  };
}

// ============================================================================
// Global Container (for convenience, use sparingly)
// ============================================================================

let globalContainer: DIContainer | null = null;

/**
 * 获取全局 DI 容器
 * @deprecated 推荐使用依赖注入而非全局容器
 */
export function getGlobalContainer(): DIContainer {
  if (!globalContainer) {
    globalContainer = createContainer();
  }
  return globalContainer;
}

/**
 * 重置全局容器（用于测试）
 */
export function resetGlobalContainer(): void {
  if (globalContainer) {
    globalContainer.clear();
    globalContainer = null;
  }
}
