/**
 * EKET Server 启动命令
 *
 * 启动 EKET Protocol HTTP Server (满血版)
 */

import { Command } from 'commander';
import ora from 'ora';

import { createEketServer, type EketServerConfig } from '../api/eket-server.js';
import { printError } from '../utils/error-handler.js';

export function registerServerStart(program: Command): void {
  program
    .command('server:start')
    .description('Start EKET Protocol HTTP Server (满血版)')
    .option('-p, --port <number>', 'Server port', '8080')
    .option('-h, --host <string>', 'Server host', '0.0.0.0')
    .option('--jwt-secret <string>', 'JWT secret for authentication')
    .option('--no-websocket', 'Disable WebSocket support')
    .option('--heartbeat-interval <number>', 'Heartbeat interval in seconds', '60')
    .option('--heartbeat-timeout <number>', 'Heartbeat timeout in seconds', '300')
    .action(async (options) => {
      const spinner = ora('Starting EKET Protocol Server...').start();

      try {
        // Generate JWT secret if not provided
        const jwtSecret =
          options.jwtSecret ||
          process.env.EKET_JWT_SECRET ||
          `eket_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        if (!options.jwtSecret && !process.env.EKET_JWT_SECRET) {
          spinner.warn(
            'No JWT secret provided. Using auto-generated secret (not suitable for production)'
          );
          console.log(`  💡 Set EKET_JWT_SECRET env var or use --jwt-secret flag for production\n`);
        }

        const config: EketServerConfig = {
          port: parseInt(options.port, 10),
          host: options.host,
          jwtSecret,
          projectRoot: process.cwd(),
          enableWebSocket: options.websocket !== false,
          heartbeatInterval: parseInt(options.heartbeatInterval, 10),
          heartbeatTimeout: parseInt(options.heartbeatTimeout, 10),
        };

        const server = createEketServer(config);

        // Setup graceful shutdown
        const shutdown = async () => {
          console.log('\n\n🛑 Shutting down server...');
          await server.stop();
          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        await server.start();
        spinner.succeed('EKET Protocol Server started successfully');

        // Keep process running
        await new Promise(() => {
          /* never resolves */
        });
      } catch (error) {
        spinner.fail('Failed to start EKET server');
        printError({
          code: 'SERVER_START_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });
}
