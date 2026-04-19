/**
 * Task Dependency Resolution
 *
 * 实现 trigger_rule 三种模式的依赖解锁判断。
 */

export type TriggerRule = 'all_success' | 'one_success' | 'all_done';

/**
 * 判断一个 ticket 的前置依赖是否已满足，可以解锁执行
 *
 * @param blockedBy    前置 ticket ID 列表
 * @param triggerRule  解锁规则（默认 all_success）
 * @param completedIds 已成功完成的 ticket ID 集合
 * @param failedIds    已失败的 ticket ID 集合
 */
export function canProceed(
  blockedBy: string[],
  triggerRule: TriggerRule = 'all_success',
  completedIds: Set<string>,
  failedIds: Set<string>
): boolean {
  if (blockedBy.length === 0) return true;
  switch (triggerRule) {
    case 'all_success':
      return blockedBy.every((id) => completedIds.has(id));
    case 'one_success':
      return blockedBy.some((id) => completedIds.has(id));
    case 'all_done':
      return blockedBy.every((id) => completedIds.has(id) || failedIds.has(id));
  }
}

/**
 * 从 ticket 文件内容解析 trigger_rule 字段
 */
export function parseTriggerRule(ticketContent: string): TriggerRule {
  const m = ticketContent.match(/\*\*trigger_rule\*\*:\s*(\S+)/i);
  const val = m?.[1]?.toLowerCase();
  if (val === 'one_success' || val === 'all_done') return val;
  return 'all_success'; // 默认
}

/**
 * 从 ticket 文件内容解析 fresh_context 字段
 */
export function parseFreshContext(ticketContent: string): boolean {
  const m = ticketContent.match(/\*\*fresh_context\*\*:\s*(\S+)/i);
  return m?.[1]?.toLowerCase() === 'true';
}
