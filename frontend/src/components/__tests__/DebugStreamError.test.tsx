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

describe('Debug Stream Error Test', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('should debug where [object Object] comes from in stream errors', async () => {
    const mockStreamVNext = vi.fn()
    
    // Create a mock agent
    const mockAgent = {
      streamVNext: mockStreamVNext
    } as any
    
    const { mastra } = await import('../../lib/mastraClient')
    vi.mocked(mastra.getAgent).mockResolvedValue(mockAgent)
    
    // Test with an object error that doesn't have a message property
    const errorObject = { code: 'TEST_ERROR', details: 'some details', status: 500 }
    mockStreamVNext.mockRejectedValue(errorObject)
    
    render(<WeatherChat />)
    
    // Wait for agent to load
    await new Promise(resolve => setTimeout(resolve, 100))
    
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
      const errorElement = screen.queryByRole('alert')
      expect(errorElement).toBeInTheDocument()
    })
    
    const errorElement = screen.getByRole('alert')
    console.log('Error element content:', errorElement.textContent)
    console.log('Error object was:', JSON.stringify(errorObject))
    
    // Check what the actual error message is
    const errorText = errorElement.textContent || ''
    
    if (errorText.includes('[object Object]')) {
      console.log('❌ Still showing [object Object]')
      console.log('Full error text:', errorText)
    } else {
      console.log('✅ No [object Object] found')
      console.log('Error shows as:', errorText)
    }
    
    // This test is just for debugging - let's see what happens
  })

  it('should test different error object formats', async () => {
    const testCases = [
      { name: 'Object with message', error: { message: 'Clear error message', code: 500 } },
      { name: 'Object without message', error: { code: 'ERROR_CODE', details: 'Some details' } },
      { name: 'Plain object', error: { type: 'error', info: 'test' } },
      { name: 'Error instance', error: new Error('Regular error message') },
      { name: 'String error', error: 'Simple string error' },
      { name: 'Number error', error: 404 },
      { name: 'Null error', error: null },
    ]
    
    for (const testCase of testCases) {
      console.log(`\nTesting: ${testCase.name}`)
      console.log('Error object:', testCase.error)
      
      const mockStreamVNext = vi.fn()
      const mockAgent = { streamVNext: mockStreamVNext } as any
      
      const { mastra } = await import('../../lib/mastraClient')
      vi.mocked(mastra.getAgent).mockResolvedValue(mockAgent)
      
      mockStreamVNext.mockRejectedValue(testCase.error)
      
      const { unmount } = render(<WeatherChat />)
      
      // Wait for agent to load
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
      fireEvent.change(input, { target: { value: '85001' } })
      
      await waitFor(() => {
        const button = screen.getByRole('button', { name: /send message/i })
        expect(button).not.toBeDisabled()
      })
      
      const button = screen.getByRole('button', { name: /send message/i })
      fireEvent.click(button)
      
      // Wait for error to appear
      try {
        await waitFor(() => {
          const errorElement = screen.queryByRole('alert')
          expect(errorElement).toBeInTheDocument()
        }, { timeout: 1000 })
        
        const errorElement = screen.getByRole('alert')
        const errorText = errorElement.textContent || ''
        
        console.log(`Result: "${errorText}"`)
        
        if (errorText.includes('[object Object]')) {
          console.log('❌ Contains [object Object]')
        } else {
          console.log('✅ No [object Object] found')
        }
        
      } catch (e) {
        console.log('No error element found or timeout')
      }
      
      unmount()
      vi.clearAllMocks()
    }
  })
})
