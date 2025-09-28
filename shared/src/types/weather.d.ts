import { z } from 'zod';
export declare const WeatherLocationSchema: z.ZodObject<{
    displayName: z.ZodString;
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
    timezone: z.ZodOptional<z.ZodString>;
    forecastOffice: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    displayName: string;
    latitude: number;
    longitude: number;
    timezone?: string | undefined;
    forecastOffice?: string | undefined;
}, {
    displayName: string;
    latitude: number;
    longitude: number;
    timezone?: string | undefined;
    forecastOffice?: string | undefined;
}>;
export declare const WeatherForecastSchema: z.ZodObject<{
    name: z.ZodString;
    temperature: z.ZodNumber;
    temperatureUnit: z.ZodString;
    windSpeed: z.ZodString;
    windDirection: z.ZodString;
    shortForecast: z.ZodString;
    detailedForecast: z.ZodString;
    startTime: z.ZodString;
    endTime: z.ZodString;
    probabilityOfPrecipitation: z.ZodOptional<z.ZodObject<{
        value: z.ZodNullable<z.ZodNumber>;
        unitCode: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: number | null;
        unitCode: string;
    }, {
        value: number | null;
        unitCode: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    temperature: number;
    temperatureUnit: string;
    windSpeed: string;
    windDirection: string;
    shortForecast: string;
    detailedForecast: string;
    startTime: string;
    endTime: string;
    probabilityOfPrecipitation?: {
        value: number | null;
        unitCode: string;
    } | undefined;
}, {
    name: string;
    temperature: number;
    temperatureUnit: string;
    windSpeed: string;
    windDirection: string;
    shortForecast: string;
    detailedForecast: string;
    startTime: string;
    endTime: string;
    probabilityOfPrecipitation?: {
        value: number | null;
        unitCode: string;
    } | undefined;
}>;
export declare const WeatherHourlyForecastSchema: z.ZodObject<{
    time: z.ZodString;
    temperature: z.ZodNumber;
    temperatureUnit: z.ZodString;
    windSpeed: z.ZodString;
    windDirection: z.ZodString;
    shortForecast: z.ZodString;
    probabilityOfPrecipitation: z.ZodOptional<z.ZodObject<{
        value: z.ZodNullable<z.ZodNumber>;
        unitCode: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: number | null;
        unitCode: string;
    }, {
        value: number | null;
        unitCode: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    temperature: number;
    temperatureUnit: string;
    windSpeed: string;
    windDirection: string;
    shortForecast: string;
    time: string;
    probabilityOfPrecipitation?: {
        value: number | null;
        unitCode: string;
    } | undefined;
}, {
    temperature: number;
    temperatureUnit: string;
    windSpeed: string;
    windDirection: string;
    shortForecast: string;
    time: string;
    probabilityOfPrecipitation?: {
        value: number | null;
        unitCode: string;
    } | undefined;
}>;
export declare const WeatherAlertSchema: z.ZodObject<{
    id: z.ZodString;
    event: z.ZodString;
    headline: z.ZodString;
    description: z.ZodString;
    severity: z.ZodString;
    urgency: z.ZodString;
    areas: z.ZodArray<z.ZodString, "many">;
    effective: z.ZodString;
    expires: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    event: string;
    headline: string;
    description: string;
    severity: string;
    urgency: string;
    areas: string[];
    effective: string;
    expires: string;
}, {
    id: string;
    event: string;
    headline: string;
    description: string;
    severity: string;
    urgency: string;
    areas: string[];
    effective: string;
    expires: string;
}>;
export declare const WeatherDataSchema: z.ZodObject<{
    location: z.ZodObject<{
        displayName: z.ZodString;
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
        timezone: z.ZodOptional<z.ZodString>;
        forecastOffice: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        displayName: string;
        latitude: number;
        longitude: number;
        timezone?: string | undefined;
        forecastOffice?: string | undefined;
    }, {
        displayName: string;
        latitude: number;
        longitude: number;
        timezone?: string | undefined;
        forecastOffice?: string | undefined;
    }>;
    forecast: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        temperature: z.ZodNumber;
        temperatureUnit: z.ZodString;
        windSpeed: z.ZodString;
        windDirection: z.ZodString;
        shortForecast: z.ZodString;
        detailedForecast: z.ZodString;
        startTime: z.ZodString;
        endTime: z.ZodString;
        probabilityOfPrecipitation: z.ZodOptional<z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            unitCode: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: number | null;
            unitCode: string;
        }, {
            value: number | null;
            unitCode: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        detailedForecast: string;
        startTime: string;
        endTime: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }, {
        name: string;
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        detailedForecast: string;
        startTime: string;
        endTime: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }>, "many">;
    hourlyForecast: z.ZodOptional<z.ZodArray<z.ZodObject<{
        time: z.ZodString;
        temperature: z.ZodNumber;
        temperatureUnit: z.ZodString;
        windSpeed: z.ZodString;
        windDirection: z.ZodString;
        shortForecast: z.ZodString;
        probabilityOfPrecipitation: z.ZodOptional<z.ZodObject<{
            value: z.ZodNullable<z.ZodNumber>;
            unitCode: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            value: number | null;
            unitCode: string;
        }, {
            value: number | null;
            unitCode: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        time: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }, {
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        time: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }>, "many">>;
    alerts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        event: z.ZodString;
        headline: z.ZodString;
        description: z.ZodString;
        severity: z.ZodString;
        urgency: z.ZodString;
        areas: z.ZodArray<z.ZodString, "many">;
        effective: z.ZodString;
        expires: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        event: string;
        headline: string;
        description: string;
        severity: string;
        urgency: string;
        areas: string[];
        effective: string;
        expires: string;
    }, {
        id: string;
        event: string;
        headline: string;
        description: string;
        severity: string;
        urgency: string;
        areas: string[];
        effective: string;
        expires: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    location: {
        displayName: string;
        latitude: number;
        longitude: number;
        timezone?: string | undefined;
        forecastOffice?: string | undefined;
    };
    forecast: {
        name: string;
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        detailedForecast: string;
        startTime: string;
        endTime: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }[];
    hourlyForecast?: {
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        time: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }[] | undefined;
    alerts?: {
        id: string;
        event: string;
        headline: string;
        description: string;
        severity: string;
        urgency: string;
        areas: string[];
        effective: string;
        expires: string;
    }[] | undefined;
}, {
    location: {
        displayName: string;
        latitude: number;
        longitude: number;
        timezone?: string | undefined;
        forecastOffice?: string | undefined;
    };
    forecast: {
        name: string;
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        detailedForecast: string;
        startTime: string;
        endTime: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }[];
    hourlyForecast?: {
        temperature: number;
        temperatureUnit: string;
        windSpeed: string;
        windDirection: string;
        shortForecast: string;
        time: string;
        probabilityOfPrecipitation?: {
            value: number | null;
            unitCode: string;
        } | undefined;
    }[] | undefined;
    alerts?: {
        id: string;
        event: string;
        headline: string;
        description: string;
        severity: string;
        urgency: string;
        areas: string[];
        effective: string;
        expires: string;
    }[] | undefined;
}>;
export declare const WeatherRequestSchema: z.ZodObject<{
    zipCode: z.ZodString;
    includeHourly: z.ZodOptional<z.ZodBoolean>;
    includeAlerts: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    zipCode: string;
    includeHourly?: boolean | undefined;
    includeAlerts?: boolean | undefined;
}, {
    zipCode: string;
    includeHourly?: boolean | undefined;
    includeAlerts?: boolean | undefined;
}>;
export declare const LegacyWeatherDataSchema: z.ZodObject<{
    location: z.ZodString;
    temperature: z.ZodNumber;
    condition: z.ZodString;
    humidity: z.ZodNumber;
    windSpeed: z.ZodNumber;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    temperature: number;
    windSpeed: number;
    location: string;
    condition: string;
    humidity: number;
    timestamp: string;
}, {
    temperature: number;
    windSpeed: number;
    location: string;
    condition: string;
    humidity: number;
    timestamp: string;
}>;
export declare const LegacyWeatherRequestSchema: z.ZodObject<{
    location: z.ZodString;
    units: z.ZodDefault<z.ZodOptional<z.ZodEnum<["celsius", "fahrenheit"]>>>;
}, "strip", z.ZodTypeAny, {
    location: string;
    units: "celsius" | "fahrenheit";
}, {
    location: string;
    units?: "celsius" | "fahrenheit" | undefined;
}>;
export type WeatherLocation = z.infer<typeof WeatherLocationSchema>;
export type WeatherForecast = z.infer<typeof WeatherForecastSchema>;
export type WeatherHourlyForecast = z.infer<typeof WeatherHourlyForecastSchema>;
export type WeatherAlert = z.infer<typeof WeatherAlertSchema>;
export type WeatherData = z.infer<typeof WeatherDataSchema>;
export type WeatherRequest = z.infer<typeof WeatherRequestSchema>;
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
//# sourceMappingURL=weather.d.ts.map