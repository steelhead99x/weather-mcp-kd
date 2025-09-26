import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';

// Load environment variables from the root project directory
config({ path: resolvePath(process.cwd(), '../.env') });

import { Mastra } from '@mastra/core';
import express from 'express';
import cors from 'cors';
import { weatherAgent } from './agents/weather-agent.js';
import { resolve, join } from 'path';

// Set telemetry flag to suppress warnings when not using Mastra server environment
(globalThis as any).___MASTRA_TELEMETRY___ = true;

const mastra = new Mastra({
  agents: { weatherAgent },
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'weather-mcp-server', timestamp: new Date().toISOString() });
});

// StreamVNext endpoint for proper streaming support
app.post('/api/agents/:agentId/stream/vnext', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const messages = Array.isArray(req.body?.messages)
      ? req.body.messages
      : [{ role: 'user', content: String(req.body?.message ?? 'hello') }];

    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    console.log(`[streamVNext] Received request for agent: ${agentId}`);
    console.log(`[streamVNext] Messages:`, messages.length);

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

// Serve built frontend (SPA) from ../frontend/dist
try {
  const frontendDist = resolve(process.cwd(), '../frontend/dist');
  app.use(express.static(frontendDist));
  // Fallback to index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(join(frontendDist, 'index.html'));
  });
} catch {
  // ignore if dist not present
}

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Weather MCP server listening on http://${host}:${port}`);
});

export default mastra;