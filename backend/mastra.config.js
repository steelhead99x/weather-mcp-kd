/** @type {import('mastra').MastraConfig} */
export default {
  srcDir: './src',
  outDir: './dist',
  entry: './src/index.ts',
  agents: {
    weatherAgent: './src/agents/weather-agent.ts'
  },
  tools: {
    weatherTool: './src/tools/weather.ts'
  },
  mcpServers: {
    weatherServer: './src/mcp/weather-server.ts'
  }
};
