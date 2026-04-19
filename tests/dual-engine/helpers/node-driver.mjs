#!/usr/bin/env node
/**
 * tests/dual-engine/helpers/node-driver.mjs
 *
 * 把 node/dist/core/state/writer.js 的核心 API 暴露为 CLI，供 dual-engine
 * scenario 脚本从 shell 侧调用。
 *
 * 用法:
 *   node-driver.mjs enqueue-message <to> <type> <payload-json>
 *   node-driver.mjs register-node   <node_id> <role> [specialty]
 *   node-driver.mjs submit-pr       <ticket-id> <submitter> <branch> <body-file>
 *   node-driver.mjs heartbeat       <role> <instance_id> <status> [current_task]
 *
 * 环境变量: EKET_ROOT 必须指向 fixture 工作区（framework.setup_fixture 已设置）。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const writerPath = resolve(repoRoot, 'node', 'dist', 'core', 'state', 'writer.js');

const writer = await import(writerPath);

const [cmd, ...args] = process.argv.slice(2);

try {
  switch (cmd) {
    case 'enqueue-message': {
      const [to, type, payloadJson] = args;
      const payload = JSON.parse(payloadJson ?? '{}');
      const msg = await writer.enqueueMessage({ to, type, payload });
      process.stdout.write(`${msg.id}\n`);
      break;
    }
    case 'register-node': {
      const [node_id, role, specialty] = args;
      await writer.registerNode({
        node_id,
        role,
        ...(specialty ? { specialty } : {}),
      });
      break;
    }
    case 'submit-pr': {
      const [ticketId, submitter, branch, bodyFile] = args;
      const body = readFileSync(bodyFile, 'utf-8');
      const filepath = await writer.submitReviewRequest({
        ticketId,
        submitter,
        branch,
        body,
      });
      process.stdout.write(`${filepath}\n`);
      break;
    }
    case 'heartbeat': {
      const [role, instance_id, status, current_task] = args;
      await writer.updateHeartbeat({
        role,
        instanceId: instance_id,
        status,
        ...(current_task ? { currentTask: current_task } : {}),
      });
      break;
    }
    case 'claim-ticket': {
      const [ticketId, assignee] = args;
      await writer.transitionTicket(ticketId, 'in_progress');
      await writer.writeTicket(ticketId, 'assignee', assignee);
      break;
    }
    case 'write-ticket': {
      const [ticketId, field, value] = args;
      await writer.writeTicket(ticketId, field, value);
      break;
    }
    case 'dequeue-message': {
      const msg = await writer.dequeueMessage();
      if (msg) {
        process.stdout.write(`${msg.id}\n`);
      }
      break;
    }
    default:
      process.stderr.write(`unknown command: ${cmd}\n`);
      process.exit(2);
  }
} catch (e) {
  process.stderr.write(`node-driver error: ${e?.message ?? e}\n`);
  process.exit(1);
}
