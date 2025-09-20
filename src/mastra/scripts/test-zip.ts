import dotenv from "dotenv";
import { getWeatherByZipTool } from "../tools/weather.js";
import { pathToFileURL } from "url";

dotenv.config();

console.log("Testing weather lookup by ZIP code...");

async function main() {
    try {
        console.log("🧪 Testing Weather ZIP Tool...\n");
        
        const testZip = "94102"; // San Francisco ZIP code
        console.log(`Testing with ZIP code: ${testZip}`);
        
        // Check if execute method exists before calling
        if (!getWeatherByZipTool.execute) {
            console.error("❌ Tool execute method is not available");
            process.exit(1);
        }
        
        const result = await getWeatherByZipTool.execute({
            context: { zipCode: testZip }
        });
        
        console.log("✅ Weather data retrieved:");
        console.log(JSON.stringify(result, null, 2));
        
        console.log("\n✅ ZIP test completed successfully!");
        
    } catch (error) {
        console.error("❌ ZIP test failed:", error instanceof Error ? error.message : String(error));
        throw error;
    }
}

// Only run if this file is executed directly
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error("❌ Test execution failed:", error);
        process.exit(1);
    });
}