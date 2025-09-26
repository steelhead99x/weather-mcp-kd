import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import WeatherChat from '../WeatherChat'

vi.mock('../../lib/mastraClient', () => {
  const mockStreamVNextSuccess = vi.fn(() => ({
    processDataStream: async ({ onChunk }: { onChunk: (chunk: any) => void }) => {
      onChunk({ type: 'text', content: 'Sunny with mild coastal fog.' })
    },
  }))

  const mockStreamVNext404 = vi.fn(() => {
    throw new Error('Not Found (404)')
  })

  const mockGetAgent = vi.fn(() => ({
    streamVNext: mockStreamVNextSuccess,
  }))

  return {
    mastra: { getAgent: mockGetAgent },
    getWeatherAgentId: () => 'weather',
    __mocks: {
      mockStreamVNextSuccess,
      mockStreamVNext404,
      mockGetAgent,
    }
  }
})

describe('WeatherChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams a successful assistant response using streamVNext and shows no error', async () => {
    const { mastra } = await import('../../lib/mastraClient')
    const agent = mastra.getAgent('weather')
    
    render(<WeatherChat />)

    // Type a zipcode, then click Ask
    const input = screen.getByPlaceholderText(/enter your zipcode here/i)
    fireEvent.change(input, { target: { value: '94102' } })
    const askButton = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(askButton)

    // Expect streamed text to appear
    await waitFor(() => {
      expect(screen.getByText(/sunny with mild coastal fog\./i)).toBeInTheDocument()
    })

    // No error message should be present
    const errorText = screen.queryByText(/something went wrong|failed to contact agent|404/i)
    expect(errorText).toBeNull()
  })

  it('handles an error from streamVNext and shows an error message', async () => {
    const { mastra } = await import('../../lib/mastraClient')
    const agent = mastra.getAgent('weather')
    agent.streamVNext.mockImplementation(() => {
      throw new Error('Not Found (404)')
    })

    render(<WeatherChat />)

    const input = screen.getByPlaceholderText(/enter your zipcode here/i)
    fireEvent.change(input, { target: { value: '94102' } })
    const askButton = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(askButton)

    await waitFor(() => {
      expect(screen.getByText(/404/i)).toBeInTheDocument()
    })
  })
})
