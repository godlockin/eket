/**
 * EKET Protocol Client
 *
 * Main client class for interacting with EKET Protocol servers
 *
 * @module client
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import WebSocket from 'ws';
import type {
  EketClientConfig,
  AgentRegistration,
  AgentRegistrationResponse,
  Agent,
  AgentFilters,
  HeartbeatParams,
  HeartbeatResponse,
  Task,
  TaskFilters,
  TaskUpdate,
  Message,
  SendMessageParams,
  GetMessagesOptions,
  SubmitPRParams,
  PRReview,
  MergePRParams,
  MergeResult,
  HealthResponse,
  WSMessage,
} from './types.js';
import {
  NetworkError,
  WebSocketError,
  createErrorFromResponse,
} from './errors.js';
import { buildUrl, validateRequired, extractErrorMessage } from './utils.js';

/**
 * EKET Protocol Client
 *
 * Provides a high-level interface for AI agents to interact with EKET servers.
 *
 * @example
 * ```typescript
 * const client = new EketClient({
 *   serverUrl: 'http://localhost:8080',
 * });
 *
 * // Register agent
 * const { instance_id, token } = await client.registerAgent({
 *   agent_type: 'claude_code',
 *   role: 'slaver',
 *   specialty: 'frontend',
 * });
 *
 * // Set token for authenticated requests
 * client.setToken(token);
 *
 * // List available tasks
 * const tasks = await client.listTasks({ status: 'ready' });
 * ```
 */
export class EketClient {
  private config: Required<Omit<EketClientConfig, 'jwtToken'>> & Pick<EketClientConfig, 'jwtToken'>;
  private http: AxiosInstance;
  private ws?: WebSocket;
  private wsReconnectAttempts = 0;
  private wsMaxReconnectAttempts = 5;
  private wsReconnectDelay = 1000;
  private wsMessageHandlers: Set<(message: Message) => void> = new Set();
  private wsErrorHandlers: Set<(error: Error) => void> = new Set();
  private wsCloseHandlers: Set<() => void> = new Set();

  /**
   * Create a new EKET client
   *
   * @param config - Client configuration
   */
  constructor(config: EketClientConfig) {
    this.config = {
      timeout: 30000,
      enableWebSocket: true,
      ...config,
    };

    // Initialize HTTP client
    this.http = axios.create({
      baseURL: `${this.config.serverUrl}/api/v1`,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.http.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response) {
          throw createErrorFromResponse(error.response.status, error.response.data as any);
        } else if (error.request) {
          throw new NetworkError('No response from server', { error: error.message });
        } else {
          throw new NetworkError(error.message);
        }
      }
    );
  }

  /**
   * Set JWT authentication token
   *
   * @param token - JWT token from registration
   */
  setToken(token: string): void {
    this.config.jwtToken = token;
    this.http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // =========================================================================
  // Health Check
  // =========================================================================

  /**
   * Check server health
   *
   * @returns Health check response
   */
  async healthCheck(): Promise<HealthResponse> {
    const response = await this.http.get<HealthResponse>('/health');
    return response.data;
  }

  // =========================================================================
  // Agent Management
  // =========================================================================

  /**
   * Register a new agent with the server
   *
   * @param params - Agent registration parameters
   * @returns Registration response with instance ID and token
   *
   * @example
   * ```typescript
   * const result = await client.registerAgent({
   *   agent_type: 'claude_code',
   *   role: 'slaver',
   *   specialty: 'frontend',
   *   capabilities: ['react', 'typescript', 'css'],
   * });
   * console.log('Registered as:', result.instance_id);
   * client.setToken(result.token);
   * ```
   */
  async registerAgent(params: AgentRegistration): Promise<AgentRegistrationResponse> {
    validateRequired(params, ['agent_type', 'role']);

    const payload = {
      protocol_version: '1.0.0',
      ...params,
    };

    const response = await this.http.post<AgentRegistrationResponse>(
      '/agents/register',
      payload
    );

    // Automatically set token
    if (response.data.token) {
      this.setToken(response.data.token);
    }

    return response.data;
  }

  /**
   * Deregister an agent
   *
   * @param instanceId - Agent instance ID
   */
  async deregisterAgent(instanceId: string): Promise<void> {
    await this.http.delete(`/agents/${instanceId}`);

    // Close WebSocket if connected
    if (this.ws) {
      this.disconnectWebSocket();
    }
  }

  /**
   * Send heartbeat to server
   *
   * @param instanceId - Agent instance ID
   * @param params - Heartbeat parameters
   * @returns Heartbeat response with pending messages
   *
   * @example
   * ```typescript
   * const { messages } = await client.sendHeartbeat(instanceId, {
   *   status: 'active',
   *   current_task: 'FEAT-001',
   *   progress: 0.75,
   * });
   * ```
   */
  async sendHeartbeat(
    instanceId: string,
    params: HeartbeatParams = {}
  ): Promise<HeartbeatResponse> {
    const response = await this.http.post<HeartbeatResponse>(
      `/agents/${instanceId}/heartbeat`,
      params
    );
    return response.data;
  }

  /**
   * Get agent details
   *
   * @param instanceId - Agent instance ID
   * @returns Agent details
   */
  async getAgent(instanceId: string): Promise<Agent> {
    const response = await this.http.get<{ success: boolean; agent: Agent }>(
      `/agents/${instanceId}`
    );
    return response.data.agent;
  }

  /**
   * List registered agents
   *
   * @param filters - Optional filters
   * @returns Array of agents
   *
   * @example
   * ```typescript
   * // Get all active slaver agents
   * const agents = await client.listAgents({
   *   role: 'slaver',
   *   status: 'active',
   * });
   * ```
   */
  async listAgents(filters?: AgentFilters): Promise<Agent[]> {
    const url = buildUrl('', '/agents', filters as any);
    const response = await this.http.get<{ success: boolean; agents: Agent[] }>(url);
    return response.data.agents;
  }

  // =========================================================================
  // Task Management
  // =========================================================================

  /**
   * List tasks
   *
   * @param filters - Optional filters
   * @returns Array of tasks
   *
   * @example
   * ```typescript
   * // Get all ready frontend tasks
   * const tasks = await client.listTasks({
   *   status: 'ready',
   *   tags: 'frontend,react',
   * });
   * ```
   */
  async listTasks(filters?: TaskFilters): Promise<Task[]> {
    const url = buildUrl('', '/tasks', filters as any);
    const response = await this.http.get<{ success: boolean; tasks: Task[] }>(url);
    return response.data.tasks;
  }

  /**
   * Get task details
   *
   * @param taskId - Task ID (e.g., FEAT-001)
   * @returns Task details
   */
  async getTask(taskId: string): Promise<Task> {
    const response = await this.http.get<{ success: boolean; task: Task }>(
      `/tasks/${taskId}`
    );
    return response.data.task;
  }

  /**
   * Claim a task
   *
   * @param taskId - Task ID to claim
   * @param instanceId - Agent instance ID
   * @returns Updated task
   *
   * @example
   * ```typescript
   * const task = await client.claimTask('FEAT-001', instanceId);
   * console.log('Claimed task:', task.title);
   * ```
   */
  async claimTask(taskId: string, instanceId: string): Promise<Task> {
    const response = await this.http.post<{ success: boolean; task: Task }>(
      `/tasks/${taskId}/claim`,
      { instance_id: instanceId }
    );
    return response.data.task;
  }

  /**
   * Update task status
   *
   * @param taskId - Task ID
   * @param updates - Task updates
   * @returns Updated task
   *
   * @example
   * ```typescript
   * await client.updateTask('FEAT-001', {
   *   status: 'review',
   *   progress: 1.0,
   *   notes: 'PR submitted',
   * });
   * ```
   */
  async updateTask(taskId: string, updates: TaskUpdate): Promise<Task> {
    const response = await this.http.patch<{ success: boolean; task: Task }>(
      `/tasks/${taskId}`,
      updates
    );
    return response.data.task;
  }

  // =========================================================================
  // Messaging
  // =========================================================================

  /**
   * Send a message to another agent
   *
   * @param params - Message parameters
   * @returns Message ID
   *
   * @example
   * ```typescript
   * await client.sendMessage({
   *   from: instanceId,
   *   to: 'master',
   *   type: 'pr_review_request',
   *   payload: {
   *     task_id: 'FEAT-001',
   *     branch: 'feature/FEAT-001',
   *     description: 'Added login feature',
   *   },
   * });
   * ```
   */
  async sendMessage(params: SendMessageParams): Promise<string> {
    validateRequired(params, ['from', 'to', 'type', 'payload']);

    const response = await this.http.post<{
      success: boolean;
      message_id: string;
      delivered_at: string;
    }>('/messages', params);

    return response.data.message_id;
  }

  /**
   * Get messages for an agent
   *
   * @param instanceId - Agent instance ID
   * @param options - Query options
   * @returns Array of messages
   *
   * @example
   * ```typescript
   * const messages = await client.getMessages(instanceId, {
   *   since: Date.now() / 1000 - 3600, // Last hour
   *   limit: 50,
   * });
   * ```
   */
  async getMessages(
    instanceId: string,
    options?: GetMessagesOptions
  ): Promise<Message[]> {
    const url = buildUrl('', `/agents/${instanceId}/messages`, options as any);
    const response = await this.http.get<{
      success: boolean;
      messages: Message[];
      has_more: boolean;
    }>(url);
    return response.data.messages;
  }

  // =========================================================================
  // PR Workflow
  // =========================================================================

  /**
   * Submit a pull request
   *
   * @param params - PR submission parameters
   * @returns PR ID
   *
   * @example
   * ```typescript
   * await client.submitPR({
   *   instance_id: instanceId,
   *   task_id: 'FEAT-001',
   *   branch: 'feature/FEAT-001-user-login',
   *   description: 'Implemented user login with email/password',
   *   test_status: 'passed',
   * });
   * ```
   */
  async submitPR(params: SubmitPRParams): Promise<string> {
    validateRequired(params, ['instance_id', 'task_id', 'branch', 'description']);

    const response = await this.http.post<{
      success: boolean;
      pr_id: string;
      status: string;
    }>('/prs', params);

    return response.data.pr_id;
  }

  /**
   * Review a pull request
   *
   * @param taskId - Task ID associated with PR
   * @param review - Review details
   *
   * @example
   * ```typescript
   * await client.reviewPR('FEAT-001', {
   *   reviewer: 'master_001',
   *   status: 'approved',
   *   summary: 'Looks good!',
   * });
   * ```
   */
  async reviewPR(taskId: string, review: PRReview): Promise<void> {
    validateRequired(review, ['reviewer', 'status']);

    await this.http.post(`/prs/${taskId}/review`, review);
  }

  /**
   * Merge a pull request
   *
   * @param taskId - Task ID associated with PR
   * @param params - Merge parameters
   * @returns Merge result
   *
   * @example
   * ```typescript
   * const result = await client.mergePR('FEAT-001', {
   *   merger: 'master_001',
   *   target_branch: 'main',
   *   squash: false,
   * });
   * console.log('Merged:', result.merge_commit);
   * ```
   */
  async mergePR(taskId: string, params: MergePRParams): Promise<MergeResult> {
    validateRequired(params, ['merger', 'target_branch']);

    const response = await this.http.post<MergeResult>(`/prs/${taskId}/merge`, params);
    return response.data;
  }

  // =========================================================================
  // WebSocket Management
  // =========================================================================

  /**
   * Connect to WebSocket for real-time messaging
   *
   * @param instanceId - Agent instance ID
   *
   * @example
   * ```typescript
   * await client.connectWebSocket(instanceId);
   *
   * client.onMessage((message) => {
   *   console.log('Received message:', message);
   * });
   * ```
   */
  async connectWebSocket(instanceId: string): Promise<void> {
    if (!this.config.enableWebSocket) {
      throw new WebSocketError('WebSocket is disabled in client configuration');
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    const wsUrl = this.config.serverUrl.replace(/^http/, 'ws');
    const url = `${wsUrl}/ws?instance_id=${instanceId}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          this.wsReconnectAttempts = 0;
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const wsMessage = JSON.parse(data.toString()) as WSMessage;

            if (wsMessage.type === 'message' && wsMessage.data) {
              const message = wsMessage.data as Message;
              this.wsMessageHandlers.forEach((handler) => handler(message));
            }
          } catch (error) {
            const err = new WebSocketError(
              `Failed to parse WebSocket message: ${extractErrorMessage(error)}`
            );
            this.wsErrorHandlers.forEach((handler) => handler(err));
          }
        });

        this.ws.on('error', (error: Error) => {
          const wsError = new WebSocketError(error.message);
          this.wsErrorHandlers.forEach((handler) => handler(wsError));
          reject(wsError);
        });

        this.ws.on('close', () => {
          this.wsCloseHandlers.forEach((handler) => handler());

          // Attempt reconnect
          if (this.wsReconnectAttempts < this.wsMaxReconnectAttempts) {
            this.wsReconnectAttempts++;
            setTimeout(() => {
              this.connectWebSocket(instanceId).catch(() => {
                // Ignore error, will retry
              });
            }, this.wsReconnectDelay * Math.pow(2, this.wsReconnectAttempts));
          }
        });
      } catch (error) {
        reject(new WebSocketError(extractErrorMessage(error)));
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  /**
   * Register a message handler for WebSocket messages
   *
   * @param handler - Message handler function
   */
  onMessage(handler: (message: Message) => void): void {
    this.wsMessageHandlers.add(handler);
  }

  /**
   * Unregister a message handler
   *
   * @param handler - Message handler to remove
   */
  offMessage(handler: (message: Message) => void): void {
    this.wsMessageHandlers.delete(handler);
  }

  /**
   * Register an error handler for WebSocket errors
   *
   * @param handler - Error handler function
   */
  onError(handler: (error: Error) => void): void {
    this.wsErrorHandlers.add(handler);
  }

  /**
   * Unregister an error handler
   *
   * @param handler - Error handler to remove
   */
  offError(handler: (error: Error) => void): void {
    this.wsErrorHandlers.delete(handler);
  }

  /**
   * Register a close handler for WebSocket disconnection
   *
   * @param handler - Close handler function
   */
  onClose(handler: () => void): void {
    this.wsCloseHandlers.add(handler);
  }

  /**
   * Unregister a close handler
   *
   * @param handler - Close handler to remove
   */
  offClose(handler: () => void): void {
    this.wsCloseHandlers.delete(handler);
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<Omit<EketClientConfig, 'jwtToken'>> & Pick<EketClientConfig, 'jwtToken'>> {
    return { ...this.config };
  }

  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Gracefully shutdown the client
   */
  async shutdown(): Promise<void> {
    this.disconnectWebSocket();
    // Clear all handlers
    this.wsMessageHandlers.clear();
    this.wsErrorHandlers.clear();
    this.wsCloseHandlers.clear();
  }
}
