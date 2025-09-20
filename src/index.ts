import dotenv from 'dotenv';
import { runWeatherAgent } from './agents/weather-agent';

dotenv.config();

async function main() {
  // Run the advanced weather agent experience
  await runWeatherAgent();
}

main();
