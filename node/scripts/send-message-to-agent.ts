#!/usr/bin/env node
/**
 * Script to send a message to a specific agent via Agent Mailbox
 * Usage: node dist/scripts/send-message-to-agent.js <agentId> <subject> <message>
 */

import { writeToMailbox, generateMessageId } from '../dist/core/agent-mailbox.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('Usage: ts-node scripts/send-message-to-agent.ts <agentId> <subject> <message>');
    process.exit(1);
  }

  const [agentId, subject, message] = args;

  const result = await writeToMailbox(agentId, {
    id: generateMessageId(),
    from: 'master',
    text: message,
    timestamp: new Date().toISOString(),
    summary: subject,
    color: 'blue',
  });

  if (result.success) {
    console.log(`✅ Message sent successfully to agent: ${agentId}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📝 Message ID: ${generateMessageId()}`);
  } else {
    console.error(`❌ Failed to send message: ${result.error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
