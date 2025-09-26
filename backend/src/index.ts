import { Mastra } from 'mastra';
import { weatherAgent } from './agents/weather-agent';
import { weatherTool } from './tools/weather';
import { weatherServer } from './mcp/weather-server';
import { muxUploadClient } from './mcp/mux-upload-client';
import { muxAssetsClient } from './mcp/mux-assets-client';

const mastra = new Mastra({
  agents: [weatherAgent],
  tools: [weatherTool],
  mcpServers: [weatherServer, muxUploadClient, muxAssetsClient],
});

export default mastra;