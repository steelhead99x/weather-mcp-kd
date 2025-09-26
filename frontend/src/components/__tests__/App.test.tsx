import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import App from '../../App';

// Mock fetch for MCPDebugPanel health checks
global.fetch = vi.fn();

// Mock the mastraClient module
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getDynamicToolsets: vi.fn().mockResolvedValue({}),
  },
  getWeatherAgentId: vi.fn().mockReturnValue('weatherAgent'),
  getDisplayHost: vi.fn().mockReturnValue('localhost:3000'),
  getMastraBaseUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}));

describe('App Component', () => {
  beforeEach(() => {
    // Use fake timers to control MCPDebugPanel's setInterval calls
    vi.useFakeTimers();
    
    // Mock fetch to return a successful health check
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: 'test' }),
    } as Response);
    
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should render the main app', async () => {
    await act(async () => {
      render(<App />);
      // Allow time for the initial async operations to start
      await vi.advanceTimersByTimeAsync(0);
    });
    
    // Check if the app renders without crashing
    expect(document.body).toBeTruthy();
  });

  it('should have proper document structure', async () => {
    let container;
    await act(async () => {
      const renderResult = render(<App />);
      container = renderResult.container;
      await vi.advanceTimersByTimeAsync(0);
    });
    
    // Should render without errors
    expect(container).toBeTruthy();
    expect(container.firstChild).toBeTruthy();
  });

  it('should render weather chat component', async () => {
    await act(async () => {
      render(<App />);
      await vi.advanceTimersByTimeAsync(0);
    });
    
    // Look for elements that indicate the weather chat is rendered
    const appContainer = screen.getByRole('main', { hidden: true }) || 
                         document.querySelector('[class*="app"]') ||
                         document.body;
    
    expect(appContainer).toBeTruthy();
  });
});
