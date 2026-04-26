/**
 * expert-loader.ts — 专家 Persona 加载器
 *
 * 将 expert ID 映射到 ~/.claude/skills/eket/experts/ 下的 .md 文件，
 * 读取 profile 内容并注入到 ACTIVE_CONTEXT.md。
 *
 * 支持 default 专家（7位）和 optional 专家（53位）。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── Expert Map ───────────────────────────────────────────────────────────────

/**
 * Expert ID → relative path under ~/.claude/skills/eket/experts/
 * Default tier: default/<id>.md
 * Optional tier: optional/<domain>/<id>.md
 */
const EXPERT_PATH_MAP: Record<string, string> = {
  // Default experts (7)
  architect:   'default/architect.md',
  backend:     'default/backend.md',
  frontend:    'default/frontend.md',
  fullstack:   'default/fullstack.md',
  tester:      'default/tester.md',
  ux:          'default/ux.md',
  product:     'default/product.md',

  // Tech (8)
  security:    'optional/tech/security.md',
  devops:      'optional/tech/devops.md',
  qa:          'optional/tech/qa.md',
  dba:         'optional/tech/dba.md',
  sre:         'optional/tech/sre.md',
  mobile:      'optional/tech/mobile.md',
  performance: 'optional/tech/performance.md',
  platform:    'optional/tech/platform.md',

  // AI/ML (8)
  aiml:           'optional/ai/aiml.md',
  ml:             'optional/ai/ml.md',
  nlp:            'optional/ai/nlp.md',
  cv:             'optional/ai/cv.md',
  mlops:          'optional/ai/mlops.md',
  bigdata:        'optional/ai/bigdata.md',
  'data-analyst': 'optional/ai/data-analyst.md',
  data:           'optional/ai/data.md',

  // Design (5)
  'ux-research': 'optional/design/ux-research.md',
  visual:        'optional/design/visual.md',
  brand:         'optional/design/brand.md',
  motion:        'optional/design/motion.md',
  industrial:    'optional/design/industrial.md',

  // Marketing (5)
  growth:              'optional/marketing/growth.md',
  content:             'optional/marketing/content.md',
  seo:                 'optional/marketing/seo.md',
  ads:                 'optional/marketing/ads.md',
  'product-marketing': 'optional/marketing/product-marketing.md',

  // PR (4)
  'pr-manager': 'optional/pr/pr-manager.md',
  crisis:       'optional/pr/crisis.md',
  media:        'optional/pr/media.md',
  kol:          'optional/pr/kol.md',

  // Business (5)
  business:   'optional/business/business.md',
  strategy:   'optional/business/strategy.md',
  finance:    'optional/business/finance.md',
  legal:      'optional/business/legal.md',
  compliance: 'optional/business/compliance.md',

  // Consulting (3)
  mgmt:           'optional/consulting/mgmt.md',
  'it-consulting': 'optional/consulting/it-consulting.md',
  process:        'optional/consulting/process.md',

  // HR (5)
  hr:        'optional/hr/hr.md',
  recruiter: 'optional/hr/recruiter.md',
  hrbp:      'optional/hr/hrbp.md',
  'l-and-d': 'optional/hr/l-and-d.md',
  comp:      'optional/hr/comp.md',

  // Training (3)
  trainer:    'optional/training/trainer.md',
  coach:      'optional/training/coach.md',
  curriculum: 'optional/training/curriculum.md',

  // Knowledge (3)
  km:          'optional/knowledge/km.md',
  researcher:  'optional/knowledge/researcher.md',
  'doc-writer': 'optional/knowledge/doc-writer.md',

  // Ops (4)
  'product-ops':  'optional/ops/product-ops.md',
  community:      'optional/ops/community.md',
  customer:       'optional/ops/customer.md',
  'supply-chain': 'optional/ops/supply-chain.md',
};

const EXPERTS_BASE = path.join(os.homedir(), '.claude', 'skills', 'eket', 'experts');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpertProfile {
  id: string;
  name?: string;
  name_cn?: string;
  role?: string;
  emoji?: string;
  content: string;        // raw MD content
  available: boolean;
}

export interface LoadedExperts {
  profiles: ExpertProfile[];
  missing: string[];       // IDs where file not found
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * 返回所有已知的 expert IDs（default + optional）
 */
export function getAllExpertIds(): string[] {
  return Object.keys(EXPERT_PATH_MAP);
}

/**
 * 返回 default 专家 IDs
 */
export function getDefaultExpertIds(): string[] {
  return ['architect', 'backend', 'frontend', 'fullstack', 'tester', 'ux', 'product'];
}

/**
 * 根据 expert ID 获取文件路径（绝对路径）
 */
export function getExpertFilePath(id: string): string | null {
  const rel = EXPERT_PATH_MAP[id];
  if (!rel) { return null; }
  return path.join(EXPERTS_BASE, rel);
}

/**
 * 加载一个或多个 expert profile
 */
export function loadExpertProfiles(expertIds: string[]): LoadedExperts {
  const profiles: ExpertProfile[] = [];
  const missing: string[] = [];

  for (const id of expertIds) {
    const filePath = getExpertFilePath(id);
    if (!filePath || !fs.existsSync(filePath)) {
      missing.push(id);
      profiles.push({ id, available: false, content: '' });
      continue;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');

    // Extract name/role from YAML front-matter inside code block
    const rolMatch  = raw.match(/^role:\s*(.+)$/m);
    const emojiMatch = raw.match(/^emoji:\s*(.+)$/m);
    const nameCnMatch = raw.match(/^name_cn:\s*(.+)$/m);
    const nameEnMatch = raw.match(/^name:\s*(.+)$/m);

    profiles.push({
      id,
      name:    nameEnMatch?.[1]?.trim(),
      name_cn: nameCnMatch?.[1]?.trim(),
      role:    rolMatch?.[1]?.trim(),
      emoji:   emojiMatch?.[1]?.trim(),
      content: raw,
      available: true,
    });
  }

  return { profiles, missing };
}

/**
 * 解析 ticket 文件中的 assigned_experts 字段
 * 支持格式：
 *   assigned_experts: architect, backend, security
 *   **assigned_experts**: architect, backend
 */
export function parseAssignedExperts(ticketContent: string): string[] {
  const m = ticketContent.match(/\*{0,2}assigned_experts\*{0,2}[:\s]+([^\n]+)/i);
  if (!m) { return []; }
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/`/g, ''))
    .filter((s) => s.length > 0 && s !== '无' && s !== 'none' && s !== '-');
}

/**
 * 生成专家 profile 的 ACTIVE_CONTEXT 片段
 */
export function formatExpertSection(loaded: LoadedExperts): string {
  if (loaded.profiles.length === 0) { return ''; }

  const available = loaded.profiles.filter((p) => p.available);
  const unavailable = loaded.missing;

  let section = `## 专家团队 (Assigned Experts)\n\n`;

  if (available.length === 0) {
    section += `> ⚠️ 无可用专家 profile（文件未找到）\n`;
  } else {
    for (const p of available) {
      const label = `${p.emoji ?? '👤'} **${p.name_cn ?? p.name ?? p.id}** (${p.role ?? p.id})`;
      section += `### ${label}\n\n`;
      // Inline compact summary (first 30 lines of the MD, skip yaml fence lines)
      const lines = p.content.split('\n');
      const preview = lines
        .filter((l) => !l.startsWith('```') )
        .slice(0, 35)
        .join('\n')
        .trim();
      section += `<details>\n<summary>展开 profile</summary>\n\n${preview}\n\n</details>\n\n`;
    }
  }

  if (unavailable.length > 0) {
    section += `> ⚠️ 以下专家 profile 未找到（需安装扩展包）：${unavailable.join(', ')}\n`;
    section += `> 安装命令：\`bash ~/.claude/skills/eket/scripts/install-extended.sh\`\n`;
  }

  return section;
}
