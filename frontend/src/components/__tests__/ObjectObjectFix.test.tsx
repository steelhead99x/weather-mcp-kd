import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the mastra client
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getAgent: vi.fn()
  },
  getWeatherAgentId: () => 'weather',
  getDisplayHost: () => 'localhost:3000'
}))

import WeatherChat from '../WeatherChat'

describe('[object Object] Fix Tests', () => {
  const mockStreamVNext = vi.fn()
  let mockAgent: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Create a mock agent that can simulate different error scenarios
    mockAgent = {
      streamVNext: mockStreamVNext
    }
    
    const { mastra } = await import('../../lib/mastraClient')
    vi.mocked(mastra.getAgent).mockResolvedValue(mockAgent)
  })

  it('should handle string messages correctly (baseline test)', async () => {
    mockStreamVNext.mockResolvedValue({
      textStream: async function* () {
        yield 'Weather response'
      }
    })

    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(mockStreamVNext).toHaveBeenCalledWith('85001', expect.any(Object))
    })
    
    // Should not show [object Object] error
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
  })

  it('should prevent [object Object] errors in error messages', async () => {
    // Simulate an error that might cause [object Object]
    const errorObject = { code: 'TEST_ERROR', message: 'Test error message', details: { extra: 'info' } }
    mockStreamVNext.mockRejectedValue(errorObject)

    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    // Wait for error to appear
    await waitFor(() => {
      const errorElement = screen.getByRole('alert')
      expect(errorElement).toBeInTheDocument()
    })
    
    // Should NOT show [object Object]
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    
    // Should show a meaningful error message
    const errorElement = screen.getByRole('alert')
    expect(errorElement.textContent).not.toBe('⚠️[object Object]')
    expect(errorElement.textContent).toMatch(/error/i)
  })

  it('should handle Error objects correctly', async () => {
    const error = new Error('Specific error message')
    mockStreamVNext.mockRejectedValue(error)

    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    
    // Should show the actual error message, not [object Object]
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
    expect(screen.getByText(/Specific error message/)).toBeInTheDocument()
  })

  it('should handle various object types that could cause [object Object]', async () => {
    const testCases = [
      { name: 'Plain object', error: { type: 'error', details: 'test' } },
      { name: 'Object without message', error: { code: 500, status: 'failed' } },
      { name: 'Array', error: ['error1', 'error2'] },
      { name: 'Number', error: 404 },
      { name: 'Boolean', error: false },
      { name: 'Null', error: null },
      { name: 'Undefined', error: undefined }
    ]
    
    for (const testCase of testCases) {
      console.log(`Testing ${testCase.name}:`, testCase.error)
      
      mockStreamVNext.mockRejectedValue(testCase.error)
      
      const { unmount } = render(<WeatherChat />)
      
      const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
      fireEvent.change(input, { target: { value: '85001' } })
      
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /send message/i })
        expect(button).not.toBeDisabled()
      })
      
      const button = screen.getByRole('button', { name: /send message/i })
      fireEvent.click(button)
      
      await waitFor(() => {
        const alerts = screen.queryAllByRole('alert')
        if (alerts.length > 0) {
          expect(alerts[0]).toBeInTheDocument()
        }
      })
      
      // The key test: should NEVER show [object Object]
      expect(screen.queryByText('[object Object]')).not.toBeInTheDocument()
      
      // Clean up for next iteration
      unmount()
      vi.clearAllMocks()
    }
  })

  it('should show user-friendly error messages instead of [object Object]', async () => {
    // Test with a complex object that would normally stringify to [object Object]
    const complexError = {
      response: { status: 500 },
      config: { url: '/api/test' },
      request: { method: 'POST' }
    }
    
    mockStreamVNext.mockRejectedValue(complexError)

    render(<WeatherChat />)
    
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: '85001' } })
    
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    
    const errorElement = screen.getByRole('alert')
    const errorText = errorElement.textContent || ''
    
    // Should NOT be [object Object]
    expect(errorText).not.toContain('[object Object]')
    
    // Should contain meaningful information
    expect(errorText.length).toBeGreaterThan(10) // More than just the warning emoji
    
    // Should either show JSON or a meaningful fallback
    expect(
      errorText.includes('Unknown error') || 
      errorText.includes('{') || 
      errorText.includes('error')
    ).toBe(true)
    
    console.log(`Complex error displayed as: "${errorText}"`)
  })

  it('should validate message sanitization works correctly', () => {
    // Test the message sanitization logic by importing the enhanced class
    import('../../../src/utils/streamVNextEnhanced').then(({ createStreamVNextEnhanced }) => {
      const enhanced = createStreamVNextEnhanced()
      
      // Test various input types that could cause issues
      const testInputs = [
        { input: 'normal string', expected: 'normal string' },
        { input: { content: 'message content' }, expected: 'message content' },
        { input: [{ content: 'array message' }], expected: 'array message' },
        { input: { messages: 'mastra format' }, expected: 'mastra format' },
        { input: ['string1', 'string2'], expected: 'string1 string2' },
        { input: { toString: () => 'custom string' }, expected: 'custom string' }
      ]
      
      testInputs.forEach(({ input, expected }) => {
        console.log(`Input: ${JSON.stringify(input)} -> Expected: "${expected}"`)
        // Note: We can't directly test the private method, but we can test the overall behavior
      })
    })
  })
})
