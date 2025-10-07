import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables - try multiple locations
// 1. First try root .env (when running from backend/)
const rootEnvPath = resolvePath(process.cwd(), '../.env');
// 2. Try current directory .env (when running from root)
const localEnvPath = resolvePath(process.cwd(), '.env');
// 3. Try backend/.env as fallback
const backendEnvPath = resolvePath(process.cwd(), 'backend/.env');

if (existsSync(rootEnvPath)) {
  console.log('[env] Loading from:', rootEnvPath);
  config({ path: rootEnvPath });
} else if (existsSync(localEnvPath)) {
  console.log('[env] Loading from:', localEnvPath);
  config({ path: localEnvPath });
} else if (existsSync(backendEnvPath)) {
  console.log('[env] Loading from:', backendEnvPath);
  config({ path: backendEnvPath });
} else {
  console.warn('[env] No .env file found. Relying on system environment variables.');
  config(); // Load from default location
}

import { Mastra } from '@mastra/core';
import express from 'express';
import cors from 'cors';
import { weatherAgent } from './agents/weather-agent.js';
import { resolve, join } from 'path';

// Set telemetry flag to suppress warnings when not using Mastra server environment
(globalThis as any).___MASTRA_TELEMETRY___ = true;

const mastra = new Mastra({
  agents: { 
    // Register with ID 'weather' to match API routes and frontend
    weather: weatherAgent 
  },
});

const app = express();

// Configure CORS explicitly for dev and prod
const corsOrigins = process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:3001,https://stage-ai.streamingportfolio.com,https://ai.streamingportfolio.com,https://stage-farmagent-vc2i4.ondigitalocean.app';
const allowedOrigins = new Set(corsOrigins.split(',').map(origin => origin.trim()));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow same-origin/non-browser tools
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // Enable credentials for production domains
}));

// Handle preflight quickly (Express 5 compat with path-to-regexp v6)
app.options(/.*/, cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'weather-mcp-server', timestamp: new Date().toISOString() });
});

// Standard Mastra agent endpoints
app.get('/api/agents', (_req, res) => {
  res.json([{ id: 'weather', name: 'weather' }]);
});

app.get('/api/agents/:agentId', (req, res) => {
  const agentId = req.params.agentId;
  if (agentId === 'weather') {
    res.json({ id: 'weather', name: 'weather' });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Standard agent execution endpoint (non-streaming)
app.post('/api/agents/:agentId/invoke', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    if (agentId !== 'weather') {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Handle different message formats
    let messages;
    if (Array.isArray(req.body?.messages)) {
      messages = req.body.messages;
    } else if (typeof req.body?.messages === 'string') {
      messages = [{ role: 'user', content: req.body.messages }];
    } else if (req.body?.message) {
      messages = [{ role: 'user', content: String(req.body.message) }];
    } else {
      messages = [{ role: 'user', content: 'hello' }];
    }

    console.log(`[invoke] Received request for agent: ${agentId}`);
    console.log(`[invoke] Messages:`, messages);

    const result = await weatherAgent.text(messages);
    res.json({ text: result.text });
    
  } catch (error) {
    console.error('[invoke] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Agent streamVNext endpoint (for MastraClient compatibility)
app.post('/api/agents/:agentId/streamVNext', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    if (agentId !== 'weather') {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Handle different message formats
    let messages;
    if (Array.isArray(req.body?.messages)) {
      messages = req.body.messages;
    } else if (typeof req.body?.messages === 'string') {
      messages = [{ role: 'user', content: req.body.messages }];
    } else if (req.body?.message) {
      messages = [{ role: 'user', content: String(req.body.message) }];
    } else {
      messages = [{ role: 'user', content: 'hello' }];
    }

    console.log(`[streamVNext] Received request for agent: ${agentId}`);
    console.log(`[streamVNext] Messages:`, messages);

    // For MastraClient compatibility, we need to handle this differently
    // MastraClient expects a streaming response, not a JSON object with streams
    
    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await weatherAgent.streamVNext(messages);
    
    // Stream the response back to the client
    if (stream.textStream) {
      for await (const chunk of stream.textStream) {
        if (chunk && typeof chunk === 'string') {
          res.write(chunk);
        }
      }
      res.end();
    } else if (stream.text) {
      res.write(stream.text);
      res.end();
    } else {
      res.write('No content available');
      res.end();
    }
    
  } catch (error) {
    console.error('[streamVNext] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// StreamVNext endpoint for proper streaming support
app.post('/api/agents/:agentId/stream/vnext', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    // Handle different message formats from the frontend
    let messages;
    if (Array.isArray(req.body?.messages)) {
      // Standard messages array format
      messages = req.body.messages;
    } else if (typeof req.body?.messages === 'string') {
      // MastraClient sends message as string in messages field
      messages = [{ role: 'user', content: req.body.messages }];
    } else if (req.body?.message) {
      // Fallback to message field
      messages = [{ role: 'user', content: String(req.body.message) }];
    } else {
      // Default fallback
      messages = [{ role: 'user', content: 'hello' }];
    }

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    console.log(`[streamVNext] Received request for agent: ${agentId}`);
    console.log(`[streamVNext] Raw body:`, JSON.stringify(req.body, null, 2));
    console.log(`[streamVNext] Processed messages:`, messages);

    // Call the agent with proper streaming
    const stream = await weatherAgent.streamVNext(messages);

    // Handle the streaming response properly
    if (stream.textStream) {
      // This is a proper streaming response
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let chunkCount = 0;
      try {
        for await (const chunk of stream.textStream) {
          if (chunk && typeof chunk === 'string') {
            chunkCount++;
            res.write(chunk);
          }
        }
        console.log(`[streamVNext] Stream completed with ${chunkCount} chunks`);
      } catch (streamError) {
        console.error('[streamVNext] Stream error:', streamError);
      }

      res.end();
    } else if (stream.fullStream) {
      // Handle full stream chunks
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let chunkCount = 0;
      try {
        for await (const chunk of stream.fullStream) {
          if (chunk && chunk.type === 'text' && chunk.content) {
            chunkCount++;
            res.write(chunk.content);
          }
        }
        console.log(`[streamVNext] Full stream completed with ${chunkCount} chunks`);
      } catch (streamError) {
        console.error('[streamVNext] Full stream error:', streamError);
      }

      res.end();
    } else {
      // Fallback: return simple text response
      const text = stream.text || 'Stream completed';
      res.json({
        streamed: true,
        text,
        method: 'streamVNext',
        chunks: 1
      });
    }

  } catch (error) {
    console.error('[streamVNext] Error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      streamed: false
    });
  }
});

// Serve static files from files directory
try {
  const filesDir = resolve(process.cwd(), 'files');
  if (existsSync(filesDir)) {
    app.use('/files', express.static(filesDir));
    console.log('[static] Serving files from:', filesDir);
  } else {
    console.warn('[static] Files directory not found:', filesDir);
  }
} catch (e) {
  console.warn('[static] Failed to initialize file serving:', e instanceof Error ? e.message : String(e));
}

// Serve built frontend (SPA) from ../frontend/dist if it exists
try {
  // Try multiple possible locations for frontend dist
  const possiblePaths = [
    resolve(process.cwd(), '../frontend/dist'),  // Local development
    resolve(process.cwd(), './frontend/dist'),   // Docker container (backend/frontend/dist)
    resolve(process.cwd(), '../frontend/dist'),  // Alternative path
  ];
  
  let frontendDist = null;
  let indexHtml = null;
  
  for (const path of possiblePaths) {
    const indexPath = join(path, 'index.html');
    if (existsSync(path) && existsSync(indexPath)) {
      frontendDist = path;
      indexHtml = indexPath;
      console.log('[static] Found frontend dist at:', path);
      break;
    }
  }
  
  if (frontendDist && indexHtml) {
    app.use(express.static(frontendDist));
    console.log('[static] Serving frontend from:', frontendDist);
    
    // Fallback to index.html for non-API routes
    app.get(/^(?!\/api).*/, (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(indexHtml);
    });
  } else {
    console.warn('[static] Frontend dist not found in any expected location');
    console.warn('[static] Searched paths:', possiblePaths);
  }
} catch (e) {
  console.warn('[static] Failed to initialize static frontend middleware:', e instanceof Error ? e.message : String(e));
}

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

// Add error handling middleware
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message || 'Unknown error',
    timestamp: new Date().toISOString()
  });
});

// Add 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.listen(port, host, () => {
  console.log(`Weather MCP server listening on http://${host}:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Working directory: ${process.cwd()}`);
});

export default mastra;