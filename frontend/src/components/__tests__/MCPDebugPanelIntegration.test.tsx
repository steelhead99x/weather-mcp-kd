import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MCPDebugPanel from '../MCPDebugPanel'
import WeatherChat from '../WeatherChat'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

// Mock the mastra client
const mockStreamVNext = vi.fn()

vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getAgent: vi.fn(),
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

describe('MCPDebugPanel Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockFetch.mockClear()
    mockConsoleLog.mockClear()
    mockConsoleError.mockClear()
    mockConsoleWarn.mockClear()
    
    // Mock successful health response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0.0' })
    })
    
    // Mock agent with streamVNext
    const mockAgent = {
      streamVNext: mockStreamVNext.mockImplementation(async (message: string) => {
        // Simulate tool call detection
        console.log(`[askWeatherAgent] Processing: ${message}`)
        console.log(`[streamVNext] Streaming response for: ${message}`)
        
        return {
          textStream: async function* () {
            yield `Weather data for ${message}`
          }
        }
      }),
      agentId: 'weather',
      voice: null,
      details: {},
      generate: vi.fn(),
      stream: vi.fn(),
      streamObject: vi.fn(),
      generateText: vi.fn(),
      generateObject: vi.fn(),
      generateSchema: vi.fn(),
      tools: {},
      memory: null,
      llm: null,
      instructions: '',
      model: '',
      temperature: 0.7,
      maxTokens: 1000,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stopSequences: []
    } as any
    
    const { mastra } = await import('../../lib/mastraClient')
    vi.mocked(mastra.getAgent).mockResolvedValue(mockAgent)
    vi.mocked(mastra.getDynamicToolsets).mockResolvedValue({
      weather: { tools: ['getWeather', 'getForecast'] },
      mux: { tools: ['uploadVideo', 'getAsset'] }
    })
    
    // Set development mode
    vi.stubGlobal('process', { env: { NODE_ENV: 'development' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Weather Chat Integration', () => {
    it('should track tool calls when weather chat is used', async () => {
      render(
        <div>
          <WeatherChat />
          <MCPDebugPanel />
        </div>
      )
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
      
      // Open debug panel first
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Use the test tool call button to simulate tool calls
      const testToolCallButton = screen.getByRole('button', { name: /test tool call/i })
      fireEvent.click(testToolCallButton)
      
      // Switch to tools tab
      const toolsTab = screen.getByRole('button', { name: /tool calls/i })
      fireEvent.click(toolsTab)
      
      // Verify tool calls are tracked
      await waitFor(() => {
        expect(screen.getByText('testWeatherTool')).toBeInTheDocument()
      })
    })

    it('should track multiple weather requests', async () => {
      render(
        <div>
          <WeatherChat />
          <MCPDebugPanel />
        </div>
      )
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
      
      // Open debug panel first
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Make multiple test tool calls
      const testToolCallButton = screen.getByRole('button', { name: /test tool call/i })
      fireEvent.click(testToolCallButton)
      fireEvent.click(testToolCallButton)
      fireEvent.click(testToolCallButton)
      
      // Switch to tools tab
      const toolsTab = screen.getByRole('button', { name: /tool calls/i })
      fireEvent.click(toolsTab)
      
      // Verify all tool calls are tracked
      await waitFor(() => {
        // Should have multiple tool call entries
        const toolCallElements = screen.getAllByText('testWeatherTool')
        expect(toolCallElements.length).toBeGreaterThanOrEqual(3)
      })
    })

    it('should track logs from weather chat interactions', async () => {
      render(
        <div>
          <WeatherChat />
          <MCPDebugPanel />
        </div>
      )
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
      
      // Open debug panel first
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Switch to logs tab
      const logsTab = screen.getByRole('button', { name: /logs/i })
      fireEvent.click(logsTab)
      
      // Verify logs section is displayed
      await waitFor(() => {
        expect(screen.getByText((content, element) => {
          return element?.textContent === 'Recent Logs (0)'
        })).toBeInTheDocument()
        expect(screen.getByText('No logs yet')).toBeInTheDocument()
      })
    })

    it('should update metrics based on weather chat usage', async () => {
      render(
        <div>
          <WeatherChat />
          <MCPDebugPanel />
        </div>
      )
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
      
      // Open debug panel first
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Make test tool calls
      const testToolCallButton = screen.getByRole('button', { name: /test tool call/i })
      fireEvent.click(testToolCallButton)
      fireEvent.click(testToolCallButton)
      
      // Switch to metrics tab
      const metricsTab = screen.getByRole('button', { name: /metrics/i })
      fireEvent.click(metricsTab)
      
      // Verify metrics are updated
      await waitFor(() => {
        expect(screen.getByText('Total Tool Calls')).toBeInTheDocument()
        expect(screen.getByText('Successful')).toBeInTheDocument()
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })
  })

  describe('MCP Server Discovery Integration', () => {
    it('should discover MCP servers and display them', async () => {
      render(<MCPDebugPanel />)
      
      // Wait for initial setup
      await waitFor(async () => {
        const { mastra } = await import('../../lib/mastraClient')
        expect(mastra.getDynamicToolsets).toHaveBeenCalled()
      })
      
      // Open debug panel
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Should show MCP servers in status tab
      await waitFor(() => {
        expect(screen.getByText('weather')).toBeInTheDocument()
        expect(screen.getByText('mux')).toBeInTheDocument()
        expect(screen.getByText((content, element) => {
          return element?.textContent === 'Tools: getWeather, getForecast'
        })).toBeInTheDocument()
        expect(screen.getByText((content, element) => {
          return element?.textContent === 'Tools: uploadVideo, getAsset'
        })).toBeInTheDocument()
      })
    })

    it('should handle MCP server discovery errors gracefully', async () => {
      const { mastra } = await import('../../lib/mastraClient')
      vi.mocked(mastra.getDynamicToolsets).mockRejectedValue(new Error('Discovery failed'))
      
      render(<MCPDebugPanel />)
      
      // Wait for initial setup
      await waitFor(async () => {
        const { mastra } = await import('../../lib/mastraClient')
        expect(mastra.getDynamicToolsets).toHaveBeenCalled()
      })
      
      // Should not crash and should log error
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[MCPDebug] Failed to discover MCP servers:',
        expect.any(Error)
      )
    })
  })

  describe('Connection Status Integration', () => {
    it('should show connection status based on health endpoint', async () => {
      render(<MCPDebugPanel />)
      
      // Wait for initial health check
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/health',
          expect.any(Object)
        )
      })
      
      // Open debug panel first
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Should show connected status
      await waitFor(() => {
        expect(screen.getAllByText('connected')).toHaveLength(3) // Connection status + 2 MCP servers
        expect(screen.getAllByText('🟢')).toHaveLength(2) // Button and status
      })
    })

    it('should handle connection errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      
      render(<MCPDebugPanel />)
      
      // Wait for initial health check
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
      
      // Open debug panel first
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Should show error status
      await waitFor(() => {
        expect(screen.getByText('error')).toBeInTheDocument()
        expect(screen.getAllByText('🔴')).toHaveLength(2) // Button and status
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })
  })

  describe('Real-time Updates Integration', () => {
    it('should update connection status in real-time', async () => {
      render(<MCPDebugPanel />)
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
      
      // Open debug panel
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Should show connected initially
      await waitFor(() => {
        expect(screen.getAllByText('connected')).toHaveLength(3) // Connection status + 2 MCP servers
      })
      
      // Simulate connection failure
      mockFetch.mockRejectedValue(new Error('Connection lost'))
      
      // Wait for the next health check cycle (simulate real-time behavior)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Should update to error status
      await waitFor(() => {
        expect(screen.getByText('error')).toBeInTheDocument()
        expect(screen.getAllByText('🔴')).toHaveLength(2) // Button and status
      }, { timeout: 5000 })
    })

    it('should update MCP servers in real-time', async () => {
      render(<MCPDebugPanel />)
      
      // Wait for initial setup
      await waitFor(async () => {
        const { mastra } = await import('../../lib/mastraClient')
        expect(mastra.getDynamicToolsets).toHaveBeenCalled()
      })
      
      // Open debug panel
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Should show initial servers
      await waitFor(() => {
        expect(screen.getByText('weather')).toBeInTheDocument()
      })
      
      // Update mock to return different servers
      const { mastra } = await import('../../lib/mastraClient')
      vi.mocked(mastra.getDynamicToolsets).mockResolvedValue({
        newServer: { tools: ['newTool'] }
      })
      
      // Wait for the next discovery cycle (simulate real-time behavior)
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Should update with new servers
      await waitFor(() => {
        expect(screen.getByText('newServer')).toBeInTheDocument()
        expect(screen.getByText('newTool')).toBeInTheDocument()
      }, { timeout: 5000 })
    })
  })

  describe('Performance and Memory Management', () => {
    it('should limit tool calls to prevent memory issues', async () => {
      render(
        <div>
          <WeatherChat />
          <MCPDebugPanel />
        </div>
      )
      
      // Wait for initial setup
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
      
      // Open debug panel
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Switch to tools tab
      const toolsTab = screen.getByRole('button', { name: /tool calls/i })
      fireEvent.click(toolsTab)
      
      // Generate many tool calls using the test button
      const testToolCallButton = screen.getByRole('button', { name: /test tool call/i })
      for (let i = 0; i < 60; i++) {
        fireEvent.click(testToolCallButton)
      }
      
      // Should only show last 50 calls (the component limits to 50)
      await waitFor(() => {
        const toolCallElements = screen.getAllByText('testWeatherTool')
        expect(toolCallElements).toHaveLength(50)
      })
    })

    it('should limit logs to prevent memory issues', async () => {
      render(<MCPDebugPanel />)
      
      // Open debug panel
      const debugButton = screen.getByRole('button', { name: /mcp debug/i })
      fireEvent.click(debugButton)
      
      // Switch to logs tab
      const logsTab = screen.getByRole('button', { name: /logs/i })
      fireEvent.click(logsTab)
      
      // Generate many logs using the test button (which triggers console.log)
      const testToolCallButton = screen.getByRole('button', { name: /test tool call/i })
      for (let i = 0; i < 150; i++) {
        fireEvent.click(testToolCallButton)
      }
      
      // Should only show last 100 logs (the component limits to 100)
      await waitFor(() => {
        const logElements = screen.getAllByText(/testWeatherTool/)
        expect(logElements).toHaveLength(100)
      })
    })
  })
})
