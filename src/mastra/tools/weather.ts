import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const USER_AGENT = process.env.WEATHER_MCP_USER_AGENT || "WeatherMCP/0.1 (mail@streamingportfolio.com)";

export const weatherTool = createTool({
    id: "get-weather",
    description: "Get weather information for a specific ZIP code using the National Weather Service API",
    inputSchema: z.object({
        zipCode: z.string().describe("5-digit ZIP code for weather lookup"),
    }),
    outputSchema: z.object({
        location: z.object({
            displayName: z.string(),
            latitude: z.number(),
            longitude: z.number(),
        }),
        forecast: z.array(z.object({
            name: z.string(),
            temperature: z.number(),
            temperatureUnit: z.string(),
            windSpeed: z.string(),
            windDirection: z.string(),
            shortForecast: z.string(),
            detailedForecast: z.string(),
        })),
    }),
    execute: async (toolCtx, options) => {
        const { context } = toolCtx as any;
        const abortSignal = (options as any)?.signal;
        // In Mastra tools, parameters come in the context object
        const { zipCode } = context;

        console.log('Full context received:', context);
        console.log('Received zipCode:', zipCode, 'Type:', typeof zipCode);

        if (!zipCode || typeof zipCode !== 'string' || !/^\d{5}$/.test(zipCode)) {
            throw new Error(`Please provide a valid 5-digit ZIP code. Received: ${zipCode} (type: ${typeof zipCode})`);
        }

        // Get location from ZIP code using modern URL construction
        const geoUrl = new URL(`https://api.zippopotam.us/us/${zipCode}`);
        const geoResponse = await fetch(geoUrl.toString(), {
            signal: abortSignal
        });
        if (!geoResponse.ok) {
            throw new Error(`Invalid ZIP code: ${zipCode}`);
        }

        const geoData = await geoResponse.json();
        const places = Array.isArray(geoData?.places) ? geoData.places : [];
        if (places.length === 0) {
            throw new Error("Location data not available for this ZIP code");
        }

        const firstPlace = places[0];
        const latitude = Number.parseFloat(String(firstPlace?.latitude));
        const longitude = Number.parseFloat(String(firstPlace?.longitude));

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
            throw new Error("Invalid latitude");
        }
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new Error("Invalid longitude");
        }

        const displayName = `${firstPlace?.["place name"] ?? "Unknown"}, ${firstPlace?.["state abbreviation"] ?? ""}`.trim();

        // Get weather grid info using modern URL construction
        const pointsUrl = new URL(`https://api.weather.gov/points/${latitude},${longitude}`);
        const pointsResponse = await fetch(pointsUrl.toString(), {
            headers: { "User-Agent": USER_AGENT },
            signal: abortSignal
        });

        if (!pointsResponse.ok) {
            throw new Error(`Failed to get weather grid data: ${pointsResponse.statusText}`);
        }

        const pointsData = await pointsResponse.json();
        const forecastUrl = pointsData.properties.forecast;

        // Get forecast
        const forecastResponse = await fetch(forecastUrl, {
            headers: { "User-Agent": USER_AGENT },
            signal: abortSignal
        });

        if (!forecastResponse.ok) {
            throw new Error(`Failed to get weather forecast: ${forecastResponse.statusText}`);
        }

        const forecastData = await forecastResponse.json();
        const periods = forecastData.properties.periods;

        return {
            location: { displayName, latitude, longitude },
            forecast: periods.slice(0, 5).map((period: any) => ({
                name: period.name,
                temperature: period.temperature,
                temperatureUnit: period.temperatureUnit,
                windSpeed: period.windSpeed,
                windDirection: period.windDirection,
                shortForecast: period.shortForecast,
                detailedForecast: period.detailedForecast,
            })),
        };
    },
});