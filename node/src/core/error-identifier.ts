/**
 * 400 错误类型识别
 * 用于区分 Claude Code API 400 错误的具体类型
 */

export type Error400Type =
  | 'context_length_exceeded'
  | 'invalid_request_error'
  | 'validation_error'
  | 'unknown_400_error';

/**
 * 从 stderr 识别 400 错误类型
 * @param stderr - Claude CLI 的 stderr 输出
 * @returns 识别到的错误类型
 */
export function identifyErrorType(stderr: string): Error400Type {
  if (!stderr) {
    return 'unknown_400_error';
  }

  const lowerStderr = stderr.toLowerCase();

  // 检查 context 相关关键字（优先级最高）
  if (
    lowerStderr.includes('context_length') ||
    lowerStderr.includes('maximum context') ||
    lowerStderr.includes('context limit') ||
    lowerStderr.includes('too many tokens') ||
    lowerStderr.includes('context overflow') ||
    lowerStderr.includes('exceeded context')
  ) {
    return 'context_length_exceeded';
  }

  // 检查 invalid_request
  if (lowerStderr.includes('invalid_request') || lowerStderr.includes('invalid request')) {
    return 'invalid_request_error';
  }

  // 检查 validation
  if (lowerStderr.includes('validation') || lowerStderr.includes('invalid parameter')) {
    return 'validation_error';
  }

  return 'unknown_400_error';
}
