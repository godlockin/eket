/**
 * Unified Error Handler for EKET CLI
 *
 * Provides consistent error reporting with:
 * - Error code
 * - Context information
 * - Possible causes
 * - Suggested solutions
 * - Documentation links
 */

export interface ErrorContext {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional context data */
  details?: Record<string, unknown>;
  /** Possible causes */
  causes?: string[];
  /** Suggested solutions */
  solutions?: string[];
  /** Quick fix command (one-line solution) */
  quickFix?: string;
  /** Related documentation URL */
  docLink?: string;
  /** Command that caused the error */
  command?: string;
  /** Severity level */
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

/**
 * Format and print error with rich context
 */
export function printError(context: ErrorContext): void {
  const severity = context.severity || 'error';

  // Severity icon and color
  const severityConfig = {
    info: { icon: 'ℹ️', color: COLORS.blue, label: 'INFO' },
    warning: { icon: '⚠️', color: COLORS.yellow, label: 'WARNING' },
    error: { icon: '❌', color: COLORS.red, label: 'ERROR' },
    critical: { icon: '🔴', color: COLORS.red, label: 'CRITICAL' },
  } as const;

  const config = severityConfig[severity];

  // Header
  console.error(
    `\n${config.color}${COLORS.bold}${config.icon} ${config.label}: ${context.message}${COLORS.reset}\n`
  );

  // Error code
  if (context.code) {
    console.error(`${COLORS.gray}Error Code: ${context.code}${COLORS.reset}`);
  }

  // Command that caused the error
  if (context.command) {
    console.error(`${COLORS.gray}Command: ${context.command}${COLORS.reset}`);
  }

  // Details
  if (context.details && Object.keys(context.details).length > 0) {
    console.error(`\n${COLORS.bold}Details:${COLORS.reset}`);
    for (const [key, value] of Object.entries(context.details)) {
      console.error(`  ${COLORS.cyan}${key}:${COLORS.reset} ${value}`);
    }
  }

  // Possible causes
  if (context.causes && context.causes.length > 0) {
    console.error(`\n${COLORS.yellow}${COLORS.bold}Possible Causes:${COLORS.reset}`);
    for (const cause of context.causes) {
      console.error(`  • ${cause}`);
    }
  }

  // Suggested solutions
  if (context.solutions && context.solutions.length > 0) {
    console.error(`\n${COLORS.green}${COLORS.bold}Suggested Solutions:${COLORS.reset}`);
    for (const solution of context.solutions) {
      console.error(`  ✓ ${solution}`);
    }
  }

  // Quick Fix (one-line solution)
  if (context.quickFix) {
    console.error(`\n${COLORS.cyan}${COLORS.bold}⚡ Quick Fix:${COLORS.reset}`);
    console.error(`  ${COLORS.bold}${context.quickFix}${COLORS.reset}`);
  }

  // Documentation link
  if (context.docLink) {
    console.error(`\n${COLORS.blue}📖 Documentation: ${context.docLink}${COLORS.reset}`);
  }

  console.error('');
}

/**
 * Create error context from Error object
 */
export function createErrorContext(
  message: string,
  options: Partial<ErrorContext> = {}
): ErrorContext {
  return {
    code: options.code || 'UNKNOWN_ERROR',
    message,
    details: options.details,
    causes: options.causes,
    solutions: options.solutions,
    quickFix: options.quickFix,
    docLink: options.docLink,
    command: options.command,
    severity: options.severity || 'error',
  };
}

/**
 * Error codes for EKET CLI
 */
export const ErrorCodes = {
  // Connection errors
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  REDIS_NOT_CONFIGURED: 'REDIS_NOT_CONFIGURED',
  REDIS_CONNECTION_FAILED: 'REDIS_CONNECTION_FAILED',
  SQLITE_CONNECTION_FAILED: 'SQLITE_CONNECTION_FAILED',

  // Configuration errors
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_INVALID: 'CONFIG_INVALID',
  ENV_VAR_MISSING: 'ENV_VAR_MISSING',

  // Git errors
  GIT_OPERATION_FAILED: 'GIT_OPERATION_FAILED',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',

  // Task errors
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_CLAIM_FAILED: 'TASK_CLAIM_FAILED',
  TASK_ASSIGN_FAILED: 'TASK_ASSIGN_FAILED',

  // Instance errors
  INSTANCE_NOT_FOUND: 'INSTANCE_NOT_FOUND',
  INSTANCE_ALREADY_EXISTS: 'INSTANCE_ALREADY_EXISTS',
  MASTER_ELECTION_FAILED: 'MASTER_ELECTION_FAILED',

  // API errors
  API_REQUEST_FAILED: 'API_REQUEST_FAILED',
  API_AUTH_FAILED: 'API_AUTH_FAILED',
  API_RATE_LIMITED: 'API_RATE_LIMITED',

  // File system errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',

  // Module errors
  MODULES_NOT_INSTALLED: 'MODULES_NOT_INSTALLED',

  // Unknown
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

/**
 * Standard error messages with solutions
 */
export const ErrorMessages: Record<
  string,
  { causes: string[]; solutions: string[]; docLink?: string; quickFix?: string }
> = {
  [ErrorCodes.REDIS_NOT_CONFIGURED]: {
    causes: [
      'Redis host not specified in environment variables',
      'EKET_REDIS_HOST environment variable is missing',
    ],
    solutions: [
      'Set EKET_REDIS_HOST environment variable: export EKET_REDIS_HOST=localhost',
      'Or configure Redis in .eket/config.yml',
      'Run `docker run -d -p 6379:6379 redis` to start a local Redis',
    ],
    docLink: 'https://github.com/eket-framework/docs/blob/main/redis-setup.md',
    quickFix: 'export EKET_REDIS_HOST=localhost && eket-cli redis:check',
  },
  [ErrorCodes.REDIS_CONNECTION_FAILED]: {
    causes: [
      'Redis server is not running',
      'Network connection to Redis failed',
      'Redis authentication failed',
    ],
    solutions: [
      'Check if Redis is running: redis-cli ping',
      'Verify Redis host and port configuration',
      'Check firewall settings',
    ],
    docLink: 'https://github.com/eket-framework/docs/blob/main/redis-troubleshooting.md',
    quickFix: 'redis-cli ping || docker run -d -p 6379:6379 redis',
  },
  [ErrorCodes.SQLITE_CONNECTION_FAILED]: {
    causes: [
      'SQLite database file does not exist',
      'Database file is corrupted',
      'Insufficient permissions to access database',
    ],
    solutions: [
      'Run project initialization: eket-cli project:init',
      'Check database path: echo $EKET_SQLITE_PATH',
      'Verify file permissions: ls -la ~/.eket/data/sqlite/',
    ],
    docLink: 'https://github.com/eket-framework/docs/blob/main/sqlite-setup.md',
    quickFix: 'eket-cli project:init',
  },
  [ErrorCodes.CONFIG_NOT_FOUND]: {
    causes: ['Project not initialized', '.eket/config.yml file is missing'],
    solutions: [
      'Run `eket-cli project:init` to initialize the project',
      'Verify you are in the correct project directory',
    ],
    docLink: 'https://github.com/eket-framework/docs/blob/main/project-setup.md',
    quickFix: 'eket-cli project:init',
  },
  [ErrorCodes.TASK_NOT_FOUND]: {
    causes: ['Task ID does not exist', 'Task was deleted or moved', 'Incorrect task ID format'],
    solutions: [
      'Run `eket-cli task:list` to see available tasks',
      'Verify the task ID format (e.g., FEAT-123)',
      'Check jira/tickets directory for task files',
    ],
    quickFix: 'eket-cli task:list',
  },
  [ErrorCodes.GIT_OPERATION_FAILED]: {
    causes: ['Git is not installed', 'Not in a git repository', 'Git credentials are invalid'],
    solutions: [
      'Install Git: https://git-scm.com/downloads',
      'Run `git init` to initialize a repository',
      'Configure Git credentials: git config --global user.name/email',
    ],
    quickFix: 'git --version || echo "Git not installed"',
  },
  [ErrorCodes.PERMISSION_DENIED]: {
    causes: [
      'Insufficient file permissions',
      'File is locked by another process',
      'Running without required privileges',
    ],
    solutions: [
      'Check file permissions: ls -la <file>',
      'Close other applications using the file',
      'Run with appropriate permissions',
    ],
    quickFix: 'ls -la && chmod +rw <file>',
  },
  [ErrorCodes.INSTANCE_ALREADY_EXISTS]: {
    causes: [
      'Instance already started in this directory',
      'Previous instance did not clean up properly',
    ],
    solutions: [
      'Check existing instances: eket-cli instance:list',
      'Clean up stale state: rm -rf .eket/state/*',
      'Use different project directory',
    ],
    quickFix: 'rm -rf .eket/state && eket-cli instance:start',
  },
  [ErrorCodes.MASTER_ELECTION_FAILED]: {
    causes: [
      'Another master already exists',
      'Redis connection failed during election',
      'Network partition detected',
    ],
    solutions: [
      'Check if master already running: eket-cli redis:list-slavers',
      'Verify Redis connectivity: eket-cli redis:check',
      'Wait for lease expiration and retry',
    ],
    quickFix: 'eket-cli redis:check',
  },
  [ErrorCodes.MODULES_NOT_INSTALLED]: {
    causes: [
      'Node.js dependencies not installed',
      'npm install was interrupted',
      'Incompatible Node.js version',
    ],
    solutions: [
      'Run npm install to install dependencies',
      'Check Node.js version: node --version (requires >= 18.0.0)',
      'Delete node_modules and reinstall: rm -rf node_modules && npm install',
    ],
    quickFix: 'npm install',
  },
};

/**
 * Print error with predefined messages
 */
export function printKnownError(
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const predefined = ErrorMessages[code];
  printError({
    code,
    message,
    details,
    causes: predefined?.causes,
    solutions: predefined?.solutions,
    quickFix: predefined?.quickFix,
    docLink: predefined?.docLink,
  });
}

/**
 * Wrapper for console.error with consistent formatting
 */
export function logError(message: string, code?: string): void {
  printError({ code: code || 'UNKNOWN_ERROR', message });
}

/**
 * Log warning message
 */
export function logWarning(message: string, details?: string[]): void {
  console.warn(`\n${COLORS.yellow}⚠️  WARNING: ${message}${COLORS.reset}`);
  if (details) {
    for (const detail of details) {
      console.warn(`  • ${detail}`);
    }
  }
  console.warn('');
}

/**
 * Log info message
 */
export function logInfo(message: string, details?: string[]): void {
  console.log(`\n${COLORS.blue}ℹ️  INFO: ${message}${COLORS.reset}`);
  if (details) {
    for (const detail of details) {
      console.log(`  • ${detail}`);
    }
  }
  console.log('');
}

/**
 * Log success message
 */
export function logSuccess(message: string, details?: string[]): void {
  console.log(`\n${COLORS.green}✓ ${message}${COLORS.reset}`);
  if (details) {
    for (const detail of details) {
      console.log(`  • ${detail}`);
    }
  }
  console.log('');
}
