/**
 * EKET Protocol Client
 *
 * Main client class for interacting with EKET Protocol servers
 *
 * @module client
 */
import axios from 'axios';
import WebSocket from 'ws';
import { NetworkError, WebSocketError, createErrorFromResponse, } from './errors.js';
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
    /**
     * Create a new EKET client
     *
     * @param config - Client configuration
     */
    constructor(config) {
        this.wsReconnectAttempts = 0;
        this.wsMaxReconnectAttempts = 5;
        this.wsReconnectDelay = 1000;
        this.wsMessageHandlers = new Set();
        this.wsErrorHandlers = new Set();
        this.wsCloseHandlers = new Set();
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
        this.http.interceptors.response.use((response) => response, (error) => {
            if (error.response) {
                throw createErrorFromResponse(error.response.status, error.response.data);
            }
            else if (error.request) {
                throw new NetworkError('No response from server', { error: error.message });
            }
            else {
                throw new NetworkError(error.message);
            }
        });
    }
    /**
     * Set JWT authentication token
     *
     * @param token - JWT token from registration
     */
    setToken(token) {
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
    async healthCheck() {
        const response = await this.http.get('/health');
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
    async registerAgent(params) {
        validateRequired(params, ['agent_type', 'role']);
        const payload = {
            protocol_version: '1.0.0',
            ...params,
        };
        const response = await this.http.post('/agents/register', payload);
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
    async deregisterAgent(instanceId) {
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
    async sendHeartbeat(instanceId, params = {}) {
        const response = await this.http.post(`/agents/${instanceId}/heartbeat`, params);
        return response.data;
    }
    /**
     * Get agent details
     *
     * @param instanceId - Agent instance ID
     * @returns Agent details
     */
    async getAgent(instanceId) {
        const response = await this.http.get(`/agents/${instanceId}`);
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
    async listAgents(filters) {
        const url = buildUrl('', '/agents', filters);
        const response = await this.http.get(url);
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
    async listTasks(filters) {
        const url = buildUrl('', '/tasks', filters);
        const response = await this.http.get(url);
        return response.data.tasks;
    }
    /**
     * Get task details
     *
     * @param taskId - Task ID (e.g., FEAT-001)
     * @returns Task details
     */
    async getTask(taskId) {
        const response = await this.http.get(`/tasks/${taskId}`);
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
    async claimTask(taskId, instanceId) {
        const response = await this.http.post(`/tasks/${taskId}/claim`, { instance_id: instanceId });
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
    async updateTask(taskId, updates) {
        const response = await this.http.patch(`/tasks/${taskId}`, updates);
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
    async sendMessage(params) {
        validateRequired(params, ['from', 'to', 'type', 'payload']);
        const response = await this.http.post('/messages', params);
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
    async getMessages(instanceId, options) {
        const url = buildUrl('', `/agents/${instanceId}/messages`, options);
        const response = await this.http.get(url);
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
    async submitPR(params) {
        validateRequired(params, ['instance_id', 'task_id', 'branch', 'description']);
        const response = await this.http.post('/prs', params);
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
    async reviewPR(taskId, review) {
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
    async mergePR(taskId, params) {
        validateRequired(params, ['merger', 'target_branch']);
        const response = await this.http.post(`/prs/${taskId}/merge`, params);
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
    async connectWebSocket(instanceId) {
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
                this.ws.on('message', (data) => {
                    try {
                        const wsMessage = JSON.parse(data.toString());
                        if (wsMessage.type === 'message' && wsMessage.data) {
                            const message = wsMessage.data;
                            this.wsMessageHandlers.forEach((handler) => handler(message));
                        }
                    }
                    catch (error) {
                        const err = new WebSocketError(`Failed to parse WebSocket message: ${extractErrorMessage(error)}`);
                        this.wsErrorHandlers.forEach((handler) => handler(err));
                    }
                });
                this.ws.on('error', (error) => {
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
            }
            catch (error) {
                reject(new WebSocketError(extractErrorMessage(error)));
            }
        });
    }
    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket() {
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
    onMessage(handler) {
        this.wsMessageHandlers.add(handler);
    }
    /**
     * Unregister a message handler
     *
     * @param handler - Message handler to remove
     */
    offMessage(handler) {
        this.wsMessageHandlers.delete(handler);
    }
    /**
     * Register an error handler for WebSocket errors
     *
     * @param handler - Error handler function
     */
    onError(handler) {
        this.wsErrorHandlers.add(handler);
    }
    /**
     * Unregister an error handler
     *
     * @param handler - Error handler to remove
     */
    offError(handler) {
        this.wsErrorHandlers.delete(handler);
    }
    /**
     * Register a close handler for WebSocket disconnection
     *
     * @param handler - Close handler function
     */
    onClose(handler) {
        this.wsCloseHandlers.add(handler);
    }
    /**
     * Unregister a close handler
     *
     * @param handler - Close handler to remove
     */
    offClose(handler) {
        this.wsCloseHandlers.delete(handler);
    }
    // =========================================================================
    // Utility Methods
    // =========================================================================
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Check if WebSocket is connected
     */
    isWebSocketConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
    /**
     * Gracefully shutdown the client
     */
    async shutdown() {
        this.disconnectWebSocket();
        // Clear all handlers
        this.wsMessageHandlers.clear();
        this.wsErrorHandlers.clear();
        this.wsCloseHandlers.clear();
    }
}
//# sourceMappingURL=client.js.map