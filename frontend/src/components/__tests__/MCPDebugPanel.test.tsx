import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MCPDebugPanel from '../MCPDebugPanel'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

// Mock the mastra client
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getDynamicToolsets: vi.fn()
  },
  getMastraBaseUrl: () => 'http://localhost:3001',
  getWeatherAgentId: () => 'weather',
  getDisplayHost: () => 'localhost:3001'
}))

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_WEATHER_AGENT_ID: 'weather',
    MODE: 'test'
  },
  writable: true
})

describe('MCPDebugPanel', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockFetch.mockClear()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()
    mockConsoleWarn.mockClear()
    
    // Reset environment
    vi.stubGlobal('process', { env: { NODE_ENV: 'development' } })
    
    // Get the mocked mastra client
    const { mastra } = await import('../../lib/mastraClient')
    vi.mocked(mastra.getDynamicToolsets).mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Component Rendering', () => {
    it('should render the debug panel button', () => {
      render(<MCPDebugPanel />)
      
      const button = screen.getByRole('button', { name: /mcp debug/i })
      expect(button).toBeInTheDocument()
    })

    it('should show connection status icon on button', () => {
      render(<MCPDebugPanel />)
      
      const button = screen.getByRole('button', { name: /mcp debug/i })
      // Should show testing status initially (🟡)
      expect(button).toHaveTextContent('🟡')
    })

    it('should expand panel when button is clicked', async () => {
      render(<MCPDebugPanel />)
      
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('MCP Debug Panel')).toBeInTheDocument()
      })
    })

    it('should show tool call count badge when there are tool calls', async () => {
      render(<MCPDebugPanel />)
      
      // Simulate tool call detection by triggering console log
      console.log('[askWeatherAgent] Test tool call')
      
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /mcp debug/i })
        expect(button).toHaveTextContent('1') // Badge count
      })
    })
  })

  describe('Connection Status Testing', () => {
    it('should test connection on mount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      })

      render(<MCPDebugPanel />)
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/health',
          expect.objectContaining({
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-cache'
          })
        )
      })
    })

    it('should handle successful connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      })

      render(<MCPDebugPanel />)
      
      // Expand panel to see status
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('connected')).toBeInTheDocument()
        expect(screen.getByText('🟢')).toBeInTheDocument()
      })
    })

    it('should handle connection error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      render(<MCPDebugPanel />)
      
      // Expand panel to see status
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('error')).toBeInTheDocument()
        expect(screen.getByText('🔴')).toBeInTheDocument()
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('should handle HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      render(<MCPDebugPanel />)
      
      // Expand panel to see status
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('error')).toBeInTheDocument()
        expect(screen.getByText('HTTP 500: Internal Server Error')).toBeInTheDocument()
      })
    })

    it('should allow manual connection test', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      })

      render(<MCPDebugPanel />)
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      // Click test connection button
      const testButton = screen.getByText('🔄 Test Connection')
      fireEvent.click(testButton)
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2) // Once on mount, once on manual test
      })
    })
  })

  describe('Tool Call Detection', () => {
    it('should detect tool calls from console logs', async () => {
      render(<MCPDebugPanel />)
      
      // Trigger tool call detection
      console.log('[askWeatherAgent] Tool call detected')
      
      // Expand panel to see tool calls
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      // Switch to tools tab
      const toolsTab = screen.getByRole('button', { name: /tool calls/i })
      fireEvent.click(toolsTab)
      
      await waitFor(() => {
        expect(screen.getByText('askWeatherAgent')).toBeInTheDocument()
        expect(screen.getByText('📞')).toBeInTheDocument() // Called status icon
      })
    })

    it('should detect different tool call patterns', async () => {
      render(<MCPDebugPanel />)
      
      const toolCallPatterns = [
        '[streamVNext] Test call',
        '[MCPDebug] Debug message',
        'Tool call: weatherTool',
        'Agent response: Success'
      ]
      
      // Trigger multiple tool calls
      toolCallPatterns.forEach(pattern => {
        console.log(pattern)
      })
      
      // Expand panel and switch to tools tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const toolsTab = screen.getByRole('button', { name: /tool calls/i })
      fireEvent.click(toolsTab)
      
      await waitFor(() => {
        expect(screen.getByText('streamVNext')).toBeInTheDocument()
        expect(screen.getByText('MCPDebug')).toBeInTheDocument()
        expect(screen.getByText('weatherTool')).toBeInTheDocument()
      })
    })

    it('should clear tool calls when clear button is clicked', async () => {
      render(<MCPDebugPanel />)
      
      // Trigger tool call
      console.log('[askWeatherAgent] Test call')
      
      // Expand panel and switch to tools tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const toolsTab = screen.getByRole('button', { name: /tool calls/i })
      fireEvent.click(toolsTab)
      
      await waitFor(() => {
        expect(screen.getByText('askWeatherAgent')).toBeInTheDocument()
      })
      
      // Click clear button
      const clearButton = screen.getByText('Clear All')
      fireEvent.click(clearButton)
      
      await waitFor(() => {
        expect(screen.getByText('No tool calls yet')).toBeInTheDocument()
      })
    })

    it('should limit tool calls to last 50', async () => {
      render(<MCPDebugPanel />)
      
      // Generate 60 tool calls
      for (let i = 0; i < 60; i++) {
        console.log(`[testTool${i}] Call ${i}`)
      }
      
      // Expand panel and switch to tools tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const toolsTab = screen.getByRole('button', { name: /tool calls/i })
      fireEvent.click(toolsTab)
      
      await waitFor(() => {
        // Should only show last 50 calls
        const toolCallElements = screen.getAllByText(/testTool\d+/)
        expect(toolCallElements).toHaveLength(50)
        // Should not show the first 10 calls
        expect(screen.queryByText('testTool0')).not.toBeInTheDocument()
        expect(screen.queryByText('testTool9')).not.toBeInTheDocument()
      })
    })
  })

  describe('Log Interception', () => {
    it('should intercept console logs', async () => {
      render(<MCPDebugPanel />)
      
      // Generate some logs
      console.log('Test log message')
      console.error('Test error message')
      console.warn('Test warning message')
      
      // Expand panel and switch to logs tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const logsTab = screen.getByRole('button', { name: /logs/i })
      fireEvent.click(logsTab)
      
      await waitFor(() => {
        expect(screen.getByText(/Test log message/)).toBeInTheDocument()
        expect(screen.getByText(/Test error message/)).toBeInTheDocument()
        expect(screen.getByText(/Test warning message/)).toBeInTheDocument()
      })
    })

    it('should clear logs when clear button is clicked', async () => {
      render(<MCPDebugPanel />)
      
      // Generate logs
      console.log('Test log message')
      
      // Expand panel and switch to logs tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const logsTab = screen.getByRole('button', { name: /logs/i })
      fireEvent.click(logsTab)
      
      await waitFor(() => {
        expect(screen.getByText(/Test log message/)).toBeInTheDocument()
      })
      
      // Click clear button
      const clearButton = screen.getByText('Clear')
      fireEvent.click(clearButton)
      
      await waitFor(() => {
        expect(screen.getByText('No logs yet')).toBeInTheDocument()
      })
    })

    it('should limit logs to last 100 entries', async () => {
      render(<MCPDebugPanel />)
      
      // Generate 150 logs
      for (let i = 0; i < 150; i++) {
        console.log(`Log message ${i}`)
      }
      
      // Expand panel and switch to logs tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const logsTab = screen.getByRole('button', { name: /logs/i })
      fireEvent.click(logsTab)
      
      await waitFor(() => {
        // Should only show last 100 logs
        const logElements = screen.getAllByText(/Log message \d+/)
        expect(logElements).toHaveLength(100)
        // Should not show the first 50 logs
        expect(screen.queryByText('Log message 0')).not.toBeInTheDocument()
        expect(screen.queryByText('Log message 49')).not.toBeInTheDocument()
      })
    })
  })

  describe('MCP Server Discovery', () => {
    it('should discover MCP servers', async () => {
      const mockToolsets = {
        weather: { tools: ['getWeather', 'getForecast'] },
        mux: { tools: ['uploadVideo', 'getAsset'] }
      }
      
      const { mastra } = await import('../../lib/mastraClient')
      vi.mocked(mastra.getDynamicToolsets).mockResolvedValue(mockToolsets)
      
      render(<MCPDebugPanel />)
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('weather')).toBeInTheDocument()
        expect(screen.getByText('mux')).toBeInTheDocument()
        expect(screen.getByText('getWeather, getForecast')).toBeInTheDocument()
        expect(screen.getByText('uploadVideo, getAsset')).toBeInTheDocument()
      })
    })

    it('should handle MCP server discovery errors', async () => {
      const { mastra } = await import('../../lib/mastraClient')
      vi.mocked(mastra.getDynamicToolsets).mockRejectedValue(new Error('Discovery failed'))
      
      render(<MCPDebugPanel />)
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          '[MCPDebug] Failed to discover MCP servers:',
          expect.any(Error)
        )
      })
    })

    it('should allow manual MCP server discovery', async () => {
      const mockToolsets = {
        weather: { tools: ['getWeather'] }
      }
      
      const { mastra } = await import('../../lib/mastraClient')
      vi.mocked(mastra.getDynamicToolsets).mockResolvedValue(mockToolsets)
      
      render(<MCPDebugPanel />)
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      // Click discover button
      const discoverButton = screen.getByText('🔍 Discover MCP Servers')
      fireEvent.click(discoverButton)
      
      await waitFor(async () => {
        const { mastra } = await import('../../lib/mastraClient')
        expect(mastra.getDynamicToolsets).toHaveBeenCalled()
      })
    })
  })

  describe('Metrics Tracking', () => {
    it('should display performance metrics', async () => {
      render(<MCPDebugPanel />)
      
      // Generate some tool calls to create metrics
      console.log('[askWeatherAgent] Call 1')
      console.log('[streamVNext] Call 2')
      
      // Expand panel and switch to metrics tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const metricsTab = screen.getByRole('button', { name: /metrics/i })
      fireEvent.click(metricsTab)
      
      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument() // Total tool calls
        expect(screen.getByText('Total Tool Calls')).toBeInTheDocument()
      })
    })

    it('should calculate success rate', async () => {
      render(<MCPDebugPanel />)
      
      // Generate tool calls
      console.log('[askWeatherAgent] Call 1')
      console.log('[streamVNext] Call 2')
      
      // Expand panel and switch to metrics tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const metricsTab = screen.getByRole('button', { name: /metrics/i })
      fireEvent.click(metricsTab)
      
      await waitFor(() => {
        // Should show success rate calculation
        expect(screen.getByText(/Success Rate:/)).toBeInTheDocument()
      })
    })
  })

  describe('Tab Navigation', () => {
    it('should switch between tabs', async () => {
      render(<MCPDebugPanel />)
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      // Test each tab
      const tabs = [
        { id: 'status', label: 'Status', icon: '📊' },
        { id: 'tools', label: 'Tool Calls', icon: '🔧' },
        { id: 'logs', label: 'Logs', icon: '📝' },
        { id: 'metrics', label: 'Metrics', icon: '📈' }
      ]
      
      for (const tab of tabs) {
        const tabButton = screen.getByText(tab.label)
        fireEvent.click(tabButton)
        
        await waitFor(() => {
          expect(tabButton).toHaveClass('bg-blue-100', 'text-blue-700')
        })
      }
    })

    it('should show badge counts on tabs', async () => {
      render(<MCPDebugPanel />)
      
      // Generate some data
      console.log('[askWeatherAgent] Test call')
      console.log('Test log message')
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        // Tools tab should show badge
        const toolsTab = screen.getByRole('button', { name: /tool calls/i })
        expect(toolsTab.parentElement).toHaveTextContent('1')
        
        // Logs tab should show badge
        const logsTab = screen.getByRole('button', { name: /logs/i })
        expect(logsTab.parentElement).toHaveTextContent('1')
      })
    })
  })

  describe('Environment Logging', () => {
    it('should log environment variables when button is clicked', async () => {
      render(<MCPDebugPanel />)
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      // Click environment log button
      const envButton = screen.getByText('📋 Log Environment')
      fireEvent.click(envButton)
      
      await waitFor(() => {
        expect(mockConsoleLog).toHaveBeenCalledWith(
          '[MCPDebug] Environment variables:',
          expect.objectContaining({
            VITE_MASTRA_API_HOST: undefined,
            VITE_WEATHER_AGENT_ID: 'weather',
            MODE: 'test'
          })
        )
      })
    })
  })

  describe('Polling Intervals', () => {
    it('should set up polling intervals on mount', async () => {
      vi.useFakeTimers()
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ version: '1.0.0' })
      })
      
      render(<MCPDebugPanel />)
      
      // Fast-forward time to trigger intervals
      vi.advanceTimersByTime(30000) // 30 seconds for connection test
      vi.advanceTimersByTime(60000) // 60 seconds for MCP discovery
      
      await waitFor(async () => {
        expect(mockFetch).toHaveBeenCalledTimes(2) // Initial + 30s interval
        const { mastra } = await import('../../lib/mastraClient')
        expect(mastra.getDynamicToolsets).toHaveBeenCalledTimes(2) // Initial + 60s interval
      })
      
      vi.useRealTimers()
    })

    it('should cleanup intervals on unmount', async () => {
      vi.useFakeTimers()
      
      const { unmount } = render(<MCPDebugPanel />)
      
      // Unmount component
      unmount()
      
      // Fast-forward time
      vi.advanceTimersByTime(30000)
      
      // Should not make additional calls after unmount
      expect(mockFetch).toHaveBeenCalledTimes(1) // Only initial call
      
      vi.useRealTimers()
    })
  })

  describe('Development Mode Check', () => {
    it('should only intercept logs in development mode', async () => {
      vi.stubGlobal('process', { env: { NODE_ENV: 'production' } })
      
      render(<MCPDebugPanel />)
      
      // Generate logs
      console.log('Test log message')
      
      // Expand panel and switch to logs tab
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      const logsTab = screen.getByRole('button', { name: /logs/i })
      fireEvent.click(logsTab)
      
      await waitFor(() => {
        expect(screen.getByText('No logs yet')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON in health response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON') }
      })

      render(<MCPDebugPanel />)
      
      // Expand panel
      const button = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        expect(screen.getByText('connected')).toBeInTheDocument()
        expect(screen.getByText('unknown')).toBeInTheDocument() // Version should be unknown
      })
    })

    it('should handle tool call detection errors gracefully', async () => {
      render(<MCPDebugPanel />)
      
      // This should not throw an error
      expect(() => {
        console.log('[askWeatherAgent] Test call')
      }).not.toThrow()
    })
  })
})
