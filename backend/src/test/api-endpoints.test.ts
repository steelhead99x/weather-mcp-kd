import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Mock the weather agent to avoid needing real API keys in tests
vi.mock('../agents/weather-agent.js', () => ({
  weatherAgent: {
    streamVNext: vi.fn().mockResolvedValue({
      textStream: (async function* () {
        yield 'Test weather response chunk 1 ';
        yield 'Test weather response chunk 2';
      })()
    })
  }
}));

// Create a test app with the API endpoints
const createTestApp = async () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  // Import after mocking
  const { weatherAgent } = await import('../agents/weather-agent');
  
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'weather-mcp-server', timestamp: new Date().toISOString() });
  });

  // StreamVNext endpoint
  app.post('/api/agents/:agentId/stream/vnext', async (req, res) => {
    try {
      const agentId = req.params.agentId;
      const messages = Array.isArray(req.body?.messages)
        ? req.body.messages
        : [{ role: 'user', content: String(req.body?.message ?? 'hello') }];

      // Set headers for streaming response
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      if (agentId !== 'weather') {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Call the mocked agent
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
  
  return app;
};

describe('API Endpoints', () => {
  let app: express.Application;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('CORS Configuration', () => {
    it('should handle CORS preflight for weather agent endpoint', async () => {
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

    it('should include CORS headers in actual responses', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .set('Origin', 'https://stage-ai.streamingportfolio.com')
        .send({ message: 'test' });

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('Weather Agent Endpoint', () => {
    it('should accept POST requests to weather agent', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({ message: 'What is the weather?' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('Test weather response');
    });

    it('should handle message array format', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({ 
          messages: [
            { role: 'user', content: 'What is the weather in NYC?' }
          ]
        })
        .expect(200);

      expect(response.text).toContain('Test weather response');
    });

    it('should return 404 for unknown agent', async () => {
      const response = await request(app)
        .post('/api/agents/unknown/stream/vnext')
        .send({ message: 'test' })
        .expect(404);
      
      expect(response.body.error).toBe('Agent not found');
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({})
        .expect(200);

      expect(response.text).toContain('Test weather response');
    });

    it('should require POST method', async () => {
      await request(app)
        .get('/api/agents/weather/stream/vnext')
        .expect(404);
    });

    it('should set proper streaming headers', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send({ message: 'test' })
        .expect(200);

      expect(response.headers['transfer-encoding']).toBe('chunked');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parsing errors', async () => {
      await request(app)
        .post('/api/agents/weather/stream/vnext')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    it('should handle missing Content-Type header', async () => {
      const response = await request(app)
        .post('/api/agents/weather/stream/vnext')
        .send('message=test')
        .expect(200);

      // Should still work with form data, treating as empty body
      expect(response.text).toContain('Test weather response');
    });
  });
});
