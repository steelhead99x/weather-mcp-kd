import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MCPDebugPanel from '../MCPDebugPanel'
import WeatherChat from '../WeatherChat'

// Mock the mastra client
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    getAgent: vi.fn()
  },
  getWeatherAgentId: () => 'weather',
  getDisplayHost: () => 'localhost:3000',
  getMastraBaseUrl: () => 'http://localhost:3000'
}))

// Mock functions for tracking
const mockStreamVNext = vi.fn()

// Track MCP-specific data flow
const mcpTrace: Array<{
  component: string
  method: string
  input: any
  inputType: string
  serialized: string
}> = []

describe('MCP Input Flow Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mcpTrace.length = 0
    
    // Mock agent with detailed logging
    const mockAgent = {
      streamVNext: mockStreamVNext.mockImplementation(async (message: any, options: any) => {
        mcpTrace.push({
          component: 'MockAgent',
          method: 'streamVNext',
          input: message,
          inputType: typeof message,
          serialized: String(message)
        })
        
        console.log('🔍 [MCP DEBUG] streamVNext received:')
        console.log('  - Raw input:', message)
        console.log('  - Input type:', typeof message)
        console.log('  - Serialized:', String(message))
        console.log('  - Is [object Object]?', String(message) === '[object Object]')
        
        // Check for common object patterns that cause issues
        if (typeof message === 'object' && message !== null) {
          console.log('  - Object detected!')
          console.log('  - Keys:', Object.keys(message))
          console.log('  - Has content property?', 'content' in message)
          console.log('  - Has messages property?', 'messages' in message)
          console.log('  - JSON stringify:', JSON.stringify(message))
        }
        
        return {
          textStream: async function* () {
            yield `Response to: ${String(message)}`
          }
        }
      })
    }
    
    const fullMockAgent = {
      ...mockAgent,
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
    vi.mocked(mastra.getAgent).mockResolvedValue(fullMockAgent)
  })

  it('should trace input from WeatherChat to MCP streamVNext', async () => {
    render(<WeatherChat />)
    
    const testInput = '85001'
    
    // Step 1: User inputs ZIP code
    const input = screen.getByPlaceholderText(/enter your 5-digit zip code/i)
    fireEvent.change(input, { target: { value: testInput } })
    
    mcpTrace.push({
      component: 'WeatherChat',
      method: 'user input',
      input: testInput,
      inputType: typeof testInput,
      serialized: String(testInput)
    })
    
    // Step 2: Click send button
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /send message/i })
      expect(button).not.toBeDisabled()
    })
    
    const button = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(button)
    
    // Step 3: Wait for MCP call
    await waitFor(() => {
      expect(mockStreamVNext).toHaveBeenCalled()
    }, { timeout: 5000 })
    
    // Step 4: Analyze the trace
    console.log('\n📊 MCP Input Flow Trace:')
    mcpTrace.forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.component}.${entry.method}:`)
      console.log(`   - Input: ${entry.input}`)
      console.log(`   - Type: ${entry.inputType}`)
      console.log(`   - Serialized: "${entry.serialized}"`)
      console.log(`   - Is object string: ${entry.serialized === '[object Object]'}`)
    })
    
    // Assertions
    const finalTrace = mcpTrace[mcpTrace.length - 1]
    expect(finalTrace.component).toBe('MockAgent')
    expect(finalTrace.method).toBe('streamVNext')
    expect(finalTrace.inputType).toBe('string')
    expect(finalTrace.serialized).toBe(testInput)
    expect(finalTrace.serialized).not.toBe('[object Object]')
  })

  it('should test MCP debug panel input handling', async () => {
    render(<MCPDebugPanel />)
    
    // Look for debug inputs if they exist
    const debugInputs = screen.queryAllByRole('textbox')
    const debugButtons = screen.queryAllByRole('button')
    
    console.log('🔍 [MCP DEBUG PANEL] Found elements:')
    console.log(`  - Text inputs: ${debugInputs.length}`)
    console.log(`  - Buttons: ${debugButtons.length}`)
    
    // If there are debug controls, test them
    if (debugInputs.length > 0) {
      const testInput = 'debug test message'
      fireEvent.change(debugInputs[0], { target: { value: testInput } })
      
      mcpTrace.push({
        component: 'MCPDebugPanel',
        method: 'debug input',
        input: testInput,
        inputType: typeof testInput,
        serialized: String(testInput)
      })
    }
    
    // Test any debug buttons
    debugButtons.forEach((button, index) => {
      const buttonText = button.textContent || button.getAttribute('aria-label') || `Button ${index}`
      console.log(`  - Button ${index}: "${buttonText}"`)
    })
  })

  it('should identify common causes of [object Object] in MCP calls', async () => {
    // Test various input formats that might cause issues
    const problematicCases = [
      // Case 1: Message as object with content property
      { 
        name: 'Object with content property',
        input: { content: '85001', messages: undefined, toString: undefined } as { content: string; messages?: undefined; toString?: undefined },
        shouldFail: true 
      },
      
      // Case 2: Messages array format
      { 
        name: 'Messages array format',
        input: [{ role: 'user', content: '85001' }] as { role: string; content: string }[],
        shouldFail: true 
      },
      
      // Case 3: MastraClient message format
      { 
        name: 'Mastra message format',
        input: { messages: '85001', content: undefined, toString: undefined } as { messages: string; content?: undefined; toString?: undefined },
        shouldFail: true 
      },
      
      // Case 4: Correct string format
      { 
        name: 'Plain string',
        input: '85001',
        shouldFail: false 
      },
      
      // Case 5: Options object passed as message
      {
        name: 'Options object as message',
        input: { toString: () => '[object Object]', content: undefined, messages: undefined } as { toString: () => string; content?: undefined; messages?: undefined },
        shouldFail: true
      }
    ]
    
    console.log('\n🧪 Testing problematic input cases:')
    
    for (const testCase of problematicCases) {
      console.log(`\nTesting: ${testCase.name}`)
      console.log(`  Input:`, testCase.input)
      console.log(`  Type: ${typeof testCase.input}`)
      
      // Safe string conversion
      let serialized: string
      try {
        serialized = String(testCase.input)
        console.log(`  Serialized: "${serialized}"`)
      } catch (error) {
        serialized = '[object Object]'
        console.log(`  Serialized: Error - ${error}`)
      }
      
      const isObjectString = serialized === '[object Object]'
      console.log(`  Becomes [object Object]: ${isObjectString}`)
      
      if (testCase.shouldFail && isObjectString) {
        console.log('  ✅ Expected failure - this would cause the bug')
      } else if (!testCase.shouldFail && !isObjectString) {
        console.log('  ✅ Expected success - this works correctly')
      } else {
        console.log('  ❌ Unexpected result!')
      }
      
      // Test actual call
      try {
        mcpTrace.push({
          component: 'TestCase',
          method: testCase.name,
          input: testCase.input,
          inputType: typeof testCase.input,
          serialized: serialized
        })
        
        // Simulate the problematic call
        await mockStreamVNext(testCase.input, {})
        
      } catch (error) {
        console.log(`  Error: ${error}`)
      }
    }
  })

  it('should provide fix recommendations for [object Object] issues', () => {
    console.log('\n🔧 Fix Recommendations for [object Object] Issues:')
    
    console.log('\n1. Input Validation:')
    console.log('   - Always ensure message parameter is a string')
    console.log('   - Add typeof checks before streamVNext calls')
    console.log('   - Convert objects to strings explicitly')
    
    console.log('\n2. Message Format Handling:')
    console.log('   - If input is object with .content, use input.content')
    console.log('   - If input is array, use input[0].content or JSON.stringify')
    console.log('   - If input is string, use as-is')
    
    console.log('\n3. Debug Logging:')
    console.log('   - Log message type and content before streamVNext')
    console.log('   - Add serialization preview in development')
    console.log('   - Track message transformation through the flow')
    
    // Example fix function
    const fixMessageFormat = (input: any): string => {
      if (typeof input === 'string') {
        return input
      }
      
      if (typeof input === 'object' && input !== null) {
        // Handle common object formats
        if ('content' in input) {
          return String(input.content)
        }
        if ('messages' in input) {
          return String(input.messages)
        }
        if (Array.isArray(input) && input.length > 0 && 'content' in input[0]) {
          return String(input[0].content)
        }
        
        // Fallback to JSON
        return JSON.stringify(input)
      }
      
      // Fallback to string conversion
      return String(input)
    }
    
    // Test the fix function
    const testInputs: any[] = [
      '85001',
      { content: '85001' },
      { messages: '85001' },
      [{ role: 'user', content: '85001' }],
      { toString: () => '85001' }
    ]
    
    console.log('\n4. Testing Fix Function:')
    testInputs.forEach((input, index) => {
      const fixed = fixMessageFormat(input)
      console.log(`   Input ${index + 1}: ${JSON.stringify(input)} -> "${fixed}"`)
    })
  })
})
