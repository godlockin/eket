#!/usr/bin/env node
/**
 * Compact Watcher CLI - TASK-AUTO-02
 *
 * Usage:
 *   node dist/bin/compact-watcher.js [options]
 *
 * Options:
 *   --trigger-path <path>    Custom trigger file path
 *   --inbox-path <path>      Custom inbox directory path
 *   --no-notifications       Disable macOS notifications
 *
 * Environment Variables:
 *   ENABLE_COMPACT_WATCHER   Set to 'false' to disable (default: true)
 */

import { startWatcher } from '../watchers/compact-trigger-watcher.js';

// Parse CLI arguments
const args = process.argv.slice(2);
const options: {
  triggerPath?: string;
  inboxPath?: string;
  enableNotifications?: boolean;
} = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--trigger-path' && i + 1 < args.length) {
    options.triggerPath = args[++i];
  } else if (arg === '--inbox-path' && i + 1 < args.length) {
    options.inboxPath = args[++i];
  } else if (arg === '--no-notifications') {
    options.enableNotifications = false;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Compact Watcher - Auto-Compact Trigger Monitor

USAGE:
  node dist/bin/compact-watcher.js [OPTIONS]

OPTIONS:
  --trigger-path <path>    Custom trigger file path (default: .eket/triggers/compact.trigger)
  --inbox-path <path>      Custom inbox directory path (default: .eket/inbox)
  --no-notifications       Disable macOS notifications
  -h, --help               Show this help message

ENVIRONMENT:
  ENABLE_COMPACT_WATCHER   Set to 'false' to disable watcher (default: true)

EXAMPLES:
  # Start with defaults
  node dist/bin/compact-watcher.js

  # Custom paths
  node dist/bin/compact-watcher.js --trigger-path /tmp/trigger --inbox-path /tmp/inbox

  # Disable notifications
  node dist/bin/compact-watcher.js --no-notifications
`);
    process.exit(0);
  }
}

// Check if watcher is disabled
if (process.env.ENABLE_COMPACT_WATCHER === 'false') {
  console.log('[Compact Watcher] Disabled via ENABLE_COMPACT_WATCHER=false');
  process.exit(0);
}

// Start watcher
console.log('[Compact Watcher] Starting...');
console.log('[Compact Watcher] PID:', process.pid);
console.log(
  '[Compact Watcher] Trigger:',
  options.triggerPath ?? '.eket/triggers/compact.trigger'
);
console.log(
  '[Compact Watcher] Inbox:',
  options.inboxPath ?? '.eket/inbox'
);
console.log(
  '[Compact Watcher] Notifications:',
  options.enableNotifications !== false ? 'enabled' : 'disabled'
);

startWatcher(options);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[Compact Watcher] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Compact Watcher] Received SIGTERM, shutting down...');
  process.exit(0);
});
