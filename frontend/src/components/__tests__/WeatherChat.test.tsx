import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'
import WeatherChat from '../WeatherChat'

vi.mock('../../lib/mastraClient', () => {
  const mockStreamVNextSuccess = vi.fn(async () => {
    // Create an async generator that yields text chunks
    const textStream = (async function* () {
      yield 'Sunny with mild coastal fog.'
    })()
    
    return {
      textStream,
    }
  })

  const mockStreamVNext404 = vi.fn(() => {
    throw new Error('Not Found (404)')
  })

  const mockGetAgent = vi.fn(async () => ({
    streamVNext: mockStreamVNextSuccess,
  }))

  return {
    mastra: { getAgent: mockGetAgent },
    getWeatherAgentId: () => 'weather',
    getDisplayHost: () => 'localhost:3001',
    __mocks: {
      mockStreamVNextSuccess,
      mockStreamVNext404,
      mockGetAgent,
    }
  }
})

// Mock the enhanced streamVNext hook
vi.mock('../../hooks/useStreamVNext', () => ({
  useStreamVNext: vi.fn(() => ({
    state: {
      isLoading: false,
      error: null,
      isStreaming: false,
      metrics: null,
      retryCount: 0
    },
    streamVNext: vi.fn(),
    reset: vi.fn(),
    retry: vi.fn()
  }))
}))

describe('WeatherChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the weather chat component correctly', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })

    // Check that the component renders with the expected elements
    expect(screen.getByText(/farmer-friendly, solar-powered weather insights/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get forecast/i })).toBeInTheDocument()
    expect(screen.getByText(/connected to agent:/i)).toBeInTheDocument()
  })

  it('handles input changes correctly', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })

    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    fireEvent.change(input, { target: { value: '94102' } })

    expect(input).toHaveValue('94102')
  })

  it('shows validation error for invalid ZIP code', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })

    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    fireEvent.change(input, { target: { value: '123' } })

    expect(screen.getByText(/please enter a valid 5-digit zip code/i)).toBeInTheDocument()
  })

  it('disables send button for invalid ZIP code', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })

    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    const button = screen.getByRole('button', { name: /get forecast/i })
    
    fireEvent.change(input, { target: { value: '123' } })

    expect(button).toBeDisabled()
  })

  it('enables send button for valid ZIP code', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })

    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    const button = screen.getByRole('button', { name: /get forecast/i })
    
    fireEvent.change(input, { target: { value: '94102' } })

    // Wait for agent to load before checking button state
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it('validates ZIP code format correctly', async () => {
    await act(async () => {
      render(<WeatherChat />)
    })

    const input = screen.getByPlaceholderText(/enter your zip code for detailed weather forecast/i)
    const button = screen.getByRole('button', { name: /get forecast/i })
    
    // Test invalid ZIP code
    fireEvent.change(input, { target: { value: '123' } })
    expect(button).toBeDisabled()
    expect(screen.getByText(/please enter a valid 5-digit zip code/i)).toBeInTheDocument()
    
    // Test valid ZIP code
    fireEvent.change(input, { target: { value: '94102' } })
    
    // Wait for agent to load before checking button state
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
    expect(screen.queryByText(/please enter a valid 5-digit zip code/i)).not.toBeInTheDocument()
  })
})
