/**
 * ESLint rule: no-direct-shared-fs-write
 *
 * Forbids direct fs.writeFile / appendFile / fs-extra.outputFile calls that
 * target shared state roots (jira/, inbox/, outbox/, shared/, .eket/state/).
 *
 * All writes to these roots MUST go through node/src/core/state/writer.ts
 * (writeTicket / transitionTicket / updateHeartbeat).
 *
 * Escape hatch:
 *   // allow: shared-fs-write
 * placed on the same or the immediately preceding line.
 *
 * Exempt files (configured in eslint.config.js):
 *   - node/src/core/state/**     (the legitimate writer itself)
 *   - node/src/skills/**         (sandboxed skill adapters)
 *   - node/tests/**              (test harnesses)
 *   - **/*.test.ts, **/*.spec.ts
 */

'use strict';

const WRITE_METHODS = new Set([
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'outputFile',
  'outputFileSync',
]);

// First path segment must match one of these to be considered shared state.
const FORBIDDEN_SEGMENTS = new Set([
  'jira',
  'inbox',
  'outbox',
  'shared',
  '.eket', // only flagged when followed by /state or when segment = '.eket/state'
]);

// Regex for string/template-literal first segment.
const FORBIDDEN_PREFIX_RE =
  /^(?:\.\/)?(jira|inbox|outbox|shared|\.eket\/state)(\/|$)/;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid direct FS writes to shared state roots (jira/inbox/outbox/shared/.eket/state). Use core/state/writer.ts instead.',
      recommended: true,
    },
    messages: {
      directSharedWrite:
        'Direct FS write to shared path "{{target}}" is forbidden. {{suggestion}}',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function hasEscapeHatch(node) {
      const line = node.loc.start.line;
      const comments = sourceCode.getAllComments();
      for (const c of comments) {
        if (!c.value.includes('allow: shared-fs-write')) continue;
        const endLine = c.loc.end.line;
        if (endLine === line || endLine === line - 1) return true;
      }
      return false;
    }

    /** Check a string literal or template literal first quasi. */
    function checkStringNode(argNode) {
      if (
        argNode.type === 'Literal' &&
        typeof argNode.value === 'string'
      ) {
        const m = argNode.value.match(FORBIDDEN_PREFIX_RE);
        return m ? m[1] + (argNode.value.slice(m[0].length) ? '/…' : '') : null;
      }
      if (argNode.type === 'TemplateLiteral' && argNode.quasis.length > 0) {
        const first = argNode.quasis[0].value.cooked || '';
        const m = first.match(FORBIDDEN_PREFIX_RE);
        if (m) return m[1] + '/…';
      }
      return null;
    }

    /**
     * Check path.join(...) / path.resolve(...) where any string arg is a
     * forbidden top-level segment (e.g. 'jira', 'inbox', '.eket').
     * For '.eket', require the next literal arg to be 'state'.
     */
    function checkJoinCall(argNode) {
      if (argNode.type !== 'CallExpression') return null;
      const callee = argNode.callee;
      const isJoin =
        callee.type === 'MemberExpression' &&
        callee.property &&
        callee.property.type === 'Identifier' &&
        (callee.property.name === 'join' ||
          callee.property.name === 'resolve') &&
        callee.object &&
        callee.object.type === 'Identifier' &&
        (callee.object.name === 'path' || callee.object.name === 'Path');
      if (!isJoin) return null;

      const literals = argNode.arguments.map((a) =>
        a.type === 'Literal' && typeof a.value === 'string' ? a.value : null,
      );

      for (let i = 0; i < literals.length; i++) {
        const lit = literals[i];
        if (!lit) continue;

        // full-prefix form inside one literal: 'jira/tickets', '.eket/state'
        const m = lit.match(FORBIDDEN_PREFIX_RE);
        if (m) return m[1];

        // single-segment form
        if (FORBIDDEN_SEGMENTS.has(lit)) {
          if (lit === '.eket') {
            const next = literals[i + 1];
            if (next === 'state') return '.eket/state';
            // '.eket' alone (e.g. .eket/config) — not forbidden
            continue;
          }
          return lit;
        }
      }
      return null;
    }

    function getMethodName(callee) {
      if (callee.type === 'MemberExpression') {
        if (callee.property && callee.property.type === 'Identifier') {
          return callee.property.name;
        }
      } else if (callee.type === 'Identifier') {
        return callee.name;
      }
      return null;
    }

    return {
      CallExpression(node) {
        const method = getMethodName(node.callee);
        if (!method || !WRITE_METHODS.has(method)) return;
        if (!node.arguments || node.arguments.length === 0) return;

        const first = node.arguments[0];
        const target =
          checkStringNode(first) || checkJoinCall(first);
        if (!target) return;
        if (hasEscapeHatch(node)) return;

        context.report({
          node,
          messageId: 'directSharedWrite',
          data: {
            target,
            suggestion:
              'Use core/state/writer.ts (writeTicket/transitionTicket/updateHeartbeat) instead.',
          },
        });
      },
    };
  },
};
