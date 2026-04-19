import { canProceed, parseTriggerRule, parseFreshContext } from '../../src/core/task-dependency.js';

describe('canProceed', () => {
  const completed = new Set(['TASK-001', 'TASK-002']);
  const failed = new Set(['TASK-003']);

  // all_success
  test('all_success + all completed → true', () => {
    expect(canProceed(['TASK-001', 'TASK-002'], 'all_success', completed, failed)).toBe(true);
  });

  test('all_success + partial completed → false', () => {
    expect(canProceed(['TASK-001', 'TASK-099'], 'all_success', completed, failed)).toBe(false);
  });

  // one_success
  test('one_success + one completed → true', () => {
    expect(canProceed(['TASK-001', 'TASK-099'], 'one_success', completed, failed)).toBe(true);
  });

  test('one_success + none completed → false', () => {
    expect(canProceed(['TASK-098', 'TASK-099'], 'one_success', completed, failed)).toBe(false);
  });

  // all_done
  test('all_done + all done or failed → true', () => {
    expect(canProceed(['TASK-001', 'TASK-003'], 'all_done', completed, failed)).toBe(true);
  });

  test('all_done + one still in progress → false', () => {
    expect(canProceed(['TASK-001', 'TASK-099'], 'all_done', completed, failed)).toBe(false);
  });

  // edge cases
  test('empty blockedBy → true regardless of rule', () => {
    expect(canProceed([], 'all_success', new Set(), new Set())).toBe(true);
    expect(canProceed([], 'one_success', new Set(), new Set())).toBe(true);
    expect(canProceed([], 'all_done', new Set(), new Set())).toBe(true);
  });

  test('parseTriggerRule parses correctly', () => {
    expect(parseTriggerRule('**trigger_rule**: one_success')).toBe('one_success');
    expect(parseTriggerRule('**trigger_rule**: all_done')).toBe('all_done');
    expect(parseTriggerRule('**trigger_rule**: all_success')).toBe('all_success');
    expect(parseTriggerRule('no trigger_rule field')).toBe('all_success'); // default
  });
});

describe('parseFreshContext', () => {
  test('parses true correctly', () => {
    expect(parseFreshContext('**fresh_context**: true')).toBe(true);
  });

  test('parses false correctly', () => {
    expect(parseFreshContext('**fresh_context**: false')).toBe(false);
  });

  test('defaults to false when missing', () => {
    expect(parseFreshContext('no fresh_context field')).toBe(false);
  });
});
