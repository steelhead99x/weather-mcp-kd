import 'dotenv/config';
import { Agent } from "@mastra/core";
import { anthropic } from "@ai-sdk/anthropic";
import { weatherTool } from "../tools/weather";
import { promises as fs } from 'fs';
import { resolve, dirname } from 'path';
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client';
import { muxMcpClient as assetsClient } from '../mcp/mux-assets-client';
import { Memory } from "@mastra/memory";
import { InMemoryStore } from "@mastra/core/storage";
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// Configure FFmpeg path
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
} else {
    ffmpeg.setFfmpegPath('ffmpeg');
}

// Create video from audio and image
async function createVideoFromAudioAndImage(
    audioPath: string,
    imagePath: string,
    outputPath: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(imagePath)
            .inputOptions(['-loop 1'])
            .input(audioPath)
            .outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-b:a 192k',
                '-pix_fmt yuv420p',
                '-shortest'
            ])
            .output(outputPath)
            .on('start', (cmd: string) => console.log(`[createVideo] FFmpeg: ${cmd}`))
            .on('end', () => resolve())
            .on('error', (err: Error) => {
                console.error(`[createVideo] Error: ${err.message}`);
                reject(new Error(`FFmpeg failed: ${err.message}`));
            })
            .run();
    });
}

// Generate TTS with Deepgram (WAV format for best quality)
async function synthesizeWithDeepgramTTS(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set');

    const model = process.env.DEEPGRAM_VOICE || 'aura-asteria-en';
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', 'linear16'); // Use linear16 PCM encoding
    url.searchParams.set('sample_rate', '48000'); // Sample rate works with linear16
    url.searchParams.set('container', 'wav'); // Specify WAV container

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        const error = await response.text().catch(() => 'Unknown error');
        throw new Error(`Deepgram TTS failed: ${response.status} ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // Verify we got audio data
    if (arrayBuffer.byteLength < 1000) {
        throw new Error(`Deepgram returned insufficient audio data: ${arrayBuffer.byteLength} bytes`);
    }
    
    return Buffer.from(arrayBuffer);
}

// Create a proper WAV file with a tone (for testing/fallback)
function createTestToneWAV(durationSeconds: number = 2, frequency: number = 440): Buffer {
    const sampleRate = 48000;
    const channels = 2; // stereo
    const bitsPerSample = 16;
    const numSamples = Math.floor(sampleRate * durationSeconds);
    const dataSize = numSamples * channels * (bitsPerSample / 8);
    const fileSize = 44 + dataSize;

    const buffer = Buffer.alloc(fileSize);
    let offset = 0;

    // WAV header
    buffer.write('RIFF', offset); offset += 4;
    buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
    buffer.write('WAVE', offset); offset += 4;

    // fmt chunk
    buffer.write('fmt ', offset); offset += 4;
    buffer.writeUInt32LE(16, offset); offset += 4; // PCM chunk size
    buffer.writeUInt16LE(1, offset); offset += 2;  // PCM format
    buffer.writeUInt16LE(channels, offset); offset += 2;
    buffer.writeUInt32LE(sampleRate, offset); offset += 4;
    buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), offset); offset += 4; // byte rate
    buffer.writeUInt16LE(channels * (bitsPerSample / 8), offset); offset += 2; // block align
    buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;

    // data chunk
    buffer.write('data', offset); offset += 4;
    buffer.writeUInt32LE(dataSize, offset); offset += 4;

    // Generate sine wave data
    const amplitude = Math.floor(0.1 * 32767); // 10% volume to avoid clipping
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const sample = Math.floor(amplitude * Math.sin(2 * Math.PI * frequency * t));

        // Write stereo samples (left and right channels)
        buffer.writeInt16LE(sample, offset); offset += 2; // Left
        buffer.writeInt16LE(sample, offset); offset += 2; // Right
    }

    return buffer;
}

// Improve text for natural speech
function optimizeTextForSpeech(text: string): string {
    return text
        // Expand abbreviations for clearer speech
        .replace(/\bmph\b/gi, 'miles per hour')
        .replace(/\bF\b/g, 'degrees')
        .replace(/(\d+)\s*°\s*F/gi, '$1 degrees')
        .replace(/(\d+)\s*°/g, '$1 degrees')
        .replace(/\bN\b(?=\W|$)/g, 'north')
        .replace(/\bS\b(?=\W|$)/g, 'south')
        .replace(/\bE\b(?=\W|$)/g, 'east')
        .replace(/\bW\b(?=\W|$)/g, 'west')
        .replace(/\bNW\b/gi, 'northwest')
        .replace(/\bNE\b/gi, 'northeast')
        .replace(/\bSW\b/gi, 'southwest')
        .replace(/\bSE\b/gi, 'southeast')
        .replace(/(\d+)%/g, '$1 percent')
        // Add natural pauses
        .replace(/\.\s+/g, '. ')
        .replace(/,\s*/g, ', ')
        .replace(/:\s*/g, ': ')
        // Normalize spacing
        .replace(/\s+/g, ' ')
        .trim();
}

// Create TTS weather report tool
const ttsWeatherTool = createTool({
    id: "tts-weather-upload",
    description: "Convert weather report to audio and upload to Mux",
    inputSchema: z.object({
        zipCode: z.string().describe("5-digit ZIP code"),
        text: z.string().optional().describe("Weather text to convert to speech"),
    }),
    execute: async ({ context }) => {
        const { zipCode, text } = context;

        if (!zipCode || !/^\d{5}$/.test(zipCode)) {
            throw new Error(`Invalid ZIP code: ${zipCode}`);
        }

        console.log(`[tts-weather-upload] Creating audio for ZIP ${zipCode}`);

        try {
            // Default weather text if none provided
            const weatherText = text || `Weather report for ZIP code ${zipCode}: Partly cloudy with a high of 72 degrees. Light winds from the southwest at 8 miles per hour. Have a great day!`;

            // Optimize text for natural speech
            const speechText = optimizeTextForSpeech(weatherText);

            // Limit to 500 characters for TTS constraints
            const finalText = speechText.length > 500
                ? speechText.slice(0, 497) + '...'
                : speechText;

            console.log(`[tts-weather-upload] Speech text: "${finalText}"`);

            // Generate TTS audio
            let audioBuffer: Buffer;
            let audioSource = 'tts';

            try {
                if (!process.env.DEEPGRAM_API_KEY) {
                    throw new Error('DEEPGRAM_API_KEY not configured');
                }
                audioBuffer = await synthesizeWithDeepgramTTS(finalText);
                console.log(`[tts-weather-upload] TTS successful with Deepgram`);
            } catch (error) {
                console.warn(`[tts-weather-upload] TTS failed: ${error instanceof Error ? error.message : String(error)}`);
                console.warn('[tts-weather-upload] Using test tone as fallback');

                // Create a proper test tone WAV file
                audioBuffer = createTestToneWAV(3, 440); // 3 second tone at 440Hz
                audioSource = 'fallback';
            }

            // Create file paths
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const baseDir = 'files/uploads/tts';
            const audioPath = `${baseDir}/weather-${timestamp}-${zipCode}.wav`;
            const videoPath = `${baseDir}/weather-${timestamp}-${zipCode}.mp4`;

            // Ensure directory exists
            await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });

            // Write audio file
            await fs.writeFile(resolve(audioPath), audioBuffer);
            console.log(`[tts-weather-upload] Audio saved: ${audioPath} (${audioBuffer.length} bytes, source: ${audioSource})`);

            // Check for image, create default if needed
            const imagePath = resolve('files/images/weather.jpg');
            let finalImagePath = imagePath;

            try {
                await fs.access(imagePath);
                console.log(`[tts-weather-upload] Using existing image: ${imagePath}`);
            } catch {
                // Create simple colored background
                const defaultImagePath = resolve(`${baseDir}/weather-bg-${timestamp}.png`);
                console.log(`[tts-weather-upload] Creating default background image...`);

                await new Promise<void>((resolve, reject) => {
                    ffmpeg()
                        .input('color=skyblue:size=1280x720:duration=1')
                        .inputFormat('lavfi')
                        .outputOptions(['-vframes 1'])
                        .output(defaultImagePath)
                        .on('end', () => {
                            console.log(`[tts-weather-upload] Created background: ${defaultImagePath}`);
                            resolve();
                        })
                        .on('error', (err: Error) => {
                            console.error(`[tts-weather-upload] Failed to create background: ${err.message}`);
                            reject(err);
                        })
                        .run();
                });
                finalImagePath = defaultImagePath;
            }

            // Create video
            console.log(`[tts-weather-upload] Creating video...`);
            await createVideoFromAudioAndImage(
                resolve(audioPath),
                finalImagePath,
                resolve(videoPath)
            );

            console.log(`[tts-weather-upload] Video created: ${videoPath}`);

            // Upload to Mux
            console.log('[tts-weather-upload] Starting Mux upload...');
            const uploadTools = await uploadClient.getTools();
            const createUpload = uploadTools['create_video_uploads'];

            if (!createUpload) {
                throw new Error('Mux upload tool not available');
            }

            const uploadArgs = {
                cors_origin: process.env.MUX_CORS_ORIGIN || 'http://localhost',
                new_asset_settings: {
                    playback_policies: ['signed'],
                    mp4_support: 'standard',
                },
            };

            const createResult = await createUpload.execute({ context: uploadArgs });
            const blocks = Array.isArray(createResult) ? createResult : [createResult];

            // Extract upload URL from response
            let uploadUrl: string | undefined;
            let assetId: string | undefined;
            let uploadId: string | undefined;

            for (const block of blocks as any[]) {
                const text = block?.text;
                if (text) {
                    try {
                        const data = JSON.parse(text);
                        uploadUrl = uploadUrl || data.url;
                        assetId = assetId || data.asset_id;
                        uploadId = uploadId || data.id;
                    } catch {
                        // Skip non-JSON blocks
                    }
                }
            }

            if (!uploadUrl) {
                throw new Error('No upload URL received from Mux');
            }

            // Upload video file
            console.log('[tts-weather-upload] Uploading to Mux...');
            const videoBuffer = await fs.readFile(resolve(videoPath));
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'video/mp4',
                    'Content-Length': videoBuffer.length.toString(),
                },
                body: videoBuffer,
            });

            if (!uploadResponse.ok) {
                throw new Error(`Upload failed: ${uploadResponse.status}`);
            }

            console.log('[tts-weather-upload] File upload successful');

            // Wait for initial processing
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Get asset_id from upload status using upload_id
            if (!assetId && uploadId) {
                console.log('[tts-weather-upload] Polling upload status to get asset_id...');
                const uploadTools2 = await uploadClient.getTools();
                const retrieveUpload = uploadTools2['retrieve_video_uploads'] || uploadTools2['video.uploads.get'];
                
                if (retrieveUpload) {
                    // Poll upload status until we get asset_id
                    const maxAttempts = 10;
                    const pollInterval = 3000;
                    
                    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                        try {
                            console.log(`[tts-weather-upload] Polling upload attempt ${attempt}/${maxAttempts}...`);
                            const uploadResult = await retrieveUpload.execute({ context: { UPLOAD_ID: uploadId } });
                            const uploadBlocks = Array.isArray(uploadResult) ? uploadResult : [uploadResult];
                            
                            for (const block of uploadBlocks as any[]) {
                                const text = block?.text;
                                if (text) {
                                    try {
                                        const uploadData = JSON.parse(text);
                                        const status = uploadData.status;
                                        const foundAssetId = uploadData.asset_id || uploadData.asset?.id;
                                        
                                        console.log(`[tts-weather-upload] Upload status: ${status}, asset_id: ${foundAssetId || 'pending'}`);
                                        
                                        if (foundAssetId) {
                                            assetId = foundAssetId;
                                            break;
                                        }
                                        
                                        if (status === 'errored') {
                                            throw new Error(`Upload failed with status: ${status}`);
                                        }
                                    } catch (parseError) {
                                        if (parseError instanceof Error && parseError.message.includes('Upload failed')) {
                                            throw parseError;
                                        }
                                        // Continue if parse error
                                    }
                                }
                            }
                            
                            if (assetId) break;
                            
                            if (attempt < maxAttempts) {
                                await new Promise(resolve => setTimeout(resolve, pollInterval));
                            }
                        } catch (error) {
                            console.warn(`[tts-weather-upload] Upload polling attempt ${attempt} failed:`, error);
                            if (attempt === maxAttempts) {
                                console.warn('[tts-weather-upload] Upload polling failed, continuing without asset_id');
                            } else {
                                await new Promise(resolve => setTimeout(resolve, pollInterval));
                            }
                        }
                    }
                }
            }

            // Get playback URL from asset status using asset_id
            let playbackUrl = '';
            let playbackId = '';
            
            if (assetId) {
                console.log('[tts-weather-upload] Polling asset status to get playback_id...');
                try {
                    const assetsTools = await assetsClient.getTools();
                    const getAsset = assetsTools['retrieve_video_assets'] || 
                                   assetsTools['get_video_assets'] ||
                                   assetsTools['video.assets.retrieve'] ||
                                   assetsTools['video.assets.get'];
                    
                    if (getAsset) {
                        // Poll asset status until ready
                        const maxAssetAttempts = 15;
                        const assetPollInterval = 4000;
                        
                        for (let attempt = 1; attempt <= maxAssetAttempts; attempt++) {
                            try {
                                console.log(`[tts-weather-upload] Polling asset attempt ${attempt}/${maxAssetAttempts}...`);
                                const assetResult = await getAsset.execute({ context: { ASSET_ID: assetId } });
                                const assetText = Array.isArray(assetResult) ? assetResult[0]?.text : String(assetResult);
                                
                                try {
                                    const assetData = JSON.parse(assetText);
                                    const assetStatus = assetData.status;
                                    const playbackIds = assetData.playback_ids;
                                    
                                    console.log(`[tts-weather-upload] Asset status: ${assetStatus}`);
                                    
                                    if (assetStatus === 'ready' && Array.isArray(playbackIds) && playbackIds.length > 0) {
                                        playbackId = playbackIds[0].id;
                                        playbackUrl = `https://stream.mux.com/${playbackId}.m3u8`;
                                        console.log(`[tts-weather-upload] Asset ready! Playback ID: ${playbackId}`);
                                        break;
                                    }
                                    
                                    if (assetStatus === 'errored') {
                                        console.warn('[tts-weather-upload] Asset processing failed');
                                        break;
                                    }
                                    
                                    if (attempt < maxAssetAttempts && ['preparing', 'processing'].includes(assetStatus)) {
                                        console.log(`[tts-weather-upload] Asset still ${assetStatus}, waiting...`);
                                        await new Promise(resolve => setTimeout(resolve, assetPollInterval));
                                    }
                                } catch (parseError) {
                                    console.warn(`[tts-weather-upload] Asset polling parse error:`, parseError);
                                    if (attempt < maxAssetAttempts) {
                                        await new Promise(resolve => setTimeout(resolve, assetPollInterval));
                                    }
                                }
                            } catch (error) {
                                console.warn(`[tts-weather-upload] Asset polling attempt ${attempt} failed:`, error);
                                if (attempt < maxAssetAttempts) {
                                    await new Promise(resolve => setTimeout(resolve, assetPollInterval));
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[tts-weather-upload] Asset polling failed:', error);
                }
            }

            // Clean up files if requested
            if (process.env.TTS_CLEANUP === 'true') {
                try {
                    await fs.unlink(resolve(audioPath));
                    await fs.unlink(resolve(videoPath));
                    console.log('[tts-weather-upload] Cleaned up local files');
                } catch {
                    // Ignore cleanup errors
                }
            }

            return {
                success: true,
                zipCode,
                uploadId,
                assetId,
                playbackId,
                playbackUrl,
                audioUrl: assetId ? `https://streamingportfolio.com/player?assetId=${assetId}` : undefined,
                localAudioFile: audioPath,
                localVideoFile: videoPath,
                audioSource, // Include source info
                message: `Weather audio for ZIP ${zipCode} uploaded successfully`,
            };

        } catch (error) {
            console.error(`[tts-weather-upload] Error:`, error);
            return {
                success: false,
                zipCode,
                error: error instanceof Error ? error.message : String(error),
                message: `Failed to create audio for ZIP ${zipCode}`,
            };
        }
    },
});

// ZIP resolver tool
const resolveZipTool = createTool({
    id: "resolve-zip",
    description: "Resolve city/state to 5-digit ZIP code",
    inputSchema: z.object({
        location: z.string().describe("City, State or ZIP code"),
    }),
    outputSchema: z.object({
        zipCode: z.string(),
        city: z.string(),
        state: z.string(),
    }),
    execute: async ({ context }) => {
        const location = String(context.location || '').trim();
        if (!location) throw new Error('Location is required');

        // If already a ZIP, validate it
        if (/^\d{5}$/.test(location)) {
            const response = await fetch(`https://api.zippopotam.us/us/${location}`);
            if (!response.ok) throw new Error(`Invalid ZIP: ${location}`);

            const data = await response.json();
            const place = data.places?.[0];
            return {
                zipCode: location,
                city: place?.["place name"] || 'Unknown',
                state: place?.["state abbreviation"] || '',
            };
        }

        // Try to resolve city/state to ZIP
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location + ', USA')}&format=json&limit=1`;
        const response = await fetch(url, {
            headers: { 'User-Agent': process.env.WEATHER_MCP_USER_AGENT || 'WeatherAgent/1.0' }
        });

        if (!response.ok) {
            throw new Error('Location lookup failed');
        }

        const results = await response.json();
        if (!Array.isArray(results) || results.length === 0) {
            throw new Error(`Could not find location: ${location}`);
        }

        const result = results[0];
        const address = result.address || {};
        const postcode = address.postcode?.slice(0, 5);

        if (!postcode || !/^\d{5}$/.test(postcode)) {
            throw new Error(`Could not determine ZIP for: ${location}`);
        }

        return {
            zipCode: postcode,
            city: address.city || address.town || 'Unknown',
            state: address.state_code || address.state || '',
        };
    },
});

// Main Weather Agent
export const weatherAgent = new Agent({
    name: "WeatherAgent",
    description: "Professional weather agent that provides forecasts and creates audio reports",
    instructions: `
    You are a professional weather broadcaster. Your goal is to provide clear, accurate weather information and create natural-sounding audio reports.

    PROCESS:
    1. If given a city/state, use resolve-zip to get the ZIP code first
    2. Use weatherTool to get current weather data
    3. Provide a comprehensive weather report
    4. When asked for audio, use ttsWeatherTool to create and upload the audio

    WEATHER REPORTS:
    - Start with current conditions for the specific location
    - Provide detailed 3-day forecast with temperatures, conditions, and wind
    - Include practical advice for clothing and activities
    - Use ALL weather data from the weatherTool response

    AUDIO GENERATION:
    - Keep audio scripts under 500 characters
    - Use natural, conversational language
    - Include city/state, today's highlights, tomorrow's outlook, and key temperatures
    - Speak slowly and clearly with simple words

    RESPONSE FORMAT:
    Always show weather details first, then mention generating audio, then show streaming URLs after upload completes.

    STREAMING URLS:
    After TTS upload completes, ALWAYS show BOTH streaming URLs in this exact format:

    🎵 **STREAMING AUDIO READY:**
    - **Audio Player**: https://streamingportfolio.com/player?assetId={ASSET_ID}
    - **Mux Stream**: https://stream.mux.com/{PLAYBACK_ID}.m3u8
    - Upload ID: {UPLOAD_ID} | Asset ID: {ASSET_ID}
    - These URLs are ready for streaming playback. The audio contains the weather summary in natural voice.

    CRITICAL: Both the StreamingPortfolio player URL and the Mux stream URL must be included in every successful audio response.

    Example audio script: "Good morning from San Francisco, California. Today expect partly cloudy skies with a high of 68 degrees. Light southwest winds at 8 miles per hour. Tonight, mostly clear with lows around 55. Tomorrow looks sunny with highs near 70. Perfect weather for outdoor activities. Drive safely!"
    `,
    model: anthropic("claude-3-5-haiku-latest"),
    tools: { resolveZipTool, weatherTool, ttsWeatherTool },
    memory: new Memory({
        storage: new InMemoryStore(),
        options: {
            lastMessages: 10,
            workingMemory: { enabled: true }
        }
    })
});

// Test wrapper for development
export const weatherAgentTestWrapper = {
    text: async ({ messages }: { messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> }) => {
        const lastMessage = messages[messages.length - 1]?.content || '';
        const zipMatch = lastMessage.match(/\b(\d{5})\b/);
        const wantsAudio = /\b(audio|tts|stream|upload|mux)\b/i.test(lastMessage);

        // Mock data for testing
        const mockCities: Record<string, string> = {
            '60601': 'Chicago, IL',
            '10001': 'New York, NY',
            '90210': 'Beverly Hills, CA',
            '94102': 'San Francisco, CA',
        };

        if (wantsAudio && zipMatch) {
            const zip = zipMatch[1];
            const city = mockCities[zip] || `ZIP ${zip}`;
            const mockAssetId = `NB83021TnUBoemuDiICOekyKq5wxblC2Kmv02JtU1nTLQ`;
            const mockPlaybackId = `sample123playback`;
            
            return {
                text: [
                    `**Weather for ${city}**`,
                    '**Today**: Partly cloudy, 75°F. Light winds from the northwest.',
                    '**Tonight**: Clear skies, low 58°F.',
                    '**Tomorrow**: Sunny, high 78°F.',
                    '',
                    'Generating audio report...',
                    '',
                    '🎵 **STREAMING AUDIO READY:**',
                    `- **Audio Player**: https://streamingportfolio.com/player?assetId=${mockAssetId}`,
                    `- **Mux Stream**: https://stream.mux.com/${mockPlaybackId}.m3u8`,
                    `- Upload ID: upload_${Math.random().toString(36).slice(2, 8)} | Asset ID: ${mockAssetId}`,
                    '- These URLs are ready for streaming playback. The audio contains the weather summary in natural voice.'
                ].join('\n')
            };
        }

        if (zipMatch) {
            const zip = zipMatch[1];
            const city = mockCities[zip] || `ZIP ${zip}`;
            
            return {
                text: [
                    `**Weather for ${city}**`,
                    '**Today**: Partly cloudy, 75°F. Light northwest winds.',
                    '**Tonight**: Clear, low 58°F.',
                    '**Tomorrow**: Sunny, high 78°F.',
                    '',
                    'Would you like me to create an audio version?'
                ].join('\n')
            };
        }

        return {
            text: 'I can provide weather information! Please share your ZIP code or city and state.'
        };
    }
};