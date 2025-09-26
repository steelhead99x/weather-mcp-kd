import { describe, it, expect } from 'vitest'

// Test the message format handling logic directly
function handleMessageFormats(reqBody: any) {
  let messages
  if (Array.isArray(reqBody?.messages)) {
    // Standard messages array format
    messages = reqBody.messages
  } else if (typeof reqBody?.messages === 'string') {
    // MastraClient sends message as string in messages field
    messages = [{ role: 'user', content: reqBody.messages }]
  } else if (reqBody?.message) {
    // Fallback to message field
    messages = [{ role: 'user', content: String(reqBody.message) }]
  } else {
    // Default fallback
    messages = [{ role: 'user', content: 'hello' }]
  }
  return messages
}

describe('Message Format Handling', () => {
  it('should handle standard messages array format', () => {
    const reqBody = {
      messages: [{ role: 'user', content: '96062' }]
    }
    
    const messages = handleMessageFormats(reqBody)
    
    expect(messages).toEqual([{ role: 'user', content: '96062' }])
    expect(messages[0].content).toBe('96062')
  })

  it('should handle MastraClient string messages format', () => {
    const reqBody = {
      messages: '85001'  // This is the problematic format we fixed
    }
    
    const messages = handleMessageFormats(reqBody)
    
    expect(messages).toEqual([{ role: 'user', content: '85001' }])
    expect(messages[0].content).toBe('85001')
  })

  it('should handle fallback message field', () => {
    const reqBody = {
      message: '90210'
    }
    
    const messages = handleMessageFormats(reqBody)
    
    expect(messages).toEqual([{ role: 'user', content: '90210' }])
    expect(messages[0].content).toBe('90210')
  })

  it('should handle empty request with default', () => {
    const reqBody = {}
    
    const messages = handleMessageFormats(reqBody)
    
    expect(messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(messages[0].content).toBe('hello')
  })

  it('should handle ZIP codes specifically', () => {
    const zipCodes = ['96062', '85001', '90210', '10001', '33101']
    
    for (const zip of zipCodes) {
      const reqBody = {
        messages: zip  // Test the fixed MastraClient format
      }
      
      const messages = handleMessageFormats(reqBody)
      
      expect(messages).toEqual([{ role: 'user', content: zip }])
      expect(messages[0].content).toBe(zip)
    }
  })

  it('should handle null and undefined values gracefully', () => {
    const testCases = [
      { messages: null },
      { messages: undefined },
      { message: null },
      { message: undefined },
      null,
      undefined
    ]
    
    for (const reqBody of testCases) {
      const messages = handleMessageFormats(reqBody)
      expect(messages).toEqual([{ role: 'user', content: 'hello' }])
    }
  })

  it('should convert non-string message values to strings', () => {
    const testCases = [
      { message: 12345 },
      { message: true },
      { message: { zip: '90210' } }
    ]
    
    for (const reqBody of testCases) {
      const messages = handleMessageFormats(reqBody)
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(typeof messages[0].content).toBe('string')
    }
  })
})
