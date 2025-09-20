import dotenv from 'dotenv';
import { runWeatherAgent } from './agents/weather-agent.js';

dotenv.config();

async function main() {
    // Run the advanced weather agent experience
    await runWeatherAgent();
}

main().catch((error) => {
    console.error("❌ Application failed:", error);
    process.exit(1);
});