/**
 * Tests for WORKFLOW_TEMPLATES and getWorkflowTemplate (TASK-030)
 */

import { getWorkflowTemplate, WORKFLOW_TEMPLATES, WorkflowTemplateName } from '../src/core/workflow-engine.js';

describe('getWorkflowTemplate', () => {
  it('returns FEATURE_DEV template with 4 steps', () => {
    const tpl = getWorkflowTemplate('FEATURE_DEV');
    expect(tpl).not.toBeNull();
    expect(tpl!.steps.length).toBe(4);
  });

  it('returns null for unknown template name without throwing', () => {
    const tpl = getWorkflowTemplate('UNKNOWN' as WorkflowTemplateName);
    expect(tpl).toBeNull();
  });
});
