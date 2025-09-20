import { Mastra } from '@mastra/core';
import { weatherAgent } from './dist/mastra/agents/weather-agent.js';
import { getWeatherByZipTool, getWeatherByCoordinatesTool } from './dist/mastra/tools/weather.js';

// Export telemetry configuration as a named export so Mastra instrumentation can find it
export const telemetry = {
  serviceName: 'weather-agent-kd',
  enabled: false,
  sampling: { type: 'always_off' },
};

// Assign tools to agent
weatherAgent.tools = {
  getWeatherByZipTool,
  getWeatherByCoordinatesTool,
};

// Create and export Mastra instance as default
const mastra = new Mastra({
  agents: {
    weatherAgent,
  },
});

export default mastra;
