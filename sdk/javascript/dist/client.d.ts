/**
 * EKET Protocol Client
 *
 * Main client class for interacting with EKET Protocol servers
 *
 * @module client
 */
import type { EketClientConfig, AgentRegistration, AgentRegistrationResponse, Agent, AgentFilters, HeartbeatParams, HeartbeatResponse, Task, TaskFilters, TaskUpdate, Message, SendMessageParams, GetMessagesOptions, SubmitPRParams, PRReview, MergePRParams, MergeResult, HealthResponse } from './types.js';
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
export declare class EketClient {
    private config;
    private http;
    private ws?;
    private wsReconnectAttempts;
    private wsMaxReconnectAttempts;
    private wsReconnectDelay;
    private wsMessageHandlers;
    private wsErrorHandlers;
    private wsCloseHandlers;
    /**
     * Create a new EKET client
     *
     * @param config - Client configuration
     */
    constructor(config: EketClientConfig);
    /**
     * Set JWT authentication token
     *
     * @param token - JWT token from registration
     */
    setToken(token: string): void;
    /**
     * Check server health
     *
     * @returns Health check response
     */
    healthCheck(): Promise<HealthResponse>;
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
    registerAgent(params: AgentRegistration): Promise<AgentRegistrationResponse>;
    /**
     * Deregister an agent
     *
     * @param instanceId - Agent instance ID
     */
    deregisterAgent(instanceId: string): Promise<void>;
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
    sendHeartbeat(instanceId: string, params?: HeartbeatParams): Promise<HeartbeatResponse>;
    /**
     * Get agent details
     *
     * @param instanceId - Agent instance ID
     * @returns Agent details
     */
    getAgent(instanceId: string): Promise<Agent>;
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
    listAgents(filters?: AgentFilters): Promise<Agent[]>;
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
    listTasks(filters?: TaskFilters): Promise<Task[]>;
    /**
     * Get task details
     *
     * @param taskId - Task ID (e.g., FEAT-001)
     * @returns Task details
     */
    getTask(taskId: string): Promise<Task>;
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
    claimTask(taskId: string, instanceId: string): Promise<Task>;
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
    updateTask(taskId: string, updates: TaskUpdate): Promise<Task>;
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
    sendMessage(params: SendMessageParams): Promise<string>;
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
    getMessages(instanceId: string, options?: GetMessagesOptions): Promise<Message[]>;
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
    submitPR(params: SubmitPRParams): Promise<string>;
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
    reviewPR(taskId: string, review: PRReview): Promise<void>;
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
    mergePR(taskId: string, params: MergePRParams): Promise<MergeResult>;
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
    connectWebSocket(instanceId: string): Promise<void>;
    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket(): void;
    /**
     * Register a message handler for WebSocket messages
     *
     * @param handler - Message handler function
     */
    onMessage(handler: (message: Message) => void): void;
    /**
     * Unregister a message handler
     *
     * @param handler - Message handler to remove
     */
    offMessage(handler: (message: Message) => void): void;
    /**
     * Register an error handler for WebSocket errors
     *
     * @param handler - Error handler function
     */
    onError(handler: (error: Error) => void): void;
    /**
     * Unregister an error handler
     *
     * @param handler - Error handler to remove
     */
    offError(handler: (error: Error) => void): void;
    /**
     * Register a close handler for WebSocket disconnection
     *
     * @param handler - Close handler function
     */
    onClose(handler: () => void): void;
    /**
     * Unregister a close handler
     *
     * @param handler - Close handler to remove
     */
    offClose(handler: () => void): void;
    /**
     * Get current configuration
     */
    getConfig(): Readonly<Required<Omit<EketClientConfig, 'jwtToken'>> & Pick<EketClientConfig, 'jwtToken'>>;
    /**
     * Check if WebSocket is connected
     */
    isWebSocketConnected(): boolean;
    /**
     * Gracefully shutdown the client
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map