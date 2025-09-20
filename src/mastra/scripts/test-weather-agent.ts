import dotenv from 'dotenv';
import { weatherAgent } from '../agents/weather-agent.js';

dotenv.config();

async function main() {
    console.log("🧪 Testing Weather Agent...\n");

    try {
        console.log("Testing with ZIP code 94102...");

        const res = await weatherAgent.generate("Hello! Let's test the weather agent. My zipcode is 94102");

        console.log("✅ Agent response:");
        console.log(res.text || res);

        console.log("\n✅ Test completed successfully!");

    } catch (error) {
        console.error("❌ Weather agent test failed:", error instanceof Error ? error.message : String(error));
        throw error;
    }
}

main().catch((e) => {
    console.error("❌ Test execution failed:", e);
    process.exit(1);
});