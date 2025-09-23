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
import { existsSync } from 'fs';

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

// Generate TTS with Deepgram (fixed format parameters)
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

// Get a random background image from files/images/
async function getRandomBackgroundImage(): Promise<string> {
    const imagesDir = resolve('files/images');

    // Read directory and handle I/O errors
    let files: string[];
    try {
        files = await fs.readdir(imagesDir);
    } catch (error) {
        console.warn(`[getRandomBackground] Error reading images dir: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }

    // Filter for image files
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file));

    // If there are no image files, surface a clear error without catching it locally
    if (imageFiles.length === 0) {
        const msg = 'No image files found in files/images/';
        console.warn(`[getRandomBackground] ${msg}`);
        throw new Error(msg);
    }

    // Select random image
    const randomIndex = Math.floor(Math.random() * imageFiles.length);
    const selectedImage = imageFiles[randomIndex];
    const imagePath = resolve(imagesDir, selectedImage);

    // Verify file exists (and propagate any error)
    try {
        await fs.access(imagePath);
    } catch (error) {
        console.warn(`[getRandomBackground] Unable to access selected image: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }

    console.log(`[getRandomBackground] Selected: ${selectedImage}`);
    return imagePath;
}

// Improve text for more natural speech
function optimizeTextForSpeech(text: string): string {
    // Pre-normalize whitespace
    const pre = text.replace(/\s+/g, ' ').trim();

    // Convert numeric ZIP callouts like "zip 94102" to spoken-friendly
    const pronounceZip = (zip: string) =>
        zip.replace(/(\d)(?=\d)/g, '$1 ').trim(); // "94102" -> "9 4 1 0 2"

    let t = pre
        // Expand abbreviations and make more conversational
        .replace(/\bmph\b/gi, 'miles per hour')
        .replace(/\bF\b(?!\w)/g, 'degrees fahrenheit')
        .replace(/(\d+)\s*°\s*F/gi, '$1 degrees')
        .replace(/(\d+)\s*°/g, '$1 degrees')
        .replace(/(\d+)\s*degrees\s+fahrenheit/gi, '$1 degrees')

        // Direction abbreviations
        .replace(/\bN\b(?=\W|$)/g, 'north')
        .replace(/\bS\b(?=\W|$)/g, 'south')
        .replace(/\bE\b(?=\W|$)/g, 'east')
        .replace(/\bW\b(?=\W|$)/g, 'west')
        .replace(/\bNW\b/gi, 'northwest')
        .replace(/\bNE\b/gi, 'northeast')
        .replace(/\bSW\b/gi, 'southwest')
        .replace(/\bSE\b/gi, 'southeast')

        // Numbers and percentages
        .replace(/(\d+)%/g, '$1 percent')
        .replace(/\b(\d+)\s*-\s*(\d+)\b/g, '$1 to $2') // ranges like "65-70" become "65 to 70"

        // Weather terms for natural flow
        .replace(/\bpartly\s+cloudy\b/gi, 'partly cloudy skies')
        .replace(/\bmostly\s+sunny\b/gi, 'mostly sunny conditions')
        .replace(/\bmostly\s+cloudy\b/gi, 'mostly cloudy skies')
        .replace(/\bscattered\s+(?:thunder)?storms?\b/gi, 'scattered storms')
        .replace(/\bisolated\s+(?:thunder)?storms?\b/gi, 'isolated storms')

        // Time references
        .replace(/\btonight\b/gi, 'this evening')
        .replace(/\btomorrow\s+night\b/gi, 'tomorrow evening')

        // Add natural pauses and pacing
        .replace(/\.\s+/g, '. ')
        .replace(/,\s*/g, ', ')
        .replace(/:\s*/g, ': ')
        .replace(/;\s*/g, ', and ')

        // Make temperatures sound more natural
        .replace(/high\s+of\s+(\d+)/gi, 'high around $1')
        .replace(/low\s+of\s+(\d+)/gi, 'low around $1')
        .replace(/highs?\s+(\d+)/gi, 'highs around $1')
        .replace(/lows?\s+(\d+)/gi, 'lows around $1')

        // Wind descriptions
        .replace(/winds?\s+([^.]+?)\s+at\s+(\d+)/gi, '$1 winds at $2');

    // Speak ZIP codes naturally wherever explicitly mentioned
    t = t.replace(/\bzip\s*(?:code)?\s*(\d{5})\b/gi, (_m, z) => {
        return `zip code ${pronounceZip(z)}`;
    });
    // Also handle standalone 5-digit sequences that are clearly ZIP context like "for 94102" when preceded by "zip" earlier
    // If the original contained "ZIP" but this occurrence doesn't, still add spacing pronunciation hint
    if (/zip/i.test(pre)) {
        t = t.replace(/\b(\d{5})\b/g, (_m, z) => pronounceZip(z));
    }

    // Subtle SSML-like cues for TTS without using SSML: add ellipses for gentle pauses after openers
    t = t
        .replace(/\b(Good (morning|afternoon|evening)|Hello|Hi)\b/gi, (m) => `${m}...`)
        .replace(/\b(Now,? looking ahead|As for tonight|Looking ahead to tomorrow)\b/gi, (m) => `${m},`);

    // Normalize spacing
    t = t.replace(/\s+/g, ' ').trim();

    // Keep scripts comfortably short and flowing: split long commas into shorter sentences
    if (t.length > 520) {
        const parts = t.split(/,\s+/);
        let out = '';
        for (const p of parts) {
            if ((out + (out ? '. ' : '') + p).length <= 480) {
                out += (out ? '. ' : '') + p;
            } else {
                break;
            }
        }
        t = out || t.slice(0, 497) + '...';
    }

    return t;
}

// Enhanced ZIP code extraction that handles various formats
function extractZipCode(text: string): string | null {
    // Clean the input text
    const cleanText = text.replace(/[^\w\s-]/g, ' ').trim();

    // Try different ZIP code patterns
    const patterns = [
        /\b(\d{5})\b/,                    // Simple 5-digit
        /zip\s*:?\s*(\d{5})/i,           // "ZIP: 12345" or "zip 12345"
        /postal\s*:?\s*(\d{5})/i,        // "postal: 12345"
        /(\d{5})\s*-?\s*\d{4}/,          // ZIP+4 format, extract first 5
        /area\s*code\s*(\d{5})/i,        // "area code 12345"
        /location\s*:?\s*(\d{5})/i,      // "location: 12345"
        /\b(?:zip|zipcode|postal\s*code)\s*(?:is|=)?\s*(\d{5})\b/i, // "zip is 12345"
    ];

    for (const pattern of patterns) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
            const zip = match[1];
            if (/^\d{5}$/.test(zip)) {
                return zip;
            }
        }
    }

    return null;
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
        let { zipCode, text } = context;

        // Extract ZIP code if it's embedded in text or other formats
        if (!zipCode || !/^\d{5}$/.test(zipCode)) {
            const extractedZip = extractZipCode(String(zipCode ?? text ?? ''));
            if (extractedZip) {
                zipCode = extractedZip;
                console.log(`[tts-weather-upload] Extracted ZIP code: ${zipCode}`);
            } else {
                throw new Error(`Invalid ZIP code format: ${zipCode}. Please provide a 5-digit ZIP code.`);
            }
        }

        console.log(`[tts-weather-upload] Creating audio for ZIP ${zipCode}`);

        try {
            // Default weather text if none provided
            const defaultScript = `Hello from zip code ${zipCode}. Partly cloudy skies with a high around 72 degrees, a gentle southwest breeze near 8 miles per hour. This evening, mostly clear with lows around 58. Have a great day.`;
            const weatherText = text || defaultScript;

            // Optimize text for natural speech
            const speechText = optimizeTextForSpeech(weatherText);

            // Limit to 500 characters for TTS constraints
            const finalText = speechText.length > 500
                ? speechText.slice(0, 497) + '...'
                : speechText;

            console.log(`[tts-weather-upload] Speech text (${finalText.length} chars): "${finalText}"`);

            // Generate TTS audio
            let audioBuffer: Buffer;
            let audioSource = 'tts';

            if (process.env.DEEPGRAM_API_KEY) {
                try {
                    audioBuffer = await synthesizeWithDeepgramTTS(finalText);
                    console.log(`[tts-weather-upload] TTS successful with Deepgram`);
                } catch (error) {
                    console.warn(`[tts-weather-upload] TTS failed: ${error instanceof Error ? error.message : String(error)}`);
                    console.warn('[tts-weather-upload] Using test tone as fallback');

                    // Create a proper test tone WAV file
                    audioBuffer = createTestToneWAV(3, 440); // 3 second tone at 440Hz
                    audioSource = 'fallback';
                }
            } else {
                console.warn('[tts-weather-upload] DEEPGRAM_API_KEY not configured. Using test tone as fallback');

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

            // Get random background image
            let finalImagePath: string;

            try {
                finalImagePath = await getRandomBackgroundImage();
                console.log(`[tts-weather-upload] Using background image: ${finalImagePath}`);
            } catch {
                // Create simple colored background as fallback
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
                console.error('Mux upload tool not available');
                return {
                    success: false,
                    zipCode,
                    error: 'Mux upload tool not available',
                    message: 'Failed to initiate upload with Mux'
                };
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
                console.error('No upload URL received from Mux');
                return {
                    success: false,
                    zipCode,
                    error: 'No upload URL received from Mux',
                    message: 'Mux did not return an upload URL'
                };
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
                // Body must be a Web-compatible type for fetch; convert Buffer to Uint8Array
                body: new Uint8Array(videoBuffer),
            });

            if (!uploadResponse.ok) {
                console.error(`Upload failed: ${uploadResponse.status}`);
                return {
                    success: false,
                    zipCode,
                    error: `Upload failed: ${uploadResponse.status}`,
                    message: 'Mux upload request failed'
                };
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

                    let stopPollingUpload = false;
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
                                            console.warn(`[tts-weather-upload] Upload failed with status: ${status}`);
                                            stopPollingUpload = true;
                                            break;
                                        }
                                    } catch (parseError) {
                                        if (parseError instanceof Error && parseError.message.includes('Upload failed')) {
                                            console.warn(`[tts-weather-upload] Upload error encountered: ${parseError.message}`);
                                            stopPollingUpload = true;
                                            break;
                                        }
                                        // Continue if parse error
                                    }
                                }
                            }

                            if (assetId || stopPollingUpload) break;

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

        // Enhanced ZIP extraction
        const extractedZip = extractZipCode(location);
        if (extractedZip) {
            const response = await fetch(`https://api.zippopotam.us/us/${extractedZip}`);
            if (!response.ok) throw new Error(`Invalid ZIP: ${extractedZip}`);

            const data = await response.json();
            const place = data.places?.[0];
            return {
                zipCode: extractedZip,
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
    - Keep audio scripts under 750 characters
    - Use natural, conversational language with smooth flow
    - Include location name, today's highlights, tomorrow's outlook, and key temperatures
    - Write like a friendly broadcaster: "Good morning from..." or "Hello from..."
    - Use transitions like "Now, looking ahead to tomorrow..." or "As for tonight..."

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

    Example natural audio script: "Good morning from beautiful San Francisco, California. Today we're looking at partly cloudy skies with a high around 68 degrees. Southwest winds at a gentle 8 miles per hour. Tonight, expect mostly clear conditions with lows around 55. Looking ahead to tomorrow, sunny skies return with highs near 70. Perfect weather for getting outdoors. Stay safe and have a wonderful day!"
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

// Configure FFmpeg path robustly
(function configureFfmpeg() {
    // ffmpeg-static can be string | null depending on platform
    const bin = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;

    // Fallbacks to common system locations (Alpine and Debian/Ubuntu images)
    const candidates = [
        bin,
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/bin/ffmpeg'
    ].filter(Boolean) as string[];

    const found = candidates.find(p => {
        try {
            return existsSync(p);
        } catch {
            return false;
        }
    });

    if (found) {
        ffmpeg.setFfmpegPath(found);
        console.log(`[ffmpeg] Using ffmpeg at: ${found}`);
    } else {
        console.warn('[ffmpeg] No ffmpeg binary found. Video features will fail until ffmpeg is available.');
    }
})();

// Test wrapper for development
export const weatherAgentTestWrapper = {
    text: async ({ messages }: { messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> }) => {
        const lastMessage = messages[messages.length - 1]?.content || '';

        // Enhanced ZIP extraction for testing
        const extractedZip = extractZipCode(lastMessage);
        const wantsAudio = /\b(audio|tts|stream|upload|mux)\b/i.test(lastMessage);

        // Mock data for testing
        const mockCities: Record<string, string> = {
            '60601': 'Chicago, IL',
            '10001': 'New York, NY',
            '90210': 'Beverly Hills, CA',
            '94102': 'San Francisco, CA',
        };

        if (wantsAudio && extractedZip) {
            const city = mockCities[extractedZip] || `ZIP ${extractedZip}`;
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

        if (extractedZip) {
            const city = mockCities[extractedZip] || `ZIP ${extractedZip}`;

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