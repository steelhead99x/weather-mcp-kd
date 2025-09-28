import { z } from 'zod';

// Comprehensive weather data schema matching backend tool output
export const WeatherLocationSchema = z.object({
  displayName: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string().optional(),
  forecastOffice: z.string().optional(),
});

export const WeatherForecastSchema = z.object({
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
});

export const WeatherHourlyForecastSchema = z.object({
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
});

export const WeatherAlertSchema = z.object({
  id: z.string(),
  event: z.string(),
  headline: z.string(),
  description: z.string(),
  severity: z.string(),
  urgency: z.string(),
  areas: z.array(z.string()),
  effective: z.string(),
  expires: z.string(),
});

export const WeatherDataSchema = z.object({
  location: WeatherLocationSchema,
  forecast: z.array(WeatherForecastSchema),
  hourlyForecast: z.array(WeatherHourlyForecastSchema).optional(),
  alerts: z.array(WeatherAlertSchema).optional(),
});

export const WeatherRequestSchema = z.object({
  zipCode: z.string().describe("5-digit ZIP code for weather lookup"),
  includeHourly: z.boolean().optional().describe("Include hourly forecast (default: false)"),
  includeAlerts: z.boolean().optional().describe("Include active weather alerts (default: false)"),
});

// Legacy schema for backward compatibility
export const LegacyWeatherDataSchema = z.object({
  location: z.string(),
  temperature: z.number(),
  condition: z.string(),
  humidity: z.number(),
  windSpeed: z.number(),
  timestamp: z.string(),
});

export const LegacyWeatherRequestSchema = z.object({
  location: z.string(),
  units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
});

// Export types
export type WeatherLocation = z.infer<typeof WeatherLocationSchema>;
export type WeatherForecast = z.infer<typeof WeatherForecastSchema>;
export type WeatherHourlyForecast = z.infer<typeof WeatherHourlyForecastSchema>;
export type WeatherAlert = z.infer<typeof WeatherAlertSchema>;
export type WeatherData = z.infer<typeof WeatherDataSchema>;
export type WeatherRequest = z.infer<typeof WeatherRequestSchema>;

// Legacy types for backward compatibility
export type LegacyWeatherData = z.infer<typeof LegacyWeatherDataSchema>;
export type LegacyWeatherRequest = z.infer<typeof LegacyWeatherRequestSchema>;

export interface AgentMessage {
  id: string;
  content: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface StreamResponse {
  type: 'text' | 'audio' | 'error';
  content: string;
  metadata?: Record<string, any>;
}
