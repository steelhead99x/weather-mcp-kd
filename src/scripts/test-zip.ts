import dotenv from 'dotenv';
import { getWeatherByZipTool } from "../tools/weather.js";

dotenv.config();

async function test() {
    console.log("🧪 Testing ZIP code weather tool...\n");

    // Check if the tool and its execute method exist
    if (!getWeatherByZipTool?.execute) {
        throw new Error("Weather tool is not properly initialized or execute method is missing");
    }

    try {
        const result = await (getWeatherByZipTool as any).execute({
            context: { zipCode: "94102" },
        });

        console.log("✅ Weather data retrieved successfully!");
        console.log("Location:", result.location?.displayName || "Unknown");
        console.log("Current conditions:", result.forecast?.[0]?.shortForecast || "Unknown");
        console.log("Temperature:", result.forecast?.[0]?.temperature || "Unknown");
        console.log("\nFull response:");
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("❌ Test failed:", error instanceof Error ? error.message : String(error));
        throw error;
    }
}

test().catch(console.error);