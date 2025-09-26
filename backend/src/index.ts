import { Mastra } from '@mastra/core';
import { weatherAgent } from './agents/weather-agent';

const mastra = new Mastra({
  agents: { weatherAgent },
});

export default mastra;