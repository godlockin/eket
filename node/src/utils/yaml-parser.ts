/**
 * Simple YAML Parser Utility
 * 支持基础 YAML 结构的轻量级解析器
 *
 * 注意：仅支持简单的键值对和嵌套结构，复杂 YAML 应使用 yaml 库
 */

/**
 * 解析 YAML 值字符串为 JavaScript 类型
 */
export function parseYAMLValue(value: string): unknown {
  const trimmed = value.trim();

  // 布尔值
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }

  // 字符串（引号包裹）
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // 数字
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  if (/^\d+\.\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // 数组（简单格式：[a, b, c]）
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === '') {
      return [];
    }
    return inner.split(',').map((item) => parseYAMLValue(item.trim()));
  }

  // 默认返回字符串
  return trimmed;
}

/**
 * 简单 YAML 解析（支持基础嵌套结构）
 *
 * 支持格式:
 * ```yaml
 * key: value
 * section:
 *   nested_key: nested_value
 *   nested_section:
 *     deep_key: deep_value
 * ```
 */
export function parseSimpleYAML(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');

  const stack: Array<{
    indent: number;
    object: Record<string, unknown>;
  }> = [{ indent: -1, object: result }];

  for (const line of lines) {
    // 跳过注释和空行
    if (line.trim().startsWith('#') || line.trim() === '') {
      continue;
    }

    const match = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, indentStr, key, valueStr] = match;
    const indent = indentStr.length;
    const trimmedValue = valueStr.trim();

    // 弹出栈顶直到找到父级
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].object;

    if (trimmedValue) {
      // 有值，直接赋值
      parent[key] = parseYAMLValue(trimmedValue);
    } else {
      // 无值，创建新对象
      parent[key] = {} as Record<string, unknown>;
      stack.push({ indent, object: parent[key] as Record<string, unknown> });
    }
  }

  return result;
}

/**
 * 将 JavaScript 对象转换为简单 YAML 字符串
 */
export function toSimpleYAML(obj: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const prefix = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      lines.push(toSimpleYAML(value as Record<string, unknown>, indent + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${prefix}${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          lines.push(`${prefix}  -`);
          lines.push(toSimpleYAML(item as Record<string, unknown>, indent + 2));
        } else {
          lines.push(`${prefix}  - ${formatYAMLValue(item)}`);
        }
      }
    } else {
      lines.push(`${prefix}${key}: ${formatYAMLValue(value)}`);
    }
  }

  return lines.join('\n');
}

/**
 * 格式化 YAML 值
 */
function formatYAMLValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    // 包含特殊字符时用引号包裹
    if (value.includes(':') || value.includes('#') || value.includes('\n')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}
