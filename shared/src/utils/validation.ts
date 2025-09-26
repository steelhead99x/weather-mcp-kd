import { WeatherDataSchema, WeatherRequestSchema } from '../types/weather';

export function validateWeatherData(data: unknown) {
  return WeatherDataSchema.safeParse(data);
}

export function validateWeatherRequest(data: unknown) {
  return WeatherRequestSchema.safeParse(data);
}

export function isValidLocation(location: string): boolean {
  return location.trim().length > 0 && location.length <= 100;
}
