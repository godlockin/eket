/**
 * error-identifier.ts
 *
 * Identifies specific 400 error types from Claude Code CLI stderr output.
 * Used by claude-runner.ts to determine appropriate recovery strategy.
 */

export type Error400Type =
  | 'context_length_exceeded'
  | 'invalid_request_error'
  | 'validation_error'
  | 'unknown_400_error';

/**
 * Identifies the specific type of 400 error from stderr output.
 *
 * Classification rules (priority order):
 * 1. context_length_exceeded: Contains keywords "context_length", "maximum context", "context limit", "too many tokens"
 * 2. invalid_request_error: Contains keyword "invalid_request"
 * 3. validation_error: Contains keyword "validation"
 * 4. unknown_400_error: None of the above
 *
 * @param stderr - The stderr output from Claude Code CLI
 * @returns The identified error type
 *
 * @example
 * ```typescript
 * const errorType = identifyErrorType("Error: 400 context_length exceeded");
 * // Returns: 'context_length_exceeded'
 * ```
 */
export function identifyErrorType(stderr: string): Error400Type {
  const lowerStderr = stderr.toLowerCase();

  // Priority 1: Context overflow errors
  if (
    lowerStderr.includes('context_length') ||
    lowerStderr.includes('maximum context') ||
    lowerStderr.includes('context limit') ||
    lowerStderr.includes('too many tokens')
  ) {
    return 'context_length_exceeded';
  }

  // Priority 2: Invalid request errors
  if (lowerStderr.includes('invalid_request')) {
    return 'invalid_request_error';
  }

  // Priority 3: Validation errors
  if (lowerStderr.includes('validation')) {
    return 'validation_error';
  }

  // Default: Unknown 400 error
  return 'unknown_400_error';
}
