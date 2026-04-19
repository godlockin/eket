/**
 * Tests for workflow YAML commands (TASK-080)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { validateWorkflowYaml } from '../../src/commands/workflow.js';

describe('validateWorkflowYaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-workflow-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeYaml(name: string, content: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content);
    return p;
  }

  it('returns error for missing file', () => {
    const result = validateWorkflowYaml('/nonexistent/path.yml');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('File not found');
  });

  it('validates a valid 2-node serial workflow', () => {
    const p = writeYaml('valid.yml', `
name: test-workflow
nodes:
  - id: step1
    type: bash
    command: echo hello
  - id: step2
    type: bash
    command: echo world
    depends_on:
      - step1
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects missing name', () => {
    const p = writeYaml('no-name.yml', `
nodes:
  - id: step1
    type: bash
    command: echo hi
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('detects missing nodes', () => {
    const p = writeYaml('no-nodes.yml', 'name: empty\n');
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('node'))).toBe(true);
  });

  it('detects missing type on node', () => {
    const p = writeYaml('no-type.yml', `
name: test
nodes:
  - id: step1
    command: echo hi
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('type'))).toBe(true);
  });

  it('detects bash node missing command', () => {
    const p = writeYaml('no-cmd.yml', `
name: test
nodes:
  - id: step1
    type: bash
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('command'))).toBe(true);
  });

  it('detects unknown depends_on reference', () => {
    const p = writeYaml('bad-dep.yml', `
name: test
nodes:
  - id: step1
    type: bash
    command: echo hi
    depends_on:
      - nonexistent
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('nonexistent'))).toBe(true);
  });

  it('detects self-cycle A→A', () => {
    const p = writeYaml('self-cycle.yml', `
name: test
nodes:
  - id: A
    type: bash
    command: echo a
    depends_on:
      - A
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('detects mutual cycle A→B→A', () => {
    const p = writeYaml('mutual-cycle.yml', `
name: test
nodes:
  - id: A
    type: bash
    command: echo a
    depends_on:
      - B
  - id: B
    type: bash
    command: echo b
    depends_on:
      - A
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('allows diamond DAG A→B,C; B,C→D (no cycle)', () => {
    const p = writeYaml('diamond.yml', `
name: test
nodes:
  - id: A
    type: bash
    command: echo a
  - id: B
    type: bash
    command: echo b
    depends_on:
      - A
  - id: C
    type: bash
    command: echo c
    depends_on:
      - A
  - id: D
    type: bash
    command: echo d
    depends_on:
      - B
      - C
`);
    const result = validateWorkflowYaml(p);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates hello-world.yml example', () => {
    const examplePath = path.resolve(
      process.cwd(),
      '../examples/workflows/hello-world.yml'
    );
    if (!fs.existsSync(examplePath)) {
      console.warn('Skipping: hello-world.yml not found at', examplePath);
      return;
    }
    const result = validateWorkflowYaml(examplePath);
    expect(result.valid).toBe(true);
  });
});
