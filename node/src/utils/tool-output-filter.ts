/**
 * Tool Output Filter
 * TASK-605: Smart filtering for grep/glob/ls outputs
 *
 * AC1: Grep - exact match priority (keep exact > fuzzy match)
 * AC2: Glob - mtime desc (limit 200 stat calls)
 * AC3: ls - original order (no filter)
 * AC4: Unknown - truncate 5000 chars
 * AC5: All - append "[... N more results]" when filtered
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Constants
// ============================================================================

const GLOB_STAT_LIMIT = 200;
const UNKNOWN_OUTPUT_LIMIT = 5000;

// ============================================================================
// Types
// ============================================================================

export type ToolType = 'grep' | 'glob' | 'ls' | 'unknown';

interface FileWithTime {
  file: string;
  mtime: number;
}

// ============================================================================
// Core Filter
// ============================================================================

/**
 * Filter tool output based on tool type
 *
 * @param toolName - Tool name from hook payload (e.g., "Grep", "Glob")
 * @param output - Raw stdout from tool execution
 * @param cwd - Current working directory for stat operations
 * @returns Filtered output with metadata footer
 */
export function filterToolOutput(
  toolName: string,
  output: string,
  cwd: string = process.cwd()
): string {
  const toolType = detectToolType(toolName);

  switch (toolType) {
    case 'grep':
      return filterGrepOutput(output);
    case 'glob':
      return filterGlobOutput(output, cwd);
    case 'ls':
      return filterLsOutput(output);
    default:
      return filterUnknownOutput(output);
  }
}

// ============================================================================
// Tool Type Detection
// ============================================================================

/**
 * Detect tool type from tool name (case-insensitive)
 */
function detectToolType(toolName: string): ToolType {
  const lower = toolName.toLowerCase();

  if (lower.includes('grep')) {return 'grep';}
  if (lower.includes('glob')) {return 'glob';}
  if (lower.includes('ls') || lower.includes('list')) {return 'ls';}

  return 'unknown';
}

// ============================================================================
// AC1: Grep Filter - Exact Match Priority
// ============================================================================

/**
 * Filter grep output: prioritize exact matches over fuzzy
 *
 * Strategy:
 * - Split output into lines
 * - Lines with exact word boundaries ranked higher
 * - Keep top 100 results, exact first
 *
 * @param output - Raw grep output
 * @returns Filtered output
 */
function filterGrepOutput(output: string): string {
  const lines = output.split('\n').filter(Boolean);

  if (lines.length <= 100) {
    return output; // No filter needed
  }

  // Parse grep output format: "file:line:content"
  const parsed = lines.map((line) => {
    const match = line.match(/^([^:]+):(\d+):(.+)$/);
    if (!match) {return { raw: line, file: '', lineNum: 0, content: line, exact: false };}

    const [, file, lineNum, content] = match;
    // Heuristic: exact match if content contains pattern as whole word
    // (This requires pattern knowledge - simplified: check for word boundaries)
    const exact = /\b\w+\b/.test(content); // Placeholder logic

    return { raw: line, file, lineNum: parseInt(lineNum), content, exact };
  });

  // Sort: exact matches first, then by file+line
  const sorted = parsed.sort((a, b) => {
    if (a.exact !== b.exact) {return a.exact ? -1 : 1;}
    if (a.file !== b.file) {return a.file.localeCompare(b.file);}
    return a.lineNum - b.lineNum;
  });

  const kept = sorted.slice(0, 100);
  const filtered = kept.map((p) => p.raw).join('\n');

  return appendFooter(filtered, lines.length - kept.length);
}

// ============================================================================
// AC2: Glob Filter - mtime Descending
// ============================================================================

/**
 * Filter glob output: sort by mtime desc, limit stat calls
 *
 * Strategy:
 * - Take first 200 paths (stat limit)
 * - Stat and sort by mtime desc
 * - Return top 100
 *
 * @param output - Raw glob output (newline-separated paths)
 * @param cwd - Working directory for resolving relative paths
 * @returns Filtered output
 */
function filterGlobOutput(output: string, cwd: string): string {
  const lines = output.split('\n').filter(Boolean);

  if (lines.length <= 100) {
    return output; // No filter needed
  }

  // AC2: Limit stat calls to 200
  const toStat = lines.slice(0, GLOB_STAT_LIMIT);
  const filesWithTime: FileWithTime[] = [];

  for (const file of toStat) {
    try {
      const fullPath = path.resolve(cwd, file);
      const stat = fs.statSync(fullPath);
      filesWithTime.push({ file, mtime: stat.mtimeMs });
    } catch {
      // Skip files that can't be stat'd (deleted, permission denied)
      continue;
    }
  }

  // Sort by mtime desc
  filesWithTime.sort((a, b) => b.mtime - a.mtime);

  const kept = filesWithTime.slice(0, 100);
  const filtered = kept.map((f) => f.file).join('\n');

  // Total omitted = original count - kept count
  const omitted = lines.length - kept.length;

  return appendFooter(filtered, omitted);
}

// ============================================================================
// AC3: ls Filter - Original Order
// ============================================================================

/**
 * Filter ls output: keep original order (no sorting)
 *
 * @param output - Raw ls output
 * @returns Original output (no filter)
 */
function filterLsOutput(output: string): string {
  // AC3: ls always original order, no filter
  return output;
}

// ============================================================================
// AC4: Unknown Filter - Truncate
// ============================================================================

/**
 * Filter unknown tool output: truncate to 5000 chars
 *
 * @param output - Raw output
 * @returns Truncated output
 */
function filterUnknownOutput(output: string): string {
  if (output.length <= UNKNOWN_OUTPUT_LIMIT) {
    return output;
  }

  const truncated = output.slice(0, UNKNOWN_OUTPUT_LIMIT);
  return `${truncated}\n\n[... output truncated, ${output.length - UNKNOWN_OUTPUT_LIMIT} chars omitted]`;
}

// ============================================================================
// AC5: Footer Appender
// ============================================================================

/**
 * Append "... N more results" footer
 */
function appendFooter(filtered: string, omitted: number): string {
  if (omitted <= 0) {return filtered;}

  return `${filtered}\n\n[... ${omitted} more results omitted]`;
}
