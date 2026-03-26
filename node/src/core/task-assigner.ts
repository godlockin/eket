/**
 * Task Assigner Module
 * 基于角色的任务分配算法
 *
 * Phase 4.3 - Core component for EKET Framework
 */

import type { Instance, TaskAssignment, Ticket } from '../types/index.js';

/**
 * 任务分配结果
 */
export interface AssignmentResult {
  assigned: boolean;
  instance?: Instance;
  reason?: string;
}

/**
 * Task Assigner
 * 负责将任务分配给最合适的 Instance
 */
export class TaskAssigner {
  /**
   * 分配任务给匹配的 Instance
   * @param ticket 任务票
   * @param instances 所有可用 Instances
   * @returns 分配结果
   */
  assignTicket(ticket: Ticket, instances: Instance[]): AssignmentResult {
    // 1. 过滤出匹配角色的 Instance
    const matchedInstances = instances.filter((inst) => this.matchesRole(inst, ticket));

    if (matchedInstances.length === 0) {
      return {
        assigned: false,
        reason: `No instances found with role ${ticket.required_role} or matching skills`,
      };
    }

    // 2. 过滤出状态为 idle 的 Instance
    const availableInstances = matchedInstances.filter(
      (inst) => inst.status === 'idle'
    );

    if (availableInstances.length === 0) {
      return {
        assigned: false,
        reason: 'All matching instances are currently busy',
      };
    }

    // 3. 负载最低的优先
    const sortedInstances = availableInstances.sort(
      (a, b) => a.currentLoad - b.currentLoad
    );

    // 4. 返回负载最低的 Instance
    return {
      assigned: true,
      instance: sortedInstances[0],
    };
  }

  /**
   * 检查 Instance 是否匹配任务角色
   */
  private matchesRole(instance: Instance, ticket: Ticket): boolean {
    // 直接匹配角色
    if (ticket.required_role && instance.agent_type === ticket.required_role) {
      return true;
    }

    // 通过技能匹配标签
    if (ticket.tags && ticket.tags.length > 0) {
      const instanceSkills = new Set(instance.skills.map((s) => s.toLowerCase()));
      for (const tag of ticket.tags) {
        if (instanceSkills.has(tag.toLowerCase())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 批量分配任务
   * @param tickets 任务列表
   * @param instances 所有可用 Instances
   * @returns 分配结果列表
   */
  assignMultipleTickets(tickets: Ticket[], instances: Instance[]): TaskAssignment[] {
    const assignments: TaskAssignment[] = [];
    const assignedInstances = new Set<string>();

    for (const ticket of tickets) {
      // 过滤出未分配的 Instances
      const availableInstances = instances.filter(
        (inst) => !assignedInstances.has(inst.id)
      );

      const result = this.assignTicket(ticket, availableInstances);

      if (result.assigned && result.instance) {
        const assignment: TaskAssignment = {
          ticketId: ticket.id,
          instanceId: result.instance.id,
          assignedAt: Date.now(),
          status: 'assigned',
        };
        assignments.push(assignment);
        assignedInstances.add(result.instance.id);
      }
    }

    return assignments;
  }

  /**
   * 计算任务优先级分数
   * @param ticket 任务票
   * @returns 优先级分数（数字越小优先级越高）
   */
  calculatePriorityScore(ticket: Ticket): number {
    const priorityWeights: Record<string, number> = {
      urgent: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const baseScore = priorityWeights[ticket.priority] ?? 2;

    // 根据标签调整优先级
    let tagBonus = 0;
    if (ticket.tags.some((t) => t.includes('security') || t.includes('hotfix'))) {
      tagBonus = -1; // 提升优先级
    }

    return baseScore + tagBonus;
  }

  /**
   * 对任务列表按优先级排序
   */
  sortByPriority(tickets: Ticket[]): Ticket[] {
    return [...tickets].sort(
      (a, b) => this.calculatePriorityScore(a) - this.calculatePriorityScore(b)
    );
  }

  /**
   * 验证分配是否有效
   */
  validateAssignment(_ticket: Ticket, _instance: Instance): boolean {
    // TODO: 实现验证逻辑
    return true;
  }
}

/**
 * 创建任务分配器实例
 */
export function createTaskAssigner(): TaskAssigner {
  return new TaskAssigner();
}

/**
 * 便捷函数：分配任务
 */
export function assignTicket(ticket: Ticket, instances: Instance[]): AssignmentResult {
  const assigner = createTaskAssigner();
  return assigner.assignTicket(ticket, instances);
}

/**
 * 便捷函数：任务排序
 */
export function sortTicketsByPriority(tickets: Ticket[]): Ticket[] {
  const assigner = createTaskAssigner();
  return assigner.sortByPriority(tickets);
}
