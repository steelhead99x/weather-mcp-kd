import { z } from 'zod';

export const WeatherDataSchema = z.object({
  location: z.string(),
  temperature: z.number(),
  condition: z.string(),
  humidity: z.number(),
  windSpeed: z.number(),
  timestamp: z.string(),
});

export const WeatherRequestSchema = z.object({
  location: z.string(),
  units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
});

export type WeatherData = z.infer<typeof WeatherDataSchema>;
export type WeatherRequest = z.infer<typeof WeatherRequestSchema>;

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
