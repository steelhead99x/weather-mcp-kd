import { anthropic } from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { weatherTool } from "../tools/weather";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

// Create memory instance conditionally to avoid import errors
let weatherMemory: any = undefined;

try {
    // Dynamically import memory modules
    const { Memory } = await import("@mastra/memory");
    const { LibSQLStore } = await import("@mastra/libsql");

    // Try to optionally use Chroma as a vector store, but don't fail if unavailable
    let vectorStore: any = undefined;
    try {
        const { ChromaStore } = await import("@mastra/chroma");
        vectorStore = new ChromaStore({
            url: process.env.CHROMA_URL || "http://localhost:8000",
            collection: "weather-agent-vectors",
        });
    } catch (vecErr: any) {
        console.warn("Vector store not available, proceeding without semantic recall:", vecErr?.message || vecErr);
    }

    weatherMemory = new Memory({
        storage: new LibSQLStore({
            url: process.env.WEATHER_DB_URL || "file:./weather-agent-memory.db",
        }),
        ...(vectorStore && { vectorStore }),
        options: {
            ...(vectorStore && {
                // Enable semantic recall only when a vector store is available
                semanticRecall: {
                    enabled: true,
                    topK: 5,
                    messageRange: 10,
                    threshold: 0.7,
                },
            }),
            workingMemory: {
                enabled: true,
                maxMessages: 50,
            },
            messageHistory: {
                enabled: true,
                maxMessages: 200,
            },
        },
    });
} catch (error: any) {
    console.warn("Memory packages not available, running without memory:", error?.message || error);
}

export const weatherAgent = new Agent({
    name: 'Weather Agent',
    instructions: `You are a helpful weather assistant that provides accurate weather information and friendly commentary.

Your primary function is to help users get weather details for specific locations. When responding:
- Always ask for a location if none is provided (prefer requesting a 5-digit ZIP code in the US)
- If the location name isn't in English, please translate it  
- If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
- Include relevant details like humidity, wind conditions, and precipitation
- Keep responses concise but informative
- Add some personality and warmth to your responses
${weatherMemory ? '- Remember previous weather requests and locations the user has asked about\n- Reference past conversations when relevant to provide better context\n- After successfully fetching weather for a location, make a brief note of the ZIP and city so you can recall it if asked later.' : ''}

Use the weatherTool to fetch current weather data.${weatherMemory ? ' Use your memory to recall previous weather requests and user preferences.' : ''}`,
    model: anthropic(ANTHROPIC_MODEL),
    tools: { weatherTool },
    ...(weatherMemory && { memory: weatherMemory }),
});