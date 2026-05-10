import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

async function globalTeardown() {
  // Clean up test directories
  const eketDir = path.join(REPO_ROOT, '.eket');
  const fixturesDir = path.join(REPO_ROOT, 'test-fixtures');

  if (fs.existsSync(eketDir)) {
    fs.rmSync(eketDir, { recursive: true, force: true });
  }

  if (fs.existsSync(fixturesDir)) {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  }

  console.log('[Global Teardown] Cleaned up test directories');
}

export default globalTeardown;
