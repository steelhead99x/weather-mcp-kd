import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Shared coordinate parsing and validation to ensure consistency across tools
function parseAndValidateCoordinates(latInput: unknown, lonInput: unknown) {
    const latitude = Number.parseFloat(String(latInput));
    const longitude = Number.parseFloat(String(lonInput));

    if (!Number.isFinite(latitude)) {
        throw new Error("Invalid latitude: must be a finite number between -90 and 90");
    }
    if (!Number.isFinite(longitude)) {
        throw new Error("Invalid longitude: must be a finite number between -180 and 180");
    }
    if (latitude < -90 || latitude > 90) {
        throw new Error("Latitude out of range: expected -90 to 90");
    }
    if (longitude < -180 || longitude > 180) {
        throw new Error("Longitude out of range: expected -180 to 180");
    }

    return { latitude, longitude };
}

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
    inputSchema: z
        .object({
            zipCode: z.string().describe("5-digit ZIP code for weather lookup"),
        }) as unknown as any,
    execute: async ({ context }) => {
        const { zipCode } = (context || {}) as any;

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

        // Validate response structure before accessing places[0]
        const places = Array.isArray(geoData?.places) ? geoData.places : [];
        if (places.length === 0) {
            throw new Error("Location data not available for this ZIP code");
        }

        const firstPlace = places[0];
        const { latitude, longitude } = parseAndValidateCoordinates(firstPlace?.latitude, firstPlace?.longitude);

        const displayName = `${firstPlace?.["place name"] ?? "Unknown"}, ${firstPlace?.["state abbreviation"] ?? ""}`.trim();
        const location = {
            displayName,
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
    }) as unknown as any,
    execute: async ({ context, runtimeContext: _runtimeContext }) => {
        const { latitude, longitude } = (context || {}) as any;

        // Use shared parsing and validation for consistency
        const { latitude: latNum, longitude: lonNum } = parseAndValidateCoordinates(latitude, longitude);

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
        const periods = forecastData?.properties?.periods as WeatherPeriod[];

        if (!periods?.length) {
            throw new Error("No forecast data available");
        }

        return {
            coordinates: { latitude: latNum, longitude: lonNum },
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