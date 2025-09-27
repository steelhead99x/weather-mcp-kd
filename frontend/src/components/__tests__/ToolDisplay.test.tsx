import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import WeatherChat from '../WeatherChat'

// Mock the mastra client
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getAgent: vi.fn().mockResolvedValue({
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
      // Simulate the tool call flow with proper timing
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

      // Process chunks through the onChunk callback with proper async handling
      for (const chunk of chunks) {
        if (options.onChunk) {
          await act(async () => {
            options.onChunk(chunk)
          })
        }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      if (options.onComplete) {
        await act(async () => {
          options.onComplete()
        })
      }
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
  it('should render WeatherChat component', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })
    
    // Check that the component renders
    expect(screen.getByText(/farmer-friendly, solar-powered weather insights/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get forecast/i })).toBeInTheDocument()
  })

  it('should handle input changes correctly', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })
    
    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    expect(input).toHaveValue('85001')
  })

  it('should show validation error for invalid ZIP code', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })
    
    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    fireEvent.change(input, { target: { value: '123' } })
    
    expect(screen.getByText(/please enter a valid 5-digit zip code/i)).toBeInTheDocument()
  })

  it('should disable send button for invalid ZIP code', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })
    
    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    const button = screen.getByRole('button', { name: /get forecast/i })
    
    fireEvent.change(input, { target: { value: '123' } })
    
    expect(button).toBeDisabled()
  })

  it('should enable send button for valid ZIP code', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })
    
    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    const button = screen.getByRole('button', { name: /get forecast/i })
    
    fireEvent.change(input, { target: { value: '85001' } })
    
    // Wait for agent to load before checking button state
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })
})
