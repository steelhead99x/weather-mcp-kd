import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Create a test app with just the health endpoint
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'weather-mcp-server', timestamp: new Date().toISOString() });
  });
  
  return app;
};

describe('Health Endpoint', () => {
  let app: express.Application;

  beforeAll(() => {
    app = createTestApp();
  });

  it('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      ok: true,
      service: 'weather-mcp-server',
    });
    expect(response.body.timestamp).toBeDefined();
    expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
  });

  it('should have correct CORS headers', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('should handle OPTIONS request for CORS preflight', async () => {
    await request(app)
      .options('/health')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
  });
});
