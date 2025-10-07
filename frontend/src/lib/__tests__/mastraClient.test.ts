import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for testing
global.fetch = vi.fn();

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'localhost'
  },
  writable: true
});

describe('Mastra Client Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  it('should create mastra client with correct configuration', async () => {
    const { mastra } = await import('../mastraClient');
    
    expect(mastra).toBeDefined();
    // The client should be configured with localhost for tests
  });

  it('should get weather agent ID from environment', async () => {
    const { getWeatherAgentId } = await import('../mastraClient');
    
    const agentId = getWeatherAgentId();
    expect(agentId).toBe('weather'); // Default fallback when env var is not set
  });

  it('should get display host', async () => {
    const { getDisplayHost } = await import('../mastraClient');
    
    const host = getDisplayHost();
    expect(host).toBeTruthy();
  });

  it('should get mastra base URL', async () => {
    const { getMastraBaseUrl } = await import('../mastraClient');
    
    const baseUrl = getMastraBaseUrl();
    
    // The base URL should be a valid URL (either localhost for dev or production domain)
    expect(baseUrl).toMatch(/^https?:\/\/.+/);
    // Should contain either localhost (dev) or streamingportfolio.com (prod)
    expect(baseUrl).toMatch(/localhost|streamingportfolio\.com/);
  });

  it('should handle connection test', async () => {
    // Mock successful health check
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        service: 'weather-mcp-server',
        timestamp: new Date().toISOString()
      })
    });

    // Import after setting up mocks
    await import('../mastraClient');

    // Wait for the connection test to run
    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('health'),
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should handle connection test failure gracefully', async () => {
    // Mock failed health check
    (global.fetch as any).mockRejectedValueOnce(new Error('Connection failed'));

    // Should not throw error when importing
    await expect(async () => {
      await import('../mastraClient');
    }).not.toThrow();
  });

  it('should get dynamic toolsets', async () => {
    const { mastra } = await import('../mastraClient');
    
    if (mastra.getDynamicToolsets) {
      const toolsets = await mastra.getDynamicToolsets();
      expect(toolsets).toBeDefined();
      expect(typeof toolsets).toBe('object');
    }
  });
});
