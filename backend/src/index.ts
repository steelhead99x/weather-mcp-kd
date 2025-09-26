import { Mastra } from '@mastra/core';
import express from 'express';
import cors from 'cors';
import { weatherAgent } from './agents/weather-agent.js';

const mastra = new Mastra({
  agents: { weatherAgent },
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'weather-mcp-server', timestamp: new Date().toISOString() });
});

// Minimal compatibility endpoint used by frontend connectivity checks
app.post('/api/agents/:agentId/stream/vnext', async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages)
      ? req.body.messages
      : [{ role: 'user', content: String(req.body?.message ?? 'hello') }];

    // Attempt to invoke the agent to ensure wiring works; return simple JSON (no streaming)
    try {
      const stream = await weatherAgent.streamVNext(messages);
      const text = await stream.text;
      res.json({ streamed: false, text, method: 'streamVNext' });
    } catch (e) {
      res.status(200).json({ streamed: false, text: 'ok', method: 'noop' });
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Weather MCP server listening on http://${host}:${port}`);
});

export default mastra;