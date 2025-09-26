import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import WeatherChat from '../WeatherChat'

// Mock the mastra client
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getAgent: () => ({
      streamVNext: async (message: string, options: any) => {
        // Mock a successful response with tool calls
        return {
          textStream: async function* () {
            yield 'Looking up weather for your location...'
            yield ' The forecast shows sunny skies with temperatures around 75°F.'
          },
          fullStream: async function* () {
            // Simulate tool call chunks
            yield {
              type: 'tool_call',
              toolName: 'get_weather',
              toolArgs: { zip_code: message, units: 'imperial' },
              timestamp: Date.now()
            }
            
            yield {
              type: 'text',
              content: 'Looking up weather for your location...',
              timestamp: Date.now()
            }
            
            yield {
              type: 'tool_result',
              toolName: 'get_weather',
              toolResult: {
                location: 'Phoenix, AZ',
                temperature: 75,
                conditions: 'Sunny',
                humidity: 45,
                wind_speed: 8
              },
              timestamp: Date.now()
            }
            
            yield {
              type: 'text',
              content: ' The forecast shows sunny skies with temperatures around 75°F.',
              timestamp: Date.now()
            }
          }
        }
      }
    })
  },
  getWeatherAgentId: () => 'weather',
  getDisplayHost: () => 'localhost:3000'
}))

// Mock the streamVNext hook
vi.mock('../../hooks/useStreamVNext', () => ({
  useStreamVNext: (options: any) => {
    const mockState = {
      isLoading: false,
      error: null,
      isStreaming: false,
      metrics: null,
      retryCount: 0
    }

    const mockStreamVNext = async (agent: any, message: string) => {
      // Simulate the tool call flow
      const chunks = [
        {
          type: 'tool_call',
          toolName: 'get_weather',
          toolArgs: { zip_code: message, units: 'imperial' }
        },
        {
          type: 'text',
          content: 'Looking up weather for your location...'
        },
        {
          type: 'tool_result',
          toolName: 'get_weather',
          toolResult: {
            location: 'Phoenix, AZ',
            temperature: 75,
            conditions: 'Sunny',
            humidity: 45,
            wind_speed: 8
          }
        },
        {
          type: 'text',
          content: ' The forecast shows sunny skies.'
        }
      ]

      // Process chunks through the onChunk callback
      for (const chunk of chunks) {
        options.onChunk?.(chunk)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      
      options.onComplete?.()
    }

    return {
      state: mockState,
      streamVNext: mockStreamVNext,
      retry: vi.fn(),
      reset: vi.fn()
    }
  }
}))

describe('Tool Display Functionality', () => {
  it('should display tool calls in collapsed state by default', async () => {
    render(<WeatherChat />)
    
    // Enter a ZIP code
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    // Wait for the button to be enabled
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    // Wait for the tool call to appear
    await waitFor(() => {
      expect(screen.getByText(/used 1 tool/i)).toBeInTheDocument()
    }, { timeout: 5000 })
    
    // Tool details should not be visible initially (collapsed)
    expect(screen.queryByText(/get_weather/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Arguments:/i)).not.toBeInTheDocument()
  })

  it('should expand tool calls when clicked', async () => {
    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    // Wait for the button to be enabled
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    // Wait for tool call summary
    const toolSummary = await waitFor(() => 
      screen.getByText(/used 1 tool/i)
    , { timeout: 5000 })
    
    // Click to expand tools section
    fireEvent.click(toolSummary)
    
    // Should show tool name
    await waitFor(() => {
      expect(screen.getByText(/get_weather/i)).toBeInTheDocument()
    })
  })

  it('should show tool arguments and results when tool is expanded', async () => {
    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    // Wait for the button to be enabled
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    // Wait for tool call and expand it
    await waitFor(() => {
      const toolSummary = screen.getByText(/used 1 tool/i)
      fireEvent.click(toolSummary)
    }, { timeout: 5000 })
    
    // Wait for tool to appear and click it
    await waitFor(() => {
      const toolButton = screen.getByText(/get_weather/i)
      fireEvent.click(toolButton)
    })
    
    // Should show arguments and results
    await waitFor(() => {
      expect(screen.getByText(/Arguments:/i)).toBeInTheDocument()
      expect(screen.getByText(/Result:/i)).toBeInTheDocument()
    })
    
    // Should show the actual data
    expect(screen.getByText(/zip_code/i)).toBeInTheDocument()
    expect(screen.getAllByText(/85001/i)).toHaveLength(2) // User message + tool args
    expect(screen.getByText(/Phoenix, AZ/i)).toBeInTheDocument()
  })

  it('should properly format complex objects without [object Object] errors', async () => {
    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '90210' } })
    
    // Wait for the button to be enabled
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    // Expand tool calls
    await waitFor(() => {
      const toolSummary = screen.getByText(/used 1 tool/i)
      fireEvent.click(toolSummary)
    }, { timeout: 5000 })
    
    // Expand individual tool
    await waitFor(() => {
      const toolButton = screen.getByText(/get_weather/i)
      fireEvent.click(toolButton)
    })
    
    // Check that complex objects are properly formatted
    await waitFor(() => {
      // Check that the result section exists
      expect(screen.getByText(/Result:/i)).toBeInTheDocument()
      
      // Check that the temperature and conditions are properly formatted in the result JSON
      expect(screen.getByText(/temperature/i)).toBeInTheDocument()
      expect(screen.getByText(/conditions/i)).toBeInTheDocument()
      
      // Should not contain [object Object]
      const allText = document.body.textContent || ''
      expect(allText).not.toContain('[object Object]')
    })
  })

  it('should show status indicators for different tool states', async () => {
    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '33101' } })
    
    // Wait for the button to be enabled
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    // Expand tools
    await waitFor(() => {
      const toolSummary = screen.getByText(/used 1 tool/i)
      fireEvent.click(toolSummary)
    }, { timeout: 5000 })
    
    // Should show status indicator (checkmark for completed)
    await waitFor(() => {
      expect(screen.getByText('✅')).toBeInTheDocument()
    })
    
    // Should show result status
    expect(screen.getByText(/result/i)).toBeInTheDocument()
  })
})
