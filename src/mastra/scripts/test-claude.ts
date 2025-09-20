import 'dotenv/config';
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { pathToFileURL } from 'url';

// Local Tone type (no external config dependency)
export type Tone = 'professional' | 'groovy' | 'librarian' | 'sports';

// Get model from environment or use default
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';

// Standalone Claude weather prompt generator for testing
export async function generateWeatherPrompt(
    weatherData: any,
    tone: Tone,
    location: string
) {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    const toneDescriptions: Record<Tone, string> = {
        professional: "authoritative TV weather forecaster",
        groovy: "laid-back musician giving weather updates between songs",
        librarian: "gentle librarian sharing weather information quietly",
        sports: "energetic sports broadcaster calling weather like a game"
    };

    const currentWeather = weatherData.forecast[0];

    const result = await generateText({
        model: anthropic(ANTHROPIC_MODEL) as any,
        messages: [{
            role: 'user',
            content: `You are a ${toneDescriptions[tone]}. Create a natural, conversational weather report for text-to-speech.

WEATHER DATA:
- Location: ${location}
- Conditions: ${currentWeather.shortForecast}
- Temperature: ${currentWeather.temperature}
- Wind: ${currentWeather.windSpeed} from ${currentWeather.windDirection}
- Precipitation: ${currentWeather.probabilityOfPrecipitation || 'None expected'}

REQUIREMENTS:
- Maximum 900 characters
- Sound completely natural when spoken
- Match the ${tone} personality perfectly
- Be creative and unique, not formulaic  
- Include all weather info naturally
- Use conversational flow
- Avoid special characters
- End with appropriate tone-matching conclusion

Generate one flowing paragraph:`
        }],
        maxTokens: 250,
        temperature: 0.9 // High creativity for varied outputs
    });

    return result.text.trim()
        .replace(/[°]/g, ' degrees ')
        .replace(/%/g, ' percent ')
        .replace(/&/g, ' and ')
        .replace(/["']/g, '')
        .replace(/[^\w\s.,!?-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Test helper for manual/test runner invocation only.
export async function testClaudeGeneration() {
    console.log("🤖 Testing Claude weather generation...\n");

    if (!process.env.ANTHROPIC_API_KEY) {
        console.error("❌ ANTHROPIC_API_KEY environment variable is required");
        console.log("💡 Please set your API key in the .env file");
        return;
    }

    const mockWeatherData = {
        forecast: [{
            shortForecast: "Partly Cloudy",
            temperature: "72°F",
            windSpeed: "10 mph",
            windDirection: "SW",
            probabilityOfPrecipitation: "20%"
        }]
    };

    // Define tones directly instead of importing TONE_OPTIONS
    const tones: Array<Tone> = ["professional", "groovy", "librarian", "sports"];

    console.log(`🤖 Testing ${ANTHROPIC_MODEL} Weather Generation\n`);

    for (const tone of tones) {
        try {
            console.log(`🎭 ${tone.toUpperCase()} TONE:`);
            const prompt = await generateWeatherPrompt(mockWeatherData, tone, "Los Angeles, CA");
            console.log(`"${prompt}"`);
            console.log(`Length: ${prompt.length} characters\n`);
        } catch (error) {
            console.error(`❌ Failed to generate ${tone}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
    }
}

// Direct execution with better error handling
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
    testClaudeGeneration().catch((error) => {
        console.error("❌ Test execution failed:", error);
        process.exit(1);
    });
}