import { render, screen } from '@testing-library/react'
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

describe('Simple [object Object] Test', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Create a proper mock agent
    const mockAgent = {
      streamVNext: vi.fn().mockResolvedValue({
        textStream: async function* () {
          yield 'Test response'
        }
      }),
      agentId: 'test-agent',
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
  })

  it('should render without [object Object] errors', async () => {
    render(<WeatherChat />)
    
    // Wait a moment for the component to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check if [object Object] appears anywhere in the document
    const objectObjectElements = screen.queryAllByText('[object Object]')
    
    if (objectObjectElements.length > 0) {
      console.log('Found [object Object] elements:', objectObjectElements.length)
      objectObjectElements.forEach((element, index) => {
        console.log(`Element ${index + 1}:`, element.textContent)
        console.log('Parent:', element.parentElement?.innerHTML)
      })
    }
    
    expect(objectObjectElements).toHaveLength(0)
  })

  it('should test what happens with agent loading errors', async () => {
    // Mock agent loading to fail with an object error
    const { mastra } = await import('../../lib/mastraClient')
    const errorObject = { code: 'AGENT_LOAD_ERROR', details: 'Failed to connect' }
    vi.mocked(mastra.getAgent).mockRejectedValue(errorObject)
    
    render(<WeatherChat />)
    
    // Wait for agent loading to complete/fail
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check if [object Object] appears
    const objectObjectElements = screen.queryAllByText('[object Object]')
    
    if (objectObjectElements.length > 0) {
      console.log('Agent loading error caused [object Object]')
      const errorElement = screen.getByRole('alert')
      console.log('Error element content:', errorElement.textContent)
    }
    
    // This should NOT show [object Object] - it should show a meaningful error
    expect(objectObjectElements).toHaveLength(0)
  })

  it('should test what the actual error message looks like', async () => {
    // Mock agent loading to fail
    const { mastra } = await import('../../lib/mastraClient')
    const errorObject = { message: 'Connection failed', code: 500 }
    vi.mocked(mastra.getAgent).mockRejectedValue(errorObject)
    
    render(<WeatherChat />)
    
    // Wait for agent loading to complete/fail
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Find the error alert
    const errorAlert = screen.queryByRole('alert')
    if (errorAlert) {
      console.log('Error alert found:', errorAlert.textContent)
      
      // The error should contain meaningful text, not [object Object]
      expect(errorAlert.textContent).not.toContain('[object Object]')
      expect(errorAlert.textContent).toContain('Failed to load weather agent')
    }
  })
})
