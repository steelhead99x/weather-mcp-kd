import { Mastra } from '@mastra/core';
import { weatherAgent } from './agents/weather-agent.js';

const mastra = new Mastra({
  agents: { weatherAgent },
});

export default mastra;