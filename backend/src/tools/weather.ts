import { createTool } from "@mastra/core";
import { z } from "zod";

const USER_AGENT = process.env.WEATHER_MCP_USER_AGENT || "WeatherAgent/1.0 (weather-agent@streamingportfolio.com)";

export const weatherTool = createTool({
    id: "get-weather",
    description: "Get comprehensive weather information for a specific ZIP code using the National Weather Service API (api.weather.gov)",
    inputSchema: z.object({
        zipCode: z.string().describe("5-digit ZIP code for weather lookup"),
        includeHourly: z.boolean().optional().describe("Include hourly forecast (default: false)"),
        includeAlerts: z.boolean().optional().describe("Include active weather alerts (default: false)"),
    }),
    outputSchema: z.object({
        location: z.object({
            displayName: z.string(),
            latitude: z.number(),
            longitude: z.number(),
            timezone: z.string().optional(),
            forecastOffice: z.string().optional(),
        }),
        forecast: z.array(z.object({
            name: z.string(),
            temperature: z.number(),
            temperatureUnit: z.string(),
            windSpeed: z.string(),
            windDirection: z.string(),
            shortForecast: z.string(),
            detailedForecast: z.string(),
            startTime: z.string(),
            endTime: z.string(),
            probabilityOfPrecipitation: z.object({
                value: z.number().nullable(),
                unitCode: z.string(),
            }).optional(),
        })),
        hourlyForecast: z.array(z.object({
            time: z.string(),
            temperature: z.number(),
            temperatureUnit: z.string(),
            windSpeed: z.string(),
            windDirection: z.string(),
            shortForecast: z.string(),
            probabilityOfPrecipitation: z.object({
                value: z.number().nullable(),
                unitCode: z.string(),
            }).optional(),
        })).optional(),
        alerts: z.array(z.object({
            id: z.string(),
            event: z.string(),
            headline: z.string(),
            description: z.string(),
            severity: z.string(),
            urgency: z.string(),
            areas: z.array(z.string()),
            effective: z.string(),
            expires: z.string(),
        })).optional(),
    }),
    execute: async (toolCtx: any, options: any) => {
        const { context } = toolCtx as any;
        const abortSignal = (options as any)?.signal;
        // In Mastra tools, parameters come in the context object
        const { zipCode, includeHourly = false, includeAlerts = false } = context;

        console.debug('Full context received:', context);
        console.debug('Received zipCode:', zipCode, 'Type:', typeof zipCode);
        console.debug('Include hourly:', includeHourly, 'Include alerts:', includeAlerts);

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

        const geoData = await geoResponse.json() as any;
        const places = Array.isArray(geoData?.places) ? geoData.places : [];
        if (places.length === 0) {
            throw new Error("Location data not available for this ZIP code");
        }

        const firstPlace = places[0];
        const latitude = Number.parseFloat(String(firstPlace?.latitude));
        const longitude = Number.parseFloat(String(firstPlace?.longitude));

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
            throw new Error(`Invalid latitude: ${latitude}`);
        }
        if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new Error(`Invalid longitude: ${longitude}`);
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

        const pointsData = await pointsResponse.json() as any;
        const forecastUrl = pointsData?.properties?.forecast;
        const hourlyForecastUrl = pointsData?.properties?.forecastHourly;
        const timezone = pointsData?.properties?.timeZone;
        const forecastOffice = pointsData?.properties?.forecastOffice;

        if (!forecastUrl || typeof forecastUrl !== 'string') {
            throw new Error('Weather service did not provide a forecast URL for this location');
        }

        // Get 12-hour forecast periods
        const forecastResponse = await fetch(forecastUrl, {
            headers: { "User-Agent": USER_AGENT },
            signal: abortSignal
        });

        if (!forecastResponse.ok) {
            throw new Error(`Failed to get weather forecast: ${forecastResponse.statusText}`);
        }

        const forecastData = await forecastResponse.json() as any;
        const periods = forecastData.properties.periods;

        // Get hourly forecast if requested
        let hourlyForecast = undefined;
        if (includeHourly && hourlyForecastUrl) {
            try {
                const hourlyResponse = await fetch(hourlyForecastUrl, {
                    headers: { "User-Agent": USER_AGENT },
                    signal: abortSignal
                });

                if (hourlyResponse.ok) {
                    const hourlyData = await hourlyResponse.json() as any;
                    hourlyForecast = hourlyData.properties.periods.slice(0, 24).map((period: any) => ({
                        time: period.startTime,
                        temperature: period.temperature,
                        temperatureUnit: period.temperatureUnit,
                        windSpeed: period.windSpeed,
                        windDirection: period.windDirection,
                        shortForecast: period.shortForecast,
                        probabilityOfPrecipitation: period.probabilityOfPrecipitation,
                    }));
                }
            } catch (error) {
                console.warn('Failed to fetch hourly forecast:', error);
            }
        }

        // Get weather alerts if requested
        let alerts = undefined;
        if (includeAlerts) {
            try {
                // Get alerts for the state
                const state = firstPlace?.["state abbreviation"];
                if (state) {
                    const alertsUrl = `https://api.weather.gov/alerts/active?area=${state}`;
                    const alertsResponse = await fetch(alertsUrl, {
                        headers: { "User-Agent": USER_AGENT },
                        signal: abortSignal
                    });

                    if (alertsResponse.ok) {
                        const alertsData = await alertsResponse.json() as any;
                        alerts = alertsData.features?.map((alert: any) => ({
                            id: alert.properties.id,
                            event: alert.properties.event,
                            headline: alert.properties.headline,
                            description: alert.properties.description,
                            severity: alert.properties.severity,
                            urgency: alert.properties.urgency,
                            areas: alert.properties.areaDesc?.split('; ') || [],
                            effective: alert.properties.effective,
                            expires: alert.properties.expires,
                        })) || [];
                    }
                }
            } catch (error) {
                console.warn('Failed to fetch weather alerts:', error);
            }
        }

        return {
            location: { 
                displayName, 
                latitude, 
                longitude, 
                timezone,
                forecastOffice 
            },
            forecast: periods.slice(0, 5).map((period: any) => ({
                name: period.name,
                temperature: period.temperature,
                temperatureUnit: period.temperatureUnit,
                windSpeed: period.windSpeed,
                windDirection: period.windDirection,
                shortForecast: period.shortForecast,
                detailedForecast: period.detailedForecast,
                startTime: period.startTime,
                endTime: period.endTime,
                probabilityOfPrecipitation: period.probabilityOfPrecipitation,
            })),
            hourlyForecast,
            alerts,
        };
    },
});