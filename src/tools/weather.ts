import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface WeatherPeriod {
    name: string;
    startTime: string;
    endTime: string;
    temperature: number;
    temperatureUnit: string;
    isDaytime: boolean;
    shortForecast: string;
    detailedForecast: string;
    windSpeed: string;
    windDirection: string;
    probabilityOfPrecipitation?: { value: number };
    relativeHumidity?: { value: number };
}

const USER_AGENT =
    process.env.WEATHER_MCP_USER_AGENT ||
    "WeatherMCP/0.1 (mail@streamingportfolio.com)";

export const getWeatherByZipTool = createTool({
    id: "get_weather_by_zip",
    description:
        "Get weather information for a specific ZIP code using the National Weather Service API",
    inputSchema: z.object({
        zipCode: z.string().describe("5-digit ZIP code for weather lookup"),
    }),
    execute: async ({ context }) => {
        const { zipCode } = context;

        if (!zipCode || !/^\d{5}$/.test(zipCode)) {
            throw new Error("Please provide a valid 5-digit ZIP code");
        }

            // Geocode ZIP -> lat/lon
            const geoResponse = await fetch(
                `https://api.zippopotam.us/us/${zipCode}`
            );
            if (!geoResponse.ok) {
                throw new Error(`Invalid ZIP code: ${zipCode}`);
            }

            const geoData = await geoResponse.json();
            const latitude = parseFloat(geoData.places[0].latitude);
            const longitude = parseFloat(geoData.places[0].longitude);
            const location = {
                displayName: `${geoData.places[0]["place name"]}, ${geoData.places[0]["state abbreviation"]}`,
                latitude,
                longitude,
            };

            // Weather.gov grid metadata
            const pointsResponse = await fetch(
                `https://api.weather.gov/points/${latitude},${longitude}`,
                {
                    headers: {
                        "User-Agent": USER_AGENT,
                    },
                }
            );

            if (!pointsResponse.ok) {
                throw new Error(
                    `Failed to get weather grid data: ${pointsResponse.statusText}`
                );
            }

            const pointsData = await pointsResponse.json();
            const forecastUrl = pointsData.properties.forecast;

            // Forecast
            const forecastResponse = await fetch(forecastUrl, {
                headers: {
                    "User-Agent": USER_AGENT,
                },
            });

            if (!forecastResponse.ok) {
                throw new Error(
                    `Failed to get weather forecast: ${forecastResponse.statusText}`
                );
            }

            const forecastData = await forecastResponse.json();
            const periods = forecastData.properties.periods;

            return {
                location,
                forecast: periods.map((period: any) => ({
                    name: period.name,
                    temperature: period.temperature,
                    temperatureUnit: period.temperatureUnit,
                    windSpeed: period.windSpeed,
                    windDirection: period.windDirection,
                    shortForecast: period.shortForecast,
                    detailedForecast: period.detailedForecast,
                    probabilityOfPrecipitation: period.probabilityOfPrecipitation?.value || null,
                    relativeHumidity: period.relativeHumidity?.value || null,
                })),
            };
    },
});

export const getWeatherByCoordinatesTool = createTool({
    id: "get_weather_by_coordinates",
    description:
        "Get weather forecast for specific latitude and longitude coordinates using the National Weather Service API.",
    inputSchema: z.object({
        latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees"),
        longitude: z
            .number()
            .min(-180)
            .max(180)
            .describe("Longitude in decimal degrees"),
    }),
    execute: async ({ context }) => {
        const { latitude, longitude } = context;

            const pointUrl = `https://api.weather.gov/points/${latitude.toFixed(
                4
            )},${longitude.toFixed(4)}`;

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
            const periods = forecastData?.properties?.periods as WeatherPeriod[];

            if (!periods?.length) {
                throw new Error("No forecast data available");
            }

            return {
                coordinates: { latitude, longitude },
                forecast: periods.map((period) => ({
                    name: period.name,
                    startTime: period.startTime,
                    endTime: period.endTime,
                    temperature: `${period.temperature}°${period.temperatureUnit}`,
                    isDaytime: period.isDaytime,
                    shortForecast: period.shortForecast,
                    detailedForecast: period.detailedForecast,
                    windSpeed: period.windSpeed,
                    windDirection: period.windDirection,
                    probabilityOfPrecipitation: period.probabilityOfPrecipitation?.value
                        ? `${period.probabilityOfPrecipitation.value}%`
                        : null,
                    relativeHumidity: period.relativeHumidity?.value
                        ? `${period.relativeHumidity.value}%`
                        : null,
                })),
                generatedAt: new Date().toISOString(),
            };
    },
});