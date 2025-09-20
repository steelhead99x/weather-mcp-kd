import dotenv from 'dotenv';
import { weatherAgent } from "../agents/weather-agent.js";

dotenv.config();

async function main() {
    console.log("🧪 Testing Weather Agent...\n");

    try {
        const res = await weatherAgent.generate([
            { role: "user", content: "Hello! Let's test the weather agent. My zipcode is 94102" },
        ]);

        console.log("✅ Agent response:");
        console.log(res.text);

        if (res.toolCalls && res.toolCalls.length > 0) {
            console.log("\n🔧 Tool calls made:", res.toolCalls.length);
        }
    } catch (error) {
        console.error("❌ Weather agent test failed:", error instanceof Error ? error.message : String(error));
        throw error;
    }
}

main().catch((e) => {
    console.error("❌ Test execution failed:", e);
    process.exit(1);
});