import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  const mockGetAgent = vi.fn(() => ({
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

  it('renders the weather chat component correctly', () => {
    render(<WeatherChat />)

    // Check that the component renders with the expected elements
    expect(screen.getByText(/farmer-friendly, solar-powered weather insights/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your 5-digit zip code/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
    expect(screen.getByText(/connected to agent:/i)).toBeInTheDocument()
  })

  it('handles input changes correctly', () => {
    render(<WeatherChat />)

    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '94102' } })

    expect(input).toHaveValue('94102')
  })

  it('shows validation error for invalid ZIP code', () => {
    render(<WeatherChat />)

    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '123' } })

    expect(screen.getByText(/please enter a valid 5-digit zip code/i)).toBeInTheDocument()
  })

  it('disables send button for invalid ZIP code', () => {
    render(<WeatherChat />)

    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    const button = screen.getByRole('button', { name: /send message/i })
    
    fireEvent.change(input, { target: { value: '123' } })

    expect(button).toBeDisabled()
  })

  it('enables send button for valid ZIP code', () => {
    render(<WeatherChat />)

    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    const button = screen.getByRole('button', { name: /send message/i })
    
    fireEvent.change(input, { target: { value: '94102' } })

    expect(button).not.toBeDisabled()
  })

  it('shows loading state when streaming', () => {
    const mockUseStreamVNext = vi.mocked(require('../../hooks/useStreamVNext').useStreamVNext)
    mockUseStreamVNext.mockReturnValue({
      state: {
        isLoading: true,
        error: null,
        isStreaming: true,
        metrics: null,
        retryCount: 0
      },
      streamVNext: vi.fn(),
      reset: vi.fn(),
      retry: vi.fn()
    })

    render(<WeatherChat />)

    expect(screen.getByText(/sending.../i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
  })

  it('shows error state with retry button', () => {
    const mockUseStreamVNext = vi.mocked(require('../../hooks/useStreamVNext').useStreamVNext)
    mockUseStreamVNext.mockReturnValue({
      state: {
        isLoading: false,
        error: 'Network error',
        isStreaming: false,
        metrics: null,
        retryCount: 1
      },
      streamVNext: vi.fn(),
      reset: vi.fn(),
      retry: vi.fn()
    })

    render(<WeatherChat />)

    expect(screen.getByText(/network error/i)).toBeInTheDocument()
    expect(screen.getByText(/retry \(1\/3\)/i)).toBeInTheDocument()
  })
})
