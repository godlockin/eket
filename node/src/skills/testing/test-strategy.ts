import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface TestStrategyInput {
  projectType: 'frontend' | 'backend' | 'fullstack' | 'library';
  teamSize?: number;
  currentCoverage?: number;
}

export interface TestStrategyOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const testStrategySkill: Skill<TestStrategyInput, TestStrategyOutput> = {
  name: 'test-strategy',
  category: SkillCategory.TESTING,
  description: 'Design test pyramid strategy with correct unit/integration/e2e ratio and tooling recommendations',
  version: '1.0.0',
  async execute(input: SkillInput<TestStrategyInput>): Promise<SkillOutput<TestStrategyOutput>> {
    const data = input as unknown as TestStrategyInput;
    const start = Date.now();
    const projectType = data.projectType || 'fullstack';
    const teamSize = data.teamSize || 5;
    const currentCoverage = data.currentCoverage ?? 0;

    const toolingMap: Record<string, { unit: string; integration: string; e2e: string }> = {
      frontend: { unit: 'Vitest + Testing Library', integration: 'Vitest + MSW (mock service worker)', e2e: 'Playwright' },
      backend: { unit: 'Jest / Vitest', integration: 'Supertest + testcontainers', e2e: 'k6 + Postman/Newman' },
      fullstack: { unit: 'Vitest (both)', integration: 'Supertest + Testing Library', e2e: 'Playwright' },
      library: { unit: 'Vitest', integration: 'Vitest + real dependencies', e2e: 'n/a (consumer integration tests)' },
    };

    const tools = toolingMap[projectType] || toolingMap.fullstack;

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Assess Current State & Set Goals',
            description: 'Understand starting point before designing strategy.',
            actions: [
              `Current coverage: ${currentCoverage}% — target: unit 80%, integration 60%, e2e critical paths`,
              'Inventory existing tests: are they pyramid-shaped or ice-cream-cone-shaped?',
              'Identify highest-risk modules: payment, auth, data mutations — prioritize coverage here',
              'Survey team: what testing pain points exist? Slow CI? Flaky tests? Gaps?',
              'Review recent production bugs — could they have been caught by automated tests?',
              'Set 90-day coverage target with milestones (team size: ' + teamSize + ' → ~2 sprints per layer)',
            ],
          },
          {
            step: 2,
            title: 'Design Test Pyramid',
            description: 'Define correct ratio: many unit, some integration, few e2e.',
            actions: [
              'Unit tests (70%): pure functions, business logic, utils — fast, isolated, no I/O',
              'Integration tests (20%): service + real DB/cache, API routes with real middleware',
              'E2E tests (10%): critical user journeys only — login, checkout, core workflows',
              'Contract tests (if microservices): Pact tests between service boundaries',
              'Avoid testing implementation details — test behavior observable from the outside',
              'Rule: if a test takes >100ms, question whether it should be a lower-level test',
            ],
          },
          {
            step: 3,
            title: 'Select & Configure Tooling',
            description: `Choose tools appropriate for ${projectType} and configure for CI.`,
            actions: [
              `Unit test framework: ${tools.unit}`,
              `Integration test framework: ${tools.integration}`,
              `E2E framework: ${tools.e2e}`,
              'Configure coverage thresholds in config: fail CI if coverage drops below target',
              'Set up test isolation: each test independent, no shared mutable state between tests',
              'Configure parallel test execution: Jest --runInBand off, shard in CI for speed',
            ],
          },
          {
            step: 4,
            title: 'Define Test Patterns & Standards',
            description: 'Establish team conventions so tests are consistent and maintainable.',
            actions: [
              'Naming: "should [expected behavior] when [condition]" — tests as living documentation',
              'Structure: Arrange-Act-Assert (AAA) pattern in every test',
              'Avoid test interdependence: each test sets up its own data, cleans up after',
              'Mock at the right boundary: mock external services, not internal modules',
              'Snapshot tests sparingly: only for stable UI components, not data transforms',
              'Document test strategy in docs/testing/STRATEGY.md for new team members',
            ],
          },
          {
            step: 5,
            title: 'Integrate into CI/CD Pipeline',
            description: 'Tests only protect you if they run automatically on every change.',
            actions: [
              'Run unit + integration tests on every PR — must pass before merge',
              'Run e2e tests on merge to main / staging deploy — acceptable to skip on PR for speed',
              'Set CI timeout: unit < 2min, integration < 5min, e2e < 15min — fail if exceeded',
              'Configure test result reporting: JUnit XML output for CI dashboards',
              'Set up flaky test detection: flag tests that fail intermittently for immediate fix',
              'Cache node_modules and test DB snapshots in CI for faster runs',
            ],
          },
          {
            step: 6,
            title: 'Maintain & Evolve Test Suite',
            description: 'Tests are production code — they need maintenance and refactoring too.',
            actions: [
              'Fix flaky tests immediately — a flaky test is worse than no test (false confidence)',
              'Review test coverage report weekly — track coverage trends, not just snapshot',
              'Delete tests that no longer reflect system behavior — dead tests mislead',
              'Refactor test helpers and fixtures as code evolves',
              'Conduct quarterly test retrospective: are tests catching real bugs? Are they fast?',
              'New bug = new regression test — no bug fix without a test that would have caught it',
            ],
          },
        ],
        summary: `Test strategy for ${projectType} project — team size ${teamSize}, starting coverage ${currentCoverage}%. Pyramid: 70% unit (${tools.unit}) / 20% integration (${tools.integration}) / 10% e2e (${tools.e2e}). 6-phase: assess → pyramid design → tooling → standards → CI → maintenance.`,
      },
      duration: Date.now() - start,
    };
  },
};
