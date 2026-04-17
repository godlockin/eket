/**
 * node/src/core/state — 共享状态访问层
 *
 * Barrel export. 任何对 jira/ / inbox/ / outbox/ / shared/ / .eket/state/
 * 的写入必须从此入口导入。其他直接 fs.writeFile 的调用将被 ESLint 规则
 * no-direct-shared-fs-write 拦截（待建）。
 */

export { atomicWrite } from './atomic.js';
export { audit } from './audit.js';
export { getEketRoot, getNodeId } from './env.js';
export { withLock } from './lock.js';
export {
  locateTicketFile,
  readTicketField,
  readTicketMeta,
  listTickets,
  type TicketMeta,
} from './reader.js';
export {
  SchemaError,
  getProtocolVersion,
  validate,
  validateTicketId,
  validateTicketStatus,
  validateTicketTransition,
  validateNodeId,
  validatePriority,
  validateImportance,
  validateHeartbeatStatus,
} from './schema.js';
export {
  writeTicket,
  transitionTicket,
  updateHeartbeat,
  enqueueMessage,
  dequeueMessage,
  submitReviewRequest,
  registerNode,
  writeProjectStatus,
  type HeartbeatOpts,
  type Message,
  type ReviewRequest,
  type NodeProfile,
  type ProjectStatus,
} from './writer.js';
