import { describe, it, expect, vi, beforeAll } from 'vitest';
import { weatherTool } from '../tools/weather';

// Mock fetch for testing
global.fetch = vi.fn();

describe('Weather Tool', () => {
  beforeAll(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  it('should have correct tool configuration', () => {
    expect(weatherTool.description).toContain('weather information');
    expect(weatherTool.inputSchema).toBeDefined();
    expect(weatherTool.outputSchema).toBeDefined();
  });

  it('should validate zipCode parameter', () => {
    expect(weatherTool.inputSchema).toBeDefined();
    // The tool should accept zipCode in its input schema
    const testInput = { zipCode: '94105' };
    expect(() => weatherTool.inputSchema.parse(testInput)).not.toThrow();
  });

  it('should handle valid zip code format', async () => {
    // Mock the National Weather Service API response
    const mockLocationResponse = {
      properties: {
        relativeLocation: {
          properties: {
            city: 'San Francisco',
            state: 'CA'
          }
        },
        forecast: 'https://api.weather.gov/forecast/123',
        forecastHourly: 'https://api.weather.gov/forecast/123/hourly'
      }
    };

    const mockForecastResponse = {
      properties: {
        periods: [
          {
            name: 'Today',
            temperature: 72,
            temperatureUnit: 'F',
            windSpeed: '10 mph',
            windDirection: 'W',
            shortForecast: 'Sunny',
            detailedForecast: 'Sunny skies with light winds.'
          }
        ]
      }
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockLocationResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockForecastResponse
      });

    const result = await weatherTool.handler({ zipCode: '94105' });
    
    expect(result).toBeDefined();
    expect(result.location).toMatchObject({
      displayName: 'San Francisco, CA'
    });
    expect(result.forecast).toHaveLength(1);
    expect(result.forecast[0]).toMatchObject({
      name: 'Today',
      temperature: 72,
      temperatureUnit: 'F'
    });
  });

  it('should handle invalid zip code', async () => {
    await expect(async () => {
      await weatherTool.handler({ zipCode: 'invalid' });
    }).rejects.toThrow();
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    await expect(async () => {
      await weatherTool.handler({ zipCode: '94105' });
    }).rejects.toThrow('Network error');
  });

  it('should include proper User-Agent header', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        properties: {
          relativeLocation: { properties: { city: 'Test', state: 'CA' }},
          forecast: 'https://api.weather.gov/forecast/123'
        }
      })
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    await weatherTool.handler({ zipCode: '94105' });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('WeatherAgent')
        })
      })
    );
  });
});
