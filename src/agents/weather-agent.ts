import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import { getWeatherByZipTool } from "../tools/weather.js";
import { mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { pathToFileURL } from "url";
import { TONE_OPTIONS } from "../config/tones.js";
import type { Tone } from "../config/tones.js";
import { getAnthropicModel } from "../config/models.js";

// Get Anthropic model from environment or use default (centralized)
const ANTHROPIC_MODEL = getAnthropicModel();

interface ToneStylesMap {
    personality: string;
    examples: string[];
    characteristics: string[];
}

const toneStyles: Record<Tone, ToneStylesMap> = {
    professional: {
        personality: "authoritative weather forecaster on television",
        examples: [
            "Good morning, this is your weather update",
            "Currently experiencing partly cloudy conditions",
            "Expect temperatures to reach a high of",
            "Stay prepared for changing conditions",
        ],
        characteristics: [
            "Clear and concise delivery",
            "Uses proper meteorological terminology",
            "Professional broadcast tone",
            "Informative and trustworthy",
        ],
    },
    groovy: {
        personality: "laid-back musician giving weather updates between songs",
        examples: [
            "Hey there weather cats, the vibe today is",
            "Feeling some smooth temperatures at",
            "The atmospheric rhythm is showing",
            "Keep it cool and stay groovy out there",
        ],
        characteristics: [
            "Relaxed and conversational",
            "Uses music and rhythm metaphors",
            "Casual and friendly tone",
            "Creative weather descriptions",
        ],
    },
    librarian: {
        personality: "gentle librarian sharing weather information quietly",
        examples: [
            "According to today's meteorological records",
            "One might observe current conditions of",
            "It would be prudent to note that",
            "Please consider dressing appropriately for",
        ],
        characteristics: [
            "Soft-spoken and considerate",
            "Uses scholarly language",
            "Helpful and informative",
            "Polite suggestions rather than commands",
        ],
    },
    sports: {
        personality: "energetic sports broadcaster calling weather like a game",
        examples: [
            "Coming to you live with today's weather lineup",
            "What an incredible atmospheric performance",
            "The temperature is making a strong showing at",
            "Absolutely fantastic conditions taking the field today",
        ],
        characteristics: [
            "High energy and excitement",
            "Sports commentary style",
            "Dynamic and engaging",
            "Uses sports metaphors and terminology",
        ],
    },
};

// Tool to generate natural TTS prompt using Claude
const generateTTSPromptTool = createTool({
    id: "generate_tts_prompt",
    description: `Generates a natural, spoken-friendly weather prompt using ${ANTHROPIC_MODEL}`,
    inputSchema: z.object({
        weatherData: z
            .any()
            .optional()
            .describe("Weather forecast data (optional; will be fetched if not provided)"),
        tone: z
            .enum(TONE_OPTIONS)
            .describe("Tone of voice for the weather report"),
        zipCode: z.string().describe("ZIP code for the weather report"),
    }) as unknown as any,
    execute: async ({ context, suspend }) => {
        const { weatherData: ctxWeatherData, tone: ctxTone, zipCode: ctxZip } = (context || {}) as any;
        let weatherData = ctxWeatherData;
        const tone = ctxTone as Tone;
        const zipCode = ctxZip as string;
        const style = toneStyles[tone];

        if (!style) {
            throw new Error(`Invalid tone style: ${tone}`);
        }

        // If weatherData is missing or malformed, attempt to fetch it using the provided zipCode
        if (!weatherData?.forecast || !Array.isArray(weatherData.forecast)) {
            if (!zipCode) {
                throw new Error("ZIP code is required to fetch weather data");
            }
            // Validate tool availability outside of try-catch to avoid local throw/catch
            if (!getWeatherByZipTool.execute) {
                throw new Error("Weather tool execute method is not available");
            }
            try {
                // Use type assertion to bypass the TypeScript error, following the pattern in test files
                weatherData = await (getWeatherByZipTool as any).execute({
                    context: { zipCode },
                    suspend,
                });
            } catch (e) {
                throw new Error(
                    `Failed to fetch weather data for ${zipCode}: ${
                        e instanceof Error ? e.message : String(e)
                    }`
                );
            }
        }

        if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error("ANTHROPIC_API_KEY environment variable is required");
        }

        const currentWeather = weatherData.forecast[0];
        const location = weatherData.location?.displayName || `ZIP code ${zipCode}`;

        try {
            // Use configurable Anthropic model to generate creative weather prompt
            const result = await generateText({
                model: anthropic(ANTHROPIC_MODEL) as any,
                messages: [
                    {
                        role: "user",
                        content: `You are a ${style.personality}. Create a natural, spoken weather report for text-to-speech that sounds conversational and engaging.

WEATHER DATA:
- Location: ${location}
- Conditions: ${currentWeather.shortForecast}
- Temperature: ${currentWeather.temperature}
- Wind: ${currentWeather.windSpeed} from ${currentWeather.windDirection}
- Precipitation chance: ${currentWeather.probabilityOfPrecipitation || "None expected"}
- Humidity: ${currentWeather.relativeHumidity || "Not specified"}

TONE CHARACTERISTICS:
${style.characteristics.map((char) => `- ${char}`).join("\n")}

EXAMPLE PHRASES (use as inspiration, don't copy exactly):
${style.examples.map((example) => `"${example}"`).join("\n")}

REQUIREMENTS:
- Maximum 950 characters (leave room for cleaning)
- Sound natural when spoken aloud
- Match the ${tone} personality perfectly
- Be creative and unique, not formulaic
- Include all key weather information
- Use conversational flow, not bullet points
- Avoid special characters that would be pronounced
- End with a friendly conclusion

Generate a single, flowing weather report paragraph:`,
                    },
                ],
                maxTokens: 300,
                temperature: 0.8, // Add creativity while maintaining accuracy
            });

            let prompt = result.text.trim();

            // Clean text for TTS (remove special characters that would be read aloud)
            prompt = prompt
                .replace(/[°]/g, " degrees ")
                .replace(/%/g, " percent ")
                .replace(/&/g, " and ")
                .replace(/\//g, " ")
                .replace(/["']/g, "") // Remove quotes
                .replace(/[^\w\s.,!?-]/g, " ") // Remove other special chars
                .replace(/\s+/g, " ")
                .trim();

            // Ensure under 1000 characters
            if (prompt.length > 1000) {
                prompt = prompt.substring(0, 997) + "...";
            }

            return {
                prompt,
                tone,
                characterCount: prompt.length,
                generatedBy: ANTHROPIC_MODEL,
                model: ANTHROPIC_MODEL,
            };
        } catch (error) {
            throw new Error(
                `Failed to generate prompt with ${ANTHROPIC_MODEL}: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    },
});

// Tool to generate audio file
const generateAudioTool = createTool({
    id: "generate_audio_file",
    description: "Generates an audio file using TTS and saves it locally",
    inputSchema: z.object({
        text: z.string().describe("Text to convert to speech"),
        tone: z.string().describe("Voice tone used (for filename)"),
    }) as unknown as any,
    execute: async ({ context }) => {
        const { text, tone } = (context || {}) as any;

        // Create unique filename base and ensure files directory exists
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        const uniqueId = uuidv4().split("-")[0];
        const filesDir = join(process.cwd(), "files");
        await mkdir(filesDir, { recursive: true });

        const filename = `weather-${tone}-${timestamp}-${uniqueId}.mp3`;
        const filePath = join(filesDir, filename);

        // Helper: write buffer to disk
        const writeBuffer = async (buffer: Buffer) => {
            const fs = await import("fs/promises");
            await fs.writeFile(filePath, buffer);
            return { success: true as const, filename, filePath };
        };

        // Choose TTS provider: prefer Cartesia, fallback to Deepgram, else text
        const cartesiaKey = process.env.CARTESIA_API_KEY;
        const cartesiaVoice =
            process.env.CARTESIA_VOICE || "6f84f4b8-58a2-430c-8c79-688dad597532";
        const deepgramKey = process.env.DEEPGRAM_API_KEY;

        try {
            let lastErrorMessage = "";
            // 1) Try Cartesia first if available
            if (cartesiaKey) {
                const cartesiaUrl = `https://api.cartesia.ai/tts`;
                const cartesiaRes = await fetch(cartesiaUrl, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${cartesiaKey}`,
                        "Content-Type": "application/json",
                        Accept: "audio/mpeg",
                    },
                    body: JSON.stringify({
                        text,
                        voice: cartesiaVoice,
                        outputFormat: "mp3",
                    }),
                });

                if (!cartesiaRes.ok) {
                    let errText = "";
                    try {
                        errText = await cartesiaRes.text();
                    } catch {
                        // Ignore text extraction errors
                    }
                    lastErrorMessage = `Cartesia TTS failed: ${cartesiaRes.status} ${cartesiaRes.statusText} ${errText}`.trim();
                } else {
                    const cartesiaArrayBuf = await cartesiaRes.arrayBuffer();
                    const cartesiaBuffer = Buffer.from(cartesiaArrayBuf);
                    return await writeBuffer(cartesiaBuffer);
                }
            }

            // 2) Fallback to Deepgram if available
            if (deepgramKey) {
                const dgVoice = process.env.DEEPGRAM_VOICE || "aura-asteria-en";
                const params = new URLSearchParams({
                    model: dgVoice,
                    encoding: "mp3",
                });
                const dgUrl = `https://api.deepgram.com/v1/speak?${params.toString()}`;

                const res = await fetch(dgUrl, {
                    method: "POST",
                    headers: {
                        Authorization: `Token ${deepgramKey}`,
                        "Content-Type": "text/plain",
                        Accept: "audio/mpeg",
                    },
                    body: text,
                });

                if (!res.ok) {
                    let bodyText = "";
                    try {
                        bodyText = await res.text();
                    } catch {
                        // Ignore text extraction errors
                    }
                    lastErrorMessage = `Deepgram TTS request failed: ${res.status} ${res.statusText} ${bodyText}`.trim();
                } else {
                    const arrayBuf = await res.arrayBuffer();
                    const buffer = Buffer.from(arrayBuf);
                    return await writeBuffer(buffer);
                }
            }

            // 3) If we reach here, either no providers are configured or both failed — save text
            const txtFilename = `weather-${tone}-${timestamp}-${uniqueId}.txt`;
            const txtPath = join(filesDir, txtFilename);
            const fs = await import("fs/promises");
            await fs.writeFile(txtPath, text, "utf8");
            const noProviders = !cartesiaKey && !deepgramKey;
            const baseMsg = noProviders
                ? "No TTS provider configured. Saved text instead."
                : (lastErrorMessage || "TTS providers failed. Saved text instead.");
            return {
                success: false,
                filename: txtFilename,
                filePath: txtPath,
                message: `⚠️ ${baseMsg}`,
                error: noProviders ? "No CARTESIA_API_KEY or DEEPGRAM_API_KEY found" : lastErrorMessage,
            };
        } catch (error) {
            // Fallback to text file
            const errMsg = `Failed to generate audio: ${
                error instanceof Error ? error.message : String(error)
            }`;
            const txtFilename = `weather-${tone}-${timestamp}-${uniqueId}.txt`;
            const txtPath = join(filesDir, txtFilename);
            const fs = await import("fs/promises");
            await fs.writeFile(txtPath, text, "utf8");
            return {
                success: false,
                filename: txtFilename,
                filePath: txtPath,
                message: `⚠️ ${errMsg}. Saved text instead.`,
                error: errMsg,
            };
        }
    },
});

export const weatherAgent = new Agent({
    name: "Weather Voice Agent",
    instructions: `You are a helpful weather assistant that creates natural, spoken weather reports using AI-generated content. 

IMPORTANT: Always start by asking for the user's ZIP code if not provided in the conversation.

Your workflow:
1. **First, ask the user for their ZIP code** - This is mandatory before proceeding
2. Get weather data for that location using the weather tool
3. Ask which tone they prefer from these 4 options:
   - **professional**: TV weather forecaster style (clear and authoritative)
   - **groovy**: Laid-back musician style (relaxed and creative) 
   - **librarian**: Gentle and informative style (soft-spoken and scholarly)
   - **sports**: Sports broadcaster style (energetic and exciting)
4. Use ${ANTHROPIC_MODEL} to generate a unique, natural speech prompt under 1000 characters
5. Create an MP3 audio file using Cartesia or Deepgram TTS
6. Provide the filename and confirm the audio file was created

Always be friendly, explain each step clearly, and emphasize that each weather report is uniquely generated by AI. If no ZIP code is provided initially, your first response should ask for it.`,
    model: anthropic(ANTHROPIC_MODEL) as any,
    tools: {
        getWeatherByZip: getWeatherByZipTool,
        generateTTSPrompt: generateTTSPromptTool,
        generateAudioFile: generateAudioTool,
    },
});

export async function runWeatherAgent() {
    console.log("🌤️  Weather Voice Agent with Anthropic AI!");
    console.log(`🤖 Using model: ${ANTHROPIC_MODEL}`);
    console.log("✨ Each weather report is uniquely generated using AI creativity\n");

    // Read inputs from environment for non-interactive demo
    const zipFromEnv = process.env.ZIP_CODE;
    const toneFromEnv = (process.env.TONE as Tone | undefined);
    const zipCode = (zipFromEnv && /^\d{5}$/.test(zipFromEnv)) ? zipFromEnv : (zipFromEnv ? undefined : undefined);

    // Default tone if not provided
    const { DEFAULT_TONE } = await import("../config/tones.js");
    const tone: Tone = toneFromEnv && ["professional","groovy","librarian","sports"].includes(toneFromEnv)
        ? toneFromEnv
        : DEFAULT_TONE;

    if (!process.env.ANTHROPIC_API_KEY) {
        console.log("❌ Missing ANTHROPIC_API_KEY. Claude cannot generate the speaking text.");
        console.log("💡 Add ANTHROPIC_API_KEY to your .env file.");
    }

    try {
        // 1) Get a ZIP code: prefer env var, else use a reasonable default
        const effectiveZip = zipCode ?? "10001"; // NYC default if none provided
        console.log(`📍 Using ZIP code: ${effectiveZip}`);
        console.log(`🎭 Using tone: ${tone}`);

        // 2) Fetch weather data via tool
        const weatherData = await (getWeatherByZipTool as any).execute({ context: { zipCode: effectiveZip } });
        const location = weatherData?.location?.displayName ?? `ZIP ${effectiveZip}`;

        // 3) Generate speaking prompt via Claude
        const promptRes = await (generateTTSPromptTool as any).execute({ context: { weatherData, tone, zipCode: effectiveZip } });
        const speakingText: string = promptRes.prompt;
        console.log(`\n📝 Generated speaking text for ${location} (${promptRes.characterCount} chars) using ${promptRes.model}`);
        console.log(`---\n${speakingText}\n---\n`);

        // 4) Generate audio via TTS provider(s)
        const audioRes = await (generateAudioTool as any).execute({ context: { text: speakingText, tone } });

        if (audioRes.success) {
            console.log("✅ Weather Voice Agent session completed!");
            console.log(`🎵 MP3 created: ${audioRes.filename}`);
            console.log(`📂 Full path: ${audioRes.filePath}`);
            console.log(`🤖 Your weather report was uniquely crafted by ${ANTHROPIC_MODEL}!`);
        } else {
            console.log("⚠️ Audio generation did not produce an MP3.");
            if (audioRes.message) console.log(audioRes.message);
            console.log(`📝 Saved speaking text to: ${audioRes.filePath}`);
            if (!process.env.CARTESIA_API_KEY && !process.env.DEEPGRAM_API_KEY) {
                console.log("💡 Set CARTESIA_API_KEY or DEEPGRAM_API_KEY in .env to enable MP3 output.");
            }
            console.log(`🤖 The speaking text was generated by ${ANTHROPIC_MODEL}.`);
        }
    } catch (error) {
        console.error("❌ Error:", error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.message.includes("ANTHROPIC_API_KEY")) {
            console.log("\n💡 Make sure to set your ANTHROPIC_API_KEY in the .env file");
        }
        if (error instanceof Error && error.message.includes("DEEPGRAM_API_KEY")) {
            console.log("💡 Make sure to set your DEEPGRAM_API_KEY in the .env file");
        }
    }
}

// Run if this file is executed directly (ESM-compatible)
const argv1 = process.argv?.[1];
const isDirectRun = Boolean(argv1) && import.meta && (import.meta as any).url === pathToFileURL(argv1 as string).href;
if (isDirectRun) {
    runWeatherAgent();
}