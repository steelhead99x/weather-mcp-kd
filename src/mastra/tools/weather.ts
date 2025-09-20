import { createTool } from "@mastra/core";
import { z } from "zod";

const USER_AGENT = process.env.WEATHER_MCP_USER_AGENT || "WeatherMCP/0.1 (mail@streamingportfolio.com)";

function parseCoordinates(latInput: unknown, lonInput: unknown) {
    const latitude = Number.parseFloat(String(latInput));
    const longitude = Number.parseFloat(String(lonInput));

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw new Error("Invalid latitude: must be between -90 and 90");
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error("Invalid longitude: must be between -180 and 180");
    }

    return { latitude, longitude };
}

export const getWeatherByZipTool = createTool({
    id: "get_weather_by_zip",
    description: "Get weather information for a specific ZIP code using the National Weather Service API",
    inputSchema: z.object({
        zipCode: z.string().describe("5-digit ZIP code for weather lookup"),
    }),
    execute: async ({ context }) => {
        const { zipCode } = context;

        if (!zipCode || !/^\d{5}$/.test(zipCode)) {
            throw new Error("Please provide a valid 5-digit ZIP code");
        }

        try {
            // Get location from ZIP code
            const geoResponse = await fetch(`https://api.zippopotam.us/us/${zipCode}`);
            if (!geoResponse.ok) {
                throw new Error(`Invalid ZIP code: ${zipCode}`);
            }

            const geoData = await geoResponse.json();
            const places = Array.isArray(geoData?.places) ? geoData.places : [];
            if (places.length === 0) {
                throw new Error("Location data not available for this ZIP code");
            }

            const firstPlace = places[0];
            const { latitude, longitude } = parseCoordinates(
                firstPlace?.latitude,
                firstPlace?.longitude
            );

            const displayName = `${firstPlace?.["place name"] ?? "Unknown"}, ${firstPlace?.["state abbreviation"] ?? ""}`.trim();

            // Get weather grid info
            const pointsResponse = await fetch(
                `https://api.weather.gov/points/${latitude},${longitude}`,
                { headers: { "User-Agent": USER_AGENT } }
            );

            if (!pointsResponse.ok) {
                throw new Error(`Failed to get weather grid data: ${pointsResponse.statusText}`);
            }

            const pointsData = await pointsResponse.json();
            const forecastUrl = pointsData.properties.forecast;

            // Get forecast
            const forecastResponse = await fetch(forecastUrl, {
                headers: { "User-Agent": USER_AGENT },
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
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Weather lookup failed: ${message}`);
        }
    },
});

export const getWeatherByCoordinatesTool = createTool({
    id: "get_weather_by_coordinates",
    description: "Get weather forecast for specific latitude and longitude coordinates using the National Weather Service API",
    inputSchema: z.object({
        latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees"),
        longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees"),
    }),
    execute: async ({ context }) => {
        const { latitude, longitude } = context;

        try {
            const { latitude: latNum, longitude: lonNum } = parseCoordinates(latitude, longitude);

            const pointUrl = `https://api.weather.gov/points/${latNum.toFixed(4)},${lonNum.toFixed(4)}`;

            const pointResponse = await fetch(pointUrl, {
                headers: { "User-Agent": USER_AGENT },
            });

            if (!pointResponse.ok) {
                throw new Error(`Weather.gov point request failed: ${pointResponse.status}`);
            }

            const pointData = await pointResponse.json();
            const forecastUrl = pointData?.properties?.forecast;

            if (!forecastUrl) {
                throw new Error("Forecast URL not available for this location");
            }

            const forecastResponse = await fetch(forecastUrl, {
                headers: { "User-Agent": USER_AGENT },
            });

            if (!forecastResponse.ok) {
                throw new Error(`Forecast request failed: ${forecastResponse.status}`);
            }

            const forecastData = await forecastResponse.json();
            const periods = forecastData?.properties?.periods;

            if (!periods?.length) {
                throw new Error("No forecast data available");
            }

            return {
                coordinates: { latitude: latNum, longitude: lonNum },
                forecast: periods.slice(0, 5).map((period: any) => ({
                    name: period.name,
                    startTime: period.startTime,
                    temperature: `${period.temperature}°${period.temperatureUnit}`,
                    isDaytime: period.isDaytime,
                    shortForecast: period.shortForecast,
                    detailedForecast: period.detailedForecast,
                    windSpeed: period.windSpeed,
                    windDirection: period.windDirection,
                })),
                generatedAt: new Date().toISOString(),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Coordinates weather lookup failed: ${message}`);
        }
    },
});