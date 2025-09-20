import { getWeatherByZipTool } from "../tools/weather";

async function test() {
    // Check if the tool and its execute method exist
    if (!getWeatherByZipTool?.execute) {
        throw new Error("Weather tool is not properly initialized or execute method is missing");
    }

    const result = await (getWeatherByZipTool as any).execute({
        context: { zipCode: "94102" },
    });
    console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);