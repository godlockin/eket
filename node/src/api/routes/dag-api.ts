/**
 * DAG API Routes (TASK-648)
 *
 * REST API for DAG visualization and status:
 *   - GET /api/v1/dag/view   - Render DAG in Mermaid or ASCII format
 *   - GET /api/v1/dag/status - Get DAG run status as JSON
 *
 * @module dag-api
 */

import { Router, Request, Response } from 'express';
import { resolve, join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';

import { createDAGExecutor, type DAGRun } from '../../core/dag-executor.js';
import { createDAGVisualizer, type VisualizationResult } from '../../core/dag-visualizer.js';
import { validateDag, type DagSchema } from '../../schemas/dag.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

interface DagViewQuery {
  epic?: string;
  file?: string;
  format?: 'mermaid' | 'ascii';
  runId?: string;
}

interface DagStatusQuery {
  runId?: string;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
  timestamp: number;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
  timestamp: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find DAG file for an EPIC.
 * Searches in common locations: project root, jira/epics/, docs/dags/
 */
function findDagFile(epic: string, projectRoot: string): string | null {
  const possibleLocations = [
    join(projectRoot, `${epic}.dag.yml`),
    join(projectRoot, `${epic}.dag.yaml`),
    join(projectRoot, 'jira', 'epics', epic, 'dag.yml'),
    join(projectRoot, 'jira', 'epics', epic, 'dag.yaml'),
    join(projectRoot, 'docs', 'dags', `${epic}.yml`),
    join(projectRoot, 'docs', 'dags', `${epic}.yaml`),
  ];

  for (const loc of possibleLocations) {
    if (existsSync(loc)) {
      return loc;
    }
  }

  // Search for any *.dag.yml with matching epic field
  const dagFiles = findAllDagFiles(projectRoot);
  for (const dagPath of dagFiles) {
    try {
      const content = readFileSync(dagPath, 'utf-8');
      const dag = parseYaml(content) as unknown;
      if (dag && typeof dag === 'object' && 'epic' in dag && (dag as { epic: string }).epic === epic) {
        return dagPath;
      }
    } catch {
      // Skip invalid files
    }
  }

  return null;
}

/**
 * Find all DAG files in a directory (recursive, limited depth).
 */
function findAllDagFiles(dir: string, depth = 3): string[] {
  const results: string[] = [];

  if (depth <= 0 || !existsSync(dir)) {
    return results;
  }

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isFile() && (entry.name.endsWith('.dag.yml') || entry.name.endsWith('.dag.yaml'))) {
        results.push(fullPath);
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results.push(...findAllDagFiles(fullPath, depth - 1));
      }
    }
  } catch {
    // Permission denied or other errors
  }

  return results;
}

/**
 * Load DAG from file path.
 */
async function loadDag(filePath: string): Promise<DagSchema> {
  const content = readFileSync(filePath, 'utf-8');
  const dag = parseYaml(content) as unknown;

  const validation = validateDag(dag);
  if (!validation.valid) {
    throw new Error(
      `Invalid DAG: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`
    );
  }

  return dag as DagSchema;
}

// ============================================================================
// Router Factory
// ============================================================================

export interface DagRouterDeps {
  projectRoot?: string;
}

/**
 * Create DAG API router.
 *
 * Routes:
 *   GET /dag/view   - Render DAG visualization
 *   GET /dag/status - Get run status
 */
export function createDagRouter(deps: DagRouterDeps = {}): Router {
  const router = Router();
  const projectRoot = deps.projectRoot ?? resolve(process.cwd());

  /**
   * GET /dag/view
   *
   * Query params:
   *   - epic: EPIC ID (e.g., EPIC-017) - searches for DAG file
   *   - file: Direct path to DAG file (alternative to epic)
   *   - format: 'mermaid' | 'ascii' (default: mermaid)
   *   - runId: Optional run ID to include status
   *
   * Response:
   *   - format=mermaid: text/plain with Mermaid code
   *   - format=ascii: text/plain with ASCII art
   *   - format=json: application/json with full result
   */
  router.get('/dag/view', async (req: Request, res: Response) => {
    const query = req.query as unknown as DagViewQuery;
    const { epic, file, format = 'mermaid', runId } = query;

    try {
      // Resolve DAG file
      let dagPath: string | null = null;
      if (file) {
        dagPath = resolve(projectRoot, file);
      } else if (epic) {
        dagPath = findDagFile(epic, projectRoot);
      }

      if (!dagPath) {
        res.status(400).json({
          success: false,
          error: { code: 'MISSING_PARAM', message: 'Either epic or file parameter is required' },
          timestamp: Date.now(),
        } as ApiError);
        return;
      }

      if (!existsSync(dagPath)) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: `DAG file not found: ${dagPath}` },
          timestamp: Date.now(),
        } as ApiError);
        return;
      }

      // Load DAG
      const dag = await loadDag(dagPath);
      const visualizer = createDAGVisualizer();

      // Load run state if specified
      let runState: DAGRun | null = null;
      if (runId) {
        const executor = createDAGExecutor();
        try {
          runState = await executor.getStatus(runId);
        } finally {
          executor.disconnect();
        }
      }

      // Generate visualization
      const result = visualizer.visualize(dag, runState ?? undefined);

      logger.info('dag_api_view', {
        epic: dag.epic,
        format,
        runId,
        totalNodes: result.summary.total,
      });

      // Return based on format
      if (format === 'mermaid') {
        res.type('text/plain').send(result.mermaid);
      } else if (format === 'ascii') {
        res.type('text/plain').send(result.ascii);
      } else if (format === 'json') {
        res.json({
          success: true,
          data: {
            epic: dag.epic,
            mermaid: result.mermaid,
            ascii: result.ascii,
            summary: result.summary,
            criticalPath: result.criticalPath,
          },
          timestamp: Date.now(),
        } as ApiSuccess<{
          epic: string;
          mermaid: string;
          ascii: string;
          summary: VisualizationResult['summary'];
          criticalPath: string[];
        }>);
      } else {
        // Default to mermaid
        res.type('text/plain').send(result.mermaid);
      }
    } catch (err) {
      logger.error('dag_api_view_error', { error: (err as Error).message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
        timestamp: Date.now(),
      } as ApiError);
    }
  });

  /**
   * GET /dag/status
   *
   * Query params:
   *   - runId: DAG run ID (required)
   *
   * Response:
   *   - JSON with run status and node results
   */
  router.get('/dag/status', async (req: Request, res: Response) => {
    const query = req.query as unknown as DagStatusQuery;
    const { runId } = query;

    if (!runId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'runId parameter is required' },
        timestamp: Date.now(),
      } as ApiError);
      return;
    }

    try {
      const executor = createDAGExecutor();

      try {
        const status = await executor.getStatus(runId);

        if (!status) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: `Run not found: ${runId}` },
            timestamp: Date.now(),
          } as ApiError);
          return;
        }

        // Convert Map to object for JSON serialization
        const nodeResults: Record<string, unknown> = {};
        for (const [nodeId, result] of status.nodeResults) {
          nodeResults[nodeId] = result;
        }

        logger.info('dag_api_status', {
          runId,
          status: status.status,
          totalNodes: status.totalNodes,
        });

        res.json({
          success: true,
          data: {
            runId: status.runId,
            epicId: status.epicId,
            status: status.status,
            startedAt: status.startedAt,
            completedAt: status.completedAt,
            duration: status.duration,
            totalNodes: status.totalNodes,
            completedNodes: status.completedNodes,
            failedNodes: status.failedNodes,
            skippedNodes: status.skippedNodes,
            nodeResults,
          },
          timestamp: Date.now(),
        } as ApiSuccess<{
          runId: string;
          epicId: string;
          status: string;
          startedAt: number;
          completedAt?: number;
          duration?: number;
          totalNodes: number;
          completedNodes: number;
          failedNodes: number;
          skippedNodes: number;
          nodeResults: Record<string, unknown>;
        }>);
      } finally {
        executor.disconnect();
      }
    } catch (err) {
      logger.error('dag_api_status_error', { error: (err as Error).message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
        timestamp: Date.now(),
      } as ApiError);
    }
  });

  /**
   * GET /dag/list
   *
   * List all DAG files found in the project.
   *
   * Response:
   *   - JSON array of DAG file paths and metadata
   */
  router.get('/dag/list', async (_req: Request, res: Response) => {
    try {
      const dagFiles = findAllDagFiles(projectRoot);
      const dags: Array<{ path: string; epic: string; nodes: number }> = [];

      for (const dagPath of dagFiles) {
        try {
          const content = readFileSync(dagPath, 'utf-8');
          const dag = parseYaml(content) as unknown;
          if (dag && typeof dag === 'object' && 'epic' in dag) {
            const dagObj = dag as DagSchema;
            dags.push({
              path: dagPath.replace(projectRoot, '.'),
              epic: dagObj.epic,
              nodes: dagObj.nodes?.length ?? 0,
            });
          }
        } catch {
          // Skip invalid files
        }
      }

      logger.info('dag_api_list', { count: dags.length });

      res.json({
        success: true,
        data: { dags },
        timestamp: Date.now(),
      } as ApiSuccess<{ dags: Array<{ path: string; epic: string; nodes: number }> }>);
    } catch (err) {
      logger.error('dag_api_list_error', { error: (err as Error).message });
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: (err as Error).message },
        timestamp: Date.now(),
      } as ApiError);
    }
  });

  return router;
}
