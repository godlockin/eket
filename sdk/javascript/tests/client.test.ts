/**
 * Tests for EketClient
 */

import { EketClient } from '../src/client';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockInterceptors = {
  request: { use: jest.fn(), eject: jest.fn() },
  response: { use: jest.fn(), eject: jest.fn() },
};
mockedAxios.create.mockReturnValue({
  interceptors: mockInterceptors,
  defaults: { headers: { common: {} } },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
} as any);

describe('EketClient', () => {
  let client: EketClient;

  beforeEach(() => {
    client = new EketClient({
      serverUrl: 'http://localhost:8080',
      timeout: 30000,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const config = client.getConfig();
      expect(config.serverUrl).toBe('http://localhost:8080');
      expect(config.timeout).toBe(30000);
      expect(config.enableWebSocket).toBe(true);
    });

    it('should create client with custom config', () => {
      const customClient = new EketClient({
        serverUrl: 'https://api.example.com',
        timeout: 60000,
        enableWebSocket: false,
        jwtToken: 'test-token',
      });

      const config = customClient.getConfig();
      expect(config.serverUrl).toBe('https://api.example.com');
      expect(config.timeout).toBe(60000);
      expect(config.enableWebSocket).toBe(false);
    });
  });

  describe('setToken', () => {
    it('should set JWT token', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      client.setToken(token);

      const config = client.getConfig();
      expect(config.jwtToken).toBe(token);
    });
  });

  describe('registerAgent', () => {
    it('should validate required fields', async () => {
      await expect(
        client.registerAgent({} as any)
      ).rejects.toThrow('Missing required fields');
    });
  });

  describe('WebSocket', () => {
    it('should check connection status', () => {
      expect(client.isWebSocketConnected()).toBe(false);
    });

    it('should manage message handlers', () => {
      const handler = jest.fn();
      client.onMessage(handler);
      client.offMessage(handler);
      // No error should be thrown
      expect(true).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should cleanup resources', async () => {
      await expect(client.shutdown()).resolves.toBeUndefined();
    });
  });
});
