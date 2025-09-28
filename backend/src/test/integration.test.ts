import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { weatherTool } from '../tools/weather.js';

// Mock external dependencies
vi.mock('../agents/weather-agent.js', () => ({
  weatherAgent: {
    streamVNext: vi.fn().mockImplementation(async (messages) => {
      // Simulate successful weather agent response
      return {
        textStream: (async function* () {
          yield `Weather data for your request: ${messages[0]?.content || 'test'}`;
          yield ' - Temperature: 72°F';
          yield ' - Conditions: Sunny';
          yield ' - Generated TTS and video successfully';
        })()
      };
    })
  }
}));

// Mock weather tool
global.fetch = vi.fn();

describe('Integration Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    // Create full app instance
    app = express();
    app.use(cors());
    app.use(express.json());
    
    const { weatherAgent } = await import('../agents/weather-agent.js');
    
    app.get('/health', (_req, res) => {
      res.json({ ok: true, service: 'weather-mcp-server', timestamp: new Date().toISOString() });
    });

    app.post('/api/agents/:agentId/stream/vnext', async (req, res) => {
      try {
        const agentId = req.params.agentId;
        const messages = Array.isArray(req.body?.messages)
          ? req.body.messages
          : [{ role: 'user', content: String(req.body?.message ?? 'hello') }];

        if (agentId !== 'weather') {
          return res.status(404).json({ error: 'Agent not found' });
        }

        const stream = await weatherAgent.streamVNext(messages);

        if (stream.textStream) {
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          for await (const chunk of stream.textStream) {
            if (chunk && typeof chunk === 'string') {
              res.write(chunk);
            }
          }
          res.end();
        } else {
          res.json({ text: 'No stream available', streamed: false });
        }
      } catch (error) {
        console.error('[streamVNext] Error:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : String(error),
          streamed: false
        });
      }
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Full Weather Request Flow', () => {
    it('should handle complete weather request from frontend perspective', async () => {
      // Simulate the exact request that would come from the frontend
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .set('Origin', 'https://stage-ai.streamingportfolio.com')
        .set('Content-Type', 'application/json')
        .send({
          messages: [
            { role: 'user', content: 'What is the weather like in San Francisco, CA?' }
          ]
        })
        .expect(200);

      // Verify streaming response
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['transfer-encoding']).toBe('chunked');
      expect(response.headers['access-control-allow-origin']).toBe('*');
      
      // Verify response content
      expect(response.text).toContain('Weather data for your request');
      expect(response.text).toContain('Temperature: 72°F');
      expect(response.text).toContain('Conditions: Sunny');
    });

    it('should handle OPTIONS preflight correctly', async () => {
      const response = await request(app)
        .options('/api/agents/weather/stream/vnext')
        .set('Origin', 'https://stage-ai.streamingportfolio.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('content-type');
    });

    it('should maintain session across multiple requests', async () => {
      // First request
      const response1 = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({ message: 'Hello' })
        .expect(200);

      expect(response1.text).toContain('Weather data for your request: Hello');

      // Second request - should work independently
      const response2 = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({ message: 'Weather in NYC?' })
        .expect(200);

      expect(response2.text).toContain('Weather data for your request: Weather in NYC?');
    });

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post('/api/agents/weather/stream/vnext')
          .send({ message: `Request ${i + 1}` })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.text).toContain(`Weather data for your request: Request ${index + 1}`);
      });
    });
  });

  describe('Weather Tool Integration', () => {
    it('should validate weather tool configuration', () => {
      expect(weatherTool).toBeDefined();
      expect(weatherTool.description).toBeTruthy();
      expect(weatherTool.inputSchema).toBeDefined();
      expect(weatherTool.handler).toBeTypeOf('function');
    });

    it('should handle weather tool with mocked data', async () => {
      // Mock successful weather API response
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            properties: {
              relativeLocation: {
                properties: { city: 'San Francisco', state: 'CA' }
              },
              forecast: 'https://api.weather.gov/forecast/123'
            }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            properties: {
              periods: [{
                name: 'Today',
                temperature: 72,
                temperatureUnit: 'F',
                windSpeed: '5 mph',
                windDirection: 'W',
                shortForecast: 'Sunny',
                detailedForecast: 'Sunny and pleasant'
              }]
            }
          })
        });

      const result = await weatherTool.handler({ zipCode: '94105' });
      
      expect(result).toBeDefined();
      expect(result.location.displayName).toBe('San Francisco, CA');
      expect(result.forecast).toHaveLength(1);
      expect(result.forecast[0].temperature).toBe(72);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle malformed JSON gracefully', async () => {
      await request(app)
        .post('/api/agents/weather/stream/vnext')
        .set('Content-Type', 'application/json')
        .send('{"malformed": json}')
        .expect(400);
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send()
        .expect(200);

      expect(response.text).toContain('Weather data for your request: hello');
    });

    it('should handle very large request body', async () => {
      const largeMessage = 'x'.repeat(10000);
      
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({ message: largeMessage })
        .expect(200);

      expect(response.text).toContain('Weather data for your request');
    });
  });

  describe('Security and Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({ message: 'test' })
        .expect(200);

      // CORS headers should be present
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should handle various origins in CORS', async () => {
      const origins = [
        'https://stage-ai.streamingportfolio.com',
        'https://weather-mcp-kd.streamingportfolio.com',
        'http://localhost:5173'
      ];

      for (const origin of origins) {
        const response = await request(app)
          .post('/api/agents/weather/stream/vnext')
          .set('Origin', origin)
          .send({ message: 'test' })
          .expect(200);

        expect(response.headers['access-control-allow-origin']).toBe('*');
      }
    });
  });
});
