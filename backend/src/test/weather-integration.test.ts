import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import cors from 'cors'
import { weatherAgent } from '../agents/weather-agent.js'

// Create test app with the actual weather agent
function createIntegrationTestApp() {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // Copy the exact endpoint from our main server
  app.post('/api/agents/:agentId/stream/vnext', async (req, res) => {
    try {
      const agentId = req.params.agentId
      
      // Handle different message formats from the frontend
      let messages
      if (Array.isArray(req.body?.messages)) {
        // Standard messages array format
        messages = req.body.messages
      } else if (typeof req.body?.messages === 'string') {
        // MastraClient sends message as string in messages field
        messages = [{ role: 'user', content: req.body.messages }]
      } else if (req.body?.message) {
        // Fallback to message field
        messages = [{ role: 'user', content: String(req.body.message) }]
      } else {
        // Default fallback
        messages = [{ role: 'user', content: 'hello' }]
      }

      console.log(`[TEST] Processing messages:`, messages)

      // Call the actual weather agent
      const stream = await weatherAgent.streamVNext(messages)

      if (stream.textStream) {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        })

        let fullResponse = ''
        for await (const chunk of stream.textStream) {
          if (chunk && typeof chunk === 'string') {
            fullResponse += chunk
            res.write(chunk)
          }
        }
        
        console.log(`[TEST] Full response:`, fullResponse.substring(0, 200) + '...')
        res.end()
      } else if (stream.fullStream) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        })

        let fullResponse = ''
        for await (const chunk of stream.fullStream) {
          if (chunk && chunk.type === 'text' && chunk.content) {
            fullResponse += chunk.content
            res.write(chunk.content)
          }
        }
        
        console.log(`[TEST] Full stream response:`, fullResponse.substring(0, 200) + '...')
        res.end()
      } else {
        const text = stream.text || 'Stream completed'
        res.json({
          streamed: true,
          text,
          method: 'streamVNext',
          chunks: 1
        })
      }

    } catch (error) {
      console.error('[TEST] Error:', error)
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
        streamed: false
      })
    }
  })

  return app
}

describe('Weather Agent Integration Tests', () => {
  let app: express.Application

  beforeAll(() => {
    app = createIntegrationTestApp()
  })

  it('should respond to ZIP code with weather information', async () => {
    const response = await request(app)
      .post('/api/agents/weather/stream/vnext')
      .send({
        messages: '96062'  // ZIP code in MastraClient format
      })
      .timeout(30000)  // Allow 30 seconds for API calls
      .expect(200)

    console.log('Response text length:', response.text.length)
    console.log('Response preview:', response.text.substring(0, 300))

    // Verify the response contains weather-related information
    expect(response.text.length).toBeGreaterThan(50)
    
    // Should contain farming/agricultural context
    const lowerText = response.text.toLowerCase()
    const hasWeatherTerms = lowerText.includes('weather') || 
                           lowerText.includes('temperature') || 
                           lowerText.includes('forecast') ||
                           lowerText.includes('rain') ||
                           lowerText.includes('wind') ||
                           lowerText.includes('sunny') ||
                           lowerText.includes('cloudy')
    
    expect(hasWeatherTerms).toBe(true)
    
    // Should contain agricultural context
    const hasAgriTerms = lowerText.includes('farm') || 
                        lowerText.includes('crop') || 
                        lowerText.includes('plant') ||
                        lowerText.includes('harvest') ||
                        lowerText.includes('irrigation') ||
                        lowerText.includes('livestock') ||
                        lowerText.includes('agriculture')
    
    expect(hasAgriTerms).toBe(true)
  }, 35000)  // 35 second timeout

  it('should handle Phoenix area ZIP code (85001)', async () => {
    const response = await request(app)
      .post('/api/agents/weather/stream/vnext')
      .send({
        messages: '85001'
      })
      .timeout(30000)
      .expect(200)

    expect(response.text.length).toBeGreaterThan(50)
    
    const lowerText = response.text.toLowerCase()
    expect(lowerText).toMatch(/weather|temperature|forecast|farm|agricult/)
  }, 35000)

  it('should handle different message formats for same ZIP', async () => {
    const zipCode = '90210'
    
    // Test different input formats
    const formats = [
      { messages: zipCode },                           // MastraClient format
      { message: zipCode },                            // Fallback format  
      { messages: [{ role: 'user', content: zipCode }] } // Standard format
    ]

    for (const format of formats) {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send(format)
        .timeout(30000)
        .expect(200)

      expect(response.text.length).toBeGreaterThan(50)
      
      const lowerText = response.text.toLowerCase()
      expect(lowerText).toMatch(/weather|temperature|forecast/)
    }
  }, 45000)

  it('should provide first response immediately for valid ZIP', async () => {
    const startTime = Date.now()
    
    const response = await request(app)
      .post('/api/agents/weather/stream/vnext')
      .send({
        messages: '33101'  // Miami ZIP
      })
      .timeout(30000)
      .expect(200)

    const endTime = Date.now()
    const responseTime = endTime - startTime

    // Should respond within reasonable time (30 seconds max)
    expect(responseTime).toBeLessThan(30000)
    
    // Should have substantial content
    expect(response.text.length).toBeGreaterThan(100)
    
    // Should be weather-focused
    const lowerText = response.text.toLowerCase()
    expect(lowerText).toMatch(/weather|forecast|temperature|condition/)
    
    console.log(`Response time: ${responseTime}ms`)
    console.log(`Response length: ${response.text.length} characters`)
  }, 35000)
})
