import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface E2ETestingInput {
  applicationUrl?: string;
  framework?: 'playwright' | 'cypress' | 'selenium';
  userFlows?: string[];
}

export interface E2ETestingOutput {
  steps: Array<{ step: number; title: string; description: string; actions: string[] }>;
  summary: string;
}

export const e2eTestingSkill: Skill<E2ETestingInput, E2ETestingOutput> = {
  name: 'e2e-testing',
  category: SkillCategory.TESTING,
  description: 'E2E test scenario design and implementation using page object model and real user journey coverage',
  version: '1.0.0',
  async execute(input: SkillInput<E2ETestingInput>): Promise<SkillOutput<E2ETestingOutput>> {
    const data = input.data as unknown as E2ETestingInput;
    const start = Date.now();
    const framework = data.framework || 'playwright';
    const appUrl = data.applicationUrl || 'http://localhost:3000';
    const flows = data.userFlows || ['user registration', 'login', 'core feature', 'logout'];

    return {
      success: true,
      data: {
        steps: [
          {
            step: 1,
            title: 'Identify Critical User Journeys',
            description: 'E2E tests are expensive — only test what users actually do.',
            actions: [
              'Map top 5-10 user journeys from analytics or product requirements',
              `Priority flows to cover: ${flows.join(', ')}`,
              'Focus on revenue-critical paths: sign-up, checkout, core feature activation',
              'Include smoke tests: "can the app load and show the home page?"',
              'Identify edge case journeys: password reset, session expiry, error recovery',
              'Document journey map: actor → trigger → steps → expected outcome',
            ],
          },
          {
            step: 2,
            title: 'Set Up E2E Framework',
            description: `Configure ${framework} for reliable, maintainable test execution.`,
            actions: [
              `Install: ${framework === 'playwright' ? 'npm install -D @playwright/test && npx playwright install' : framework === 'cypress' ? 'npm install -D cypress' : 'npm install -D selenium-webdriver'}`,
              `Configure ${framework === 'playwright' ? 'playwright.config.ts' : 'cypress.config.ts'}: baseURL, timeout, retries, reporters`,
              'Set up test environment: dedicated test DB with seeded data, isolated from production',
              'Configure screenshot/video capture on failure — critical for debugging CI failures',
              'Set up HTML reporter for readable test results in CI artifacts',
              'Configure browsers: Chromium (required) + Firefox + Safari (optional for cross-browser)',
            ],
          },
          {
            step: 3,
            title: 'Implement Page Object Model',
            description: 'POM separates selectors from test logic — dramatically reduces maintenance cost.',
            actions: [
              'Create `tests/e2e/pages/` directory for page object classes',
              'Each page object encapsulates: locators, navigation, and page-specific actions',
              'Use semantic selectors: `data-testid` attributes over CSS classes (CSS changes, test IDs don\'t)',
              'Add `data-testid` attributes to all interactive elements in the application',
              'Page objects should never contain assertions — keep assertions in test files',
              'Example: `LoginPage.ts` with `fillEmail()`, `fillPassword()`, `submit()`, `getErrorMessage()`',
            ],
          },
          {
            step: 4,
            title: 'Write Test Scenarios',
            description: 'Write tests that read like user stories, covering happy path and key failure modes.',
            actions: [
              'Test file structure: describe(journey) → it(step) → arrange → act → assert',
              'Happy path first: complete user flow from start to success state',
              'Error scenarios: invalid input, network failure, unauthorized access',
              'Use test fixtures/factories for consistent test data — never hardcode user credentials',
              'Use `beforeEach` for login/setup, `afterEach` for cleanup — keep tests independent',
              'Assert on visible outcomes: page title, URL, success message, element presence',
            ],
          },
          {
            step: 5,
            title: 'Handle Async & Flakiness',
            description: 'Flaky E2E tests destroy team confidence — build reliability in from the start.',
            actions: [
              `Use ${framework === 'playwright' ? 'auto-waiting (built-in)' : 'cy.intercept() + cy.wait(alias)'} — never use fixed sleep/setTimeout`,
              'Wait for network: intercept API calls and wait for completion before asserting',
              'Use retry-ability: assertions should retry until timeout, not fail immediately',
              'Isolate tests: use API calls to set up state instead of UI navigation for prerequisites',
              'Configure `retries: 1` in CI config — legitimate flakes get one retry, chronic flakes are flagged',
              'Monitor flakiness score: any test failing >5% of runs without code change gets quarantined',
            ],
          },
          {
            step: 6,
            title: 'CI Integration & Maintenance',
            description: 'E2E tests must run reliably in CI and results must be actionable.',
            actions: [
              'Run E2E in CI against deployed staging environment — not localhost in CI runner',
              'Parallelize with sharding: `--shard=1/4` across 4 CI workers for 4x speed',
              'Upload test artifacts (screenshots, videos, traces) to CI storage on failure',
              `Use ${framework === 'playwright' ? 'Playwright trace viewer' : 'Cypress Cloud'} for debugging failures remotely`,
              'Gate production deployments on E2E pass — block deploy on E2E failure',
              'Review and update tests when UI changes — e2e tests are living documentation',
            ],
          },
        ],
        summary: `E2E testing guide using ${framework} — covering ${flows.length} user flows at ${appUrl}. 6-phase: journey mapping → framework setup → POM → scenario writing → flakiness prevention → CI integration.`,
      },
      duration: Date.now() - start,
    };
  },
};
