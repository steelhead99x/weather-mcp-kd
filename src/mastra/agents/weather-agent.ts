import 'dotenv/config';
import { Agent } from "@mastra/core";
import { anthropic } from "@ai-sdk/anthropic";
import { weatherTool } from "../tools/weather";
import { promises as fs } from 'fs';
import { resolve, dirname, join } from 'path';
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client';
import { muxMcpClient as assetsClient } from '../mcp/mux-assets-client';

// Pre-warm MCP on module load (non-blocking, best-effort) - DISABLED to prevent overload
// (async () => {
//     try {
//         await Promise.race([
//             Promise.allSettled([uploadClient.getTools(), assetsClient.getTools()]),
//             new Promise((_, rej) => {
//     const ms = Math.max(5000, parseInt(process.env.MUX_PREWARM_TIMEOUT_MS || '8000', 10) || 8000);
//     setTimeout(() => rej(new Error('prewarm-timeout')), ms);
//   })
//         ]);
//     } catch { /* ignore */ }
// })();
import { Memory } from "@mastra/memory";
import { InMemoryStore } from "@mastra/core/storage";
import ffmpeg from 'fluent-ffmpeg';
import { existsSync } from 'fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Type definitions for better type safety
interface WeatherForecast {
    name: string;
    temperature: number;
    temperatureUnit: string;
    windSpeed: string;
    windDirection: string;
    shortForecast: string;
    detailedForecast: string;
}

interface WeatherLocation {
    displayName: string;
    latitude: number;
    longitude: number;
}

interface WeatherData {
    location: WeatherLocation;
    forecast: WeatherForecast[];
}

interface MuxUploadResponse {
    upload_id?: string;
    id?: string;
    upload?: { id: string };
    url?: string;
    asset_id?: string;
    asset?: { id: string };
}

interface MuxAssetResponse {
    status: string;
    playback_ids?: Array<{ id: string }>;
}

interface MuxResult {
    assetId?: string;
    playbackId?: string;
    hlsUrl?: string;
    playerUrl?: string;
    error?: string;
}

interface TTSWeatherResult {
    success: boolean;
    zipCode: string;
    summaryText?: string;
    localAudioFile?: string;
    localVideoFile?: string;
    mux?: MuxResult;
    playbackUrl?: string;
    playerUrl?: string;
    assetId?: string;
    playbackId?: string;
    error?: string;
    message?: string;
}

const execFileAsync = promisify(execFile);

// Configurable URLs with environment variable support
const MUX_HLS_BASE_URL = process.env.MUX_HLS_BASE_URL || 'https://stream.mux.com';
const STREAMING_PORTFOLIO_BASE_URL = process.env.STREAMING_PORTFOLIO_BASE_URL || 'https://streamingportfolio.com';

// Configure FFmpeg path: prefer system ffmpeg in container (/usr/bin/ffmpeg) to avoid glibc mismatch
(function configureFfmpeg() {
    const candidates = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',  // Homebrew on Apple Silicon
        '/bin/ffmpeg',
    ].filter(Boolean) as string[];

    // Also check for Homebrew Intel installations
    try {
        const { execSync } = require('child_process');
        const homebrewPrefix = execSync('brew --prefix', { encoding: 'utf8', timeout: 5000 }).trim();
        if (homebrewPrefix) {
            candidates.push(`${homebrewPrefix}/bin/ffmpeg`);
        }
    } catch {
        // Ignore if brew command fails
    }

    const found = candidates.find(p => {
        try { return existsSync(p); } catch { return false; }
    });

    if (found) {
        ffmpeg.setFfmpegPath(found);
        console.log(`[ffmpeg] Using ffmpeg at: ${found}`);
    } else {
        console.warn('[ffmpeg] No ffmpeg binary found in expected locations. Video features may fail.');
        console.warn('[ffmpeg] Searched paths:', candidates);
    }
})();

// Log ffmpeg version once at startup to verify runtime binary
(async () => {
    try {
        const { stdout } = await execFileAsync('ffmpeg', ['-version']);
        console.log('[ffmpeg] Version:\n' + stdout.split('\n').slice(0, 3).join('\n'));
    } catch (e) {
        console.warn('[ffmpeg] Unable to run ffmpeg -version:', e instanceof Error ? e.message : String(e));
    }
})();

// Create video from audio and image
async function createVideoFromAudioAndImage(
    audioPath: string,
    imagePath: string,
    outputPath: string
): Promise<void> {
    return new Promise((resolvePromise, reject) => {
        ffmpeg()
            .input(imagePath)
            .inputOptions(['-loop 1'])
            .input(audioPath)
            .audioCodec('aac')
            .videoCodec('libx264')
            .outputOptions([
                '-b:a 128k',
                '-pix_fmt yuv420p',
                '-shortest',
                '-movflags +faststart',
            ])
            .output(outputPath)
            .on('start', (cmd: string) => console.log(`[createVideo] FFmpeg: ${cmd}`))
            .on('stderr', (line: string) => console.log(`[createVideo][stderr] ${line}`))
            .on('end', () => resolvePromise())
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
    if (!apiKey) {
        throw new Error('DEEPGRAM_API_KEY not set in environment');
    }
    const model = process.env.DEEPGRAM_TTS_MODEL || process.env.DEEPGRAM_VOICE || 'aura-asteria-en';
    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', model);
    url.searchParams.set('encoding', 'linear16');

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
        } as any,
        body: JSON.stringify({ text })
    } as any);

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Deepgram TTS failed (${res.status}): ${errText}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
}

// Get a random background image from files/images/
async function getRandomBackgroundImage(): Promise<string> {
    const imagesDir = resolve('files/images');
    try {
        const items = await fs.readdir(imagesDir, { withFileTypes: true });
        const allowed = ['.png', '.jpg', '.jpeg'];
        const choices = items
            .filter(e => e.isFile())
            .map(e => join(imagesDir, e.name))
            .filter(p => allowed.some(ext => p.toLowerCase().endsWith(ext)));
        if (!choices.length) {
            console.warn('No images found in background directory');
            throw new Error('No images found');
        }
        const idx = Math.floor(Math.random() * choices.length);
        return choices[idx]!;
    } catch (e) {
        console.warn('Background image access failed:', e instanceof Error ? e.message : String(e));
        throw new Error('No background image available');
    }
}

// Provide a bundled fallback background image
async function getFallbackBackgroundPng(): Promise<string> {
    const bundled = resolve('files/images/fallback-bg.png');
    try {
        await fs.access(bundled);
        // Validate that it's a non-empty PNG (signature check)
        const fd = await fs.open(bundled, 'r');
        try {
            const { size } = await fd.stat();
            if (size < 8) throw new Error('fallback image too small');
            const sig = Buffer.alloc(8);
            await fd.read(sig, 0, 8, 0);
            const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            if (!sig.equals(pngSig)) throw new Error('fallback image invalid signature');
            return bundled;
        } finally {
            await fd.close();
        }
    } catch {
        console.warn('Bundled fallback background missing or invalid, creating minimal PNG');
        const out = resolve('/tmp/fallback-bg.png');
        await fs.mkdir(dirname(out), { recursive: true });
        const tinyPng = Buffer.from(
            '89504E470D0A1A0A0000000D4948445200000001000000010806000000' +
            '1F15C4890000000A49444154789C6360000002000150A0A4' +
            '1B0000000049454E44AE426082', 'hex'
        );
        await fs.writeFile(out, tinyPng);
        return out;
    }
}

// Pronounce ZIP digits clearly as spaced digits
function speakZip(zip: string): string {
    return zip.split('').join(' ');
}

// Build agriculture-focused, clear speech from forecast
function buildAgriSpeechFromForecast(zip: string, weatherData: WeatherData): string {
    const loc = weatherData?.location?.displayName || 'your area';
    const fc = Array.isArray(weatherData?.forecast) ? weatherData.forecast : [];
    const today = fc[0];
    const tonightOrNext = fc[1];
    const tomorrow = fc[2];

    const sayZip = speakZip(zip);

    // Helper to simplify wind
    const windPhrase = (p: WeatherForecast) => {
        if (!p?.windSpeed) return '';
        return `Winds ${String(p.windSpeed).replace(/\s+/g, ' ')} ${p.windDirection || ''}`.trim() + '.';
    };

    const parts: string[] = [];
    parts.push(`Agriculture weather for ${loc}. ZIP ${sayZip}.`);

    if (today) {
        parts.push(`${today.name}: ${today.shortForecast.toLowerCase()}. Temperature around ${today.temperature} degrees ${today.temperatureUnit}. ${windPhrase(today)}`);
    }
    if (tonightOrNext) {
        parts.push(`${tonightOrNext.name}: ${tonightOrNext.shortForecast.toLowerCase()}. Near ${tonightOrNext.temperature} degrees ${tonightOrNext.temperatureUnit}.`);
    }
    if (tomorrow) {
        parts.push(`Looking to ${tomorrow.name.toLowerCase()}: ${tomorrow.shortForecast.toLowerCase()}, about ${tomorrow.temperature} degrees ${tomorrow.temperatureUnit}.`);
    }

    // Simple ag guidance (temp-focused). In a real system, add precip/soil moisture/evapotranspiration.
    const ref = today || tomorrow || tonightOrNext;
    if (ref) {
        const t = ref.temperature;
        if (typeof t === 'number') {
            if (t >= 90) {
                parts.push(`Advice: Plan irrigation and avoid mid-day transplanting. Schedule field work early morning or evening to reduce heat stress on crops and livestock.`);
            } else if (t >= 80) {
                parts.push(`Advice: Monitor crop water needs and consider light irrigation. Midday heat can stress tender plants—shade where possible.`);
            } else if (t >= 60) {
                parts.push(`Advice: Good window for planting, pruning, and spraying if winds are calm. Watch for rapid drying in full sun.`);
            } else if (t >= 40) {
                parts.push(`Advice: Cool conditions. Protect sensitive seedlings overnight. Consider row covers for warmth retention.`);
            } else {
                parts.push(`Advice: Cold conditions. Protect frost–sensitive crops and ensure livestock shelter and water supply remain unfrozen.`);
            }
        }
    }

    parts.push(`Check back before spraying or harvesting—conditions can shift quickly.`);
    return parts.join(' ');
}

// Upload local file to Mux direct upload URL (PUT)
async function putFileToMux(uploadUrl: string, filePath: string): Promise<void> {
    const fileBuffer = await fs.readFile(filePath);
    const fileSize = fileBuffer.length;
    const copy = new Uint8Array(fileBuffer);
    const fileAB = copy.buffer;

    // Retry with exponential backoff for transient failures/timeouts
    const maxAttempts = Math.max(3, parseInt(process.env.MUX_UPLOAD_RETRY_ATTEMPTS || '5', 10) || 5);
    const baseDelay = Math.max(500, parseInt(process.env.MUX_UPLOAD_RETRY_BASE_MS || '1000', 10) || 1000);

    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutMs = Math.max(60_000, parseInt(process.env.MUX_PUT_TIMEOUT_MS || '120000', 10) || 120000);
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': fileSize.toString(),
                },
                body: new Blob([fileAB], { type: 'application/octet-stream' }),
                signal: controller.signal,
            } as any);

            clearTimeout(timeout);

            if (!res.ok) {
                const t = await res.text().catch(() => '');
                // Retry on 5xx or 429; fail fast on 4xx (except 429)
                if (res.status >= 500 || res.status === 429) {
                    throw new Error(`Mux PUT transient error: ${res.status} ${res.statusText} ${t}`);
                }
                throw new Error(`Mux PUT failed: ${res.status} ${res.statusText} ${t}`);
            }

            // Drain body if present to allow keep-alive reuse
            await res.text().catch(() => '');
            return;
        } catch (e) {
            lastErr = e;
            const msg = e instanceof Error ? e.message : String(e);
            const isAbort = msg.toLowerCase().includes('aborted');
            const isNetwork = /network|fetch|timed?out|socket|ecconnreset|econnrefused|etimedout|eai_again/i.test(msg);
            const shouldRetry = isAbort || isNetwork || /transient/i.test(msg);
            if (attempt < maxAttempts && shouldRetry) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.warn(`[mux-upload] PUT attempt ${attempt} failed (${msg}). Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            break;
        }
    }
    throw new Error(lastErr instanceof Error ? lastErr.message : String(lastErr));
}

// Asset polling mutex to prevent race conditions
const assetPollingMutex = new Map<string, Promise<any>>();

// Poll Mux asset until ready, return HLS and player URLs
async function waitForMuxAssetReady(assetId: string, {
    pollMs = Math.max(1000, parseInt(process.env.MUX_VERIFY_POLL_MS || '5000', 10) || 5000),
    timeoutMs = Math.min(30 * 60 * 1000, Math.max(10_000, parseInt(process.env.MUX_VERIFY_TIMEOUT_MS || '300000', 10) || 300000)),
}: { pollMs?: number; timeoutMs?: number } = {}) {
    
    // Check if this asset is already being polled
    if (assetPollingMutex.has(assetId)) {
        console.log(`[waitForMuxAssetReady] Asset ${assetId} already being polled, waiting for existing poll...`);
        return await assetPollingMutex.get(assetId);
    }
    
    // Create new polling promise
    const pollingPromise = performAssetPolling(assetId, { pollMs, timeoutMs });
    assetPollingMutex.set(assetId, pollingPromise);
    
    try {
        const result = await pollingPromise;
        return result;
    } finally {
        // Clean up mutex entry
        assetPollingMutex.delete(assetId);
    }
}

async function performAssetPolling(assetId: string, {
    pollMs,
    timeoutMs,
}: { pollMs: number; timeoutMs: number }): Promise<{
    status: string;
    playbackId?: string;
    hlsUrl?: string;
    playerUrl: string;
    asset: MuxAssetResponse;
    assetId: string;
}> {
    const tools = await assetsClient.getTools();
    const getAsset =
        tools['get_video_assets'] ||
        tools['retrieve_video_assets'] ||
        tools['video.assets.get'] ||
        tools['video.assets.retrieve'];
    if (!getAsset) throw new Error('Mux assets client has no retrieval tool');

    const start = Date.now();
    let lastPayload: MuxAssetResponse | { raw: string };
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await getAsset.execute({ context: { ASSET_ID: assetId } });
            const text = Array.isArray(res) ? (res[0] as any)?.text ?? '' : String(res ?? '');
            try { 
                lastPayload = JSON.parse(text) as MuxAssetResponse; 
                consecutiveErrors = 0; // Reset error counter on successful parse
            } catch { 
                lastPayload = { raw: text }; 
                consecutiveErrors++;
            }
            
            // Type guard to check if lastPayload is a valid MuxAssetResponse
            if ('raw' in lastPayload) {
                // Skip raw responses that couldn't be parsed
                continue;
            }
            
            const status = lastPayload?.status as string | undefined;
            if (status === 'ready' && 'playback_ids' in lastPayload) {
                const playbackId = Array.isArray(lastPayload.playback_ids) && lastPayload.playback_ids.length > 0
                    ? (lastPayload.playback_ids[0]?.id as string | undefined)
                    : undefined;
                return {
                    status,
                    playbackId,
                    hlsUrl: playbackId ? `${MUX_HLS_BASE_URL}/${playbackId}.m3u8` : undefined,
                    playerUrl: `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`,
                    asset: lastPayload,
                    assetId,
                };
            }
            if (status === 'errored') {
                throw new Error(`Mux asset errored: ${JSON.stringify(lastPayload)}`);
            }
            
            // If we have too many consecutive errors, fail fast
            if (consecutiveErrors >= maxConsecutiveErrors) {
                throw new Error(`Too many consecutive errors (${consecutiveErrors}) polling asset ${assetId}`);
            }
            
        } catch (e) {
            consecutiveErrors++;
            console.warn(`[performAssetPolling] Error polling asset ${assetId} (attempt ${consecutiveErrors}):`, e instanceof Error ? e.message : String(e));
            
            // If we have too many consecutive errors, fail fast
            if (consecutiveErrors >= maxConsecutiveErrors) {
                throw new Error(`Too many consecutive errors (${consecutiveErrors}) polling asset ${assetId}: ${e instanceof Error ? e.message : String(e)}`);
            }
            
            // transient errors: jitter then continue
            await new Promise(r => setTimeout(r, Math.min(2000, pollMs)));
        }
        await new Promise(r => setTimeout(r, pollMs));
    }
    throw new Error(`Timeout waiting for Mux asset ${assetId} to be ready after ${timeoutMs}ms`);
}

// Connection management and rate limiting
let activeConnections = 0;
const MAX_CONCURRENT_CONNECTIONS = 2; // Reduced to prevent overload
const connectionQueue: Array<() => void> = [];
const CONNECTION_TIMEOUT = 30000; // 30 seconds timeout

async function acquireConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
        let timeoutId: NodeJS.Timeout | null = null;
        
        try {
            if (activeConnections < MAX_CONCURRENT_CONNECTIONS) {
                activeConnections++;
                resolve();
                return;
            }
            
            // Add timeout to prevent hanging
            timeoutId = setTimeout(() => {
                reject(new Error('Connection acquisition timeout - system overloaded'));
            }, CONNECTION_TIMEOUT);
            
            connectionQueue.push(() => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                activeConnections++;
                resolve();
            });
        } catch (error) {
            // Cleanup on error
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            reject(error);
        }
    });
}

function releaseConnection(): void {
    try {
        activeConnections--;
        if (connectionQueue.length > 0) {
            const next = connectionQueue.shift();
            if (next) {
                try {
                    next();
                } catch (error) {
                    console.error('[releaseConnection] Error executing queued connection:', error);
                    // Continue processing other queued connections
                    if (connectionQueue.length > 0) {
                        const nextNext = connectionQueue.shift();
                        if (nextNext) nextNext();
                    }
                }
            }
        }
    } catch (error) {
        console.error('[releaseConnection] Error releasing connection:', error);
    }
}

// Weather-to-tts-and-upload tool
const ttsWeatherTool = createTool({
    id: "tts-weather-upload",
    description: "Convert weather report to agriculture-focused audio, create a simple video, upload to Mux, and return a streaming URL. When using this tool, say 'please wait one minute while i generate your visual weather forecast' before processing.",
    inputSchema: z.object({
        zipCode: z.string().describe("5-digit ZIP code"),
        text: z.string().optional().describe("Optional custom text. If omitted, a natural agriculture forecast will be generated."),
    }),
    execute: async ({ context }) => {
        await acquireConnection();
        let zip = '';
        try {
            let { zipCode, text } = context as { zipCode?: string; text?: string };

            zip = String(zipCode || '').trim();
            if (!/^\d{5}$/.test(zip)) {
                return {
                    success: false,
                    zipCode: zip,
                    message: 'Please provide a valid 5-digit ZIP code.'
                };
            }
            // Build agriculture-focused speech if custom text not provided
            let finalText = (text || '').trim();
            let weatherData: any = null;

            if (!finalText) {
                weatherData = await weatherTool.execute({ context: { zipCode: zip } } as any);
                finalText = buildAgriSpeechFromForecast(zip, weatherData);
            } else {
                // If user provides text, still ensure we clearly say the ZIP for audio clarity
                finalText = `For ZIP ${speakZip(zip)}. ${finalText}`;
            }

            // Synthesize TTS (Deepgram)
            const audioBuffer = await synthesizeWithDeepgramTTS(finalText);

            // Temp paths
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const baseDir = process.env.TTS_TMP_DIR || '/tmp/tts';
            const audioPath = join(baseDir, `weather-${timestamp}-${zip}.wav`);
            const videoPath = join(baseDir, `weather-${timestamp}-${zip}.mp4`);

            await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });
            await fs.writeFile(resolve(audioPath), audioBuffer);
            console.log(`[tts-weather-upload] Audio saved: ${audioPath} (${audioBuffer.length} bytes)`);

            // Background image or fallback
            let finalImagePath: string;
            try {
                finalImagePath = await getRandomBackgroundImage();
                console.log(`[tts-weather-upload] Using background image: ${finalImagePath}`);
            } catch {
                finalImagePath = await getFallbackBackgroundPng();
                console.log(`[tts-weather-upload] Using fallback background: ${finalImagePath}`);
            }

            console.log(`[tts-weather-upload] Creating video...`);
            await createVideoFromAudioAndImage(
                resolve(audioPath),
                finalImagePath,
                resolve(videoPath)
            );
            console.log(`[tts-weather-upload] Video created: ${videoPath}`);

            // Upload to Mux and get streaming URLs
            let mux: any = null;
            let playbackUrl: string | undefined;
            let playerUrl: string | undefined;
            let assetId: string | undefined;
            let playbackId: string | undefined;

            try {
                if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {

                    // Skip pre-warming to prevent connection overload

                    const uploadTools = await uploadClient.getTools();
                    let create = uploadTools['create_video_uploads'] || uploadTools['video.uploads.create'];
                    if (!create) throw new Error('Mux MCP missing upload tool');

                    const playbackPolicy = (process.env.MUX_SIGNED_PLAYBACK === 'true' || process.env.MUX_PLAYBACK_POLICY === 'signed') ? 'signed' : 'public';
                    const createArgs: any = {
                        cors_origin: process.env.MUX_CORS_ORIGIN || 'http://localhost',
                        new_asset_settings: { playback_policies: [playbackPolicy] },
                    };
                    if (process.env.MUX_UPLOAD_TEST === 'true') createArgs.test = true;

                    console.log('[tts-weather-upload] Calling Mux MCP with args:', JSON.stringify(createArgs, null, 2));
                    
                    let createRes;
                    try {
                        createRes = await create.execute({ context: createArgs });
                    } catch (mcpError) {
                        console.error('[tts-weather-upload] First MCP call failed:', mcpError);
                        
                        // Try alternative argument format - direct args without context wrapper
                        console.log('[tts-weather-upload] Trying alternative argument format...');
                        try {
                            createRes = await create.execute(createArgs);
                        } catch (mcpError2) {
                            console.error('[tts-weather-upload] Second MCP call failed:', mcpError2);
                            
                            // Try with simplified args
                            console.log('[tts-weather-upload] Trying simplified argument format...');
                            const simplifiedArgs = {
                                cors_origin: 'http://localhost',
                                new_asset_settings: { playback_policies: ['public'] }
                            };
                            createRes = await create.execute({ context: simplifiedArgs });
                        }
                    }
                    const blocks = Array.isArray(createRes) ? createRes : [createRes];
                    let uploadId: string | undefined;
                    let uploadUrl: string | undefined;
                    for (const b of blocks as any[]) {
                        const t = b && typeof b === 'object' && typeof b.text === 'string' ? b.text : undefined;
                        if (!t) continue;
                        try {
                            const payload = JSON.parse(t);
                            uploadId = uploadId || payload.upload_id || payload.id || payload.upload?.id;
                            uploadUrl = uploadUrl || payload.url || payload.upload?.url;
                            assetId = assetId || payload.asset_id || payload.asset?.id;
                        } catch (parseError) {
                            console.warn('[tts-weather-upload] Failed to parse Mux response:', parseError instanceof Error ? parseError.message : String(parseError));
                        }
                    }
                    if (!uploadUrl) throw new Error('No upload URL from Mux');

                    await putFileToMux(uploadUrl, resolve(videoPath));

                    // Robustly retrieve assetId by polling the upload record if missing
                    if (!assetId && uploadId) {
                        const retrieve = uploadTools['retrieve_video_uploads'] || uploadTools['video.uploads.get'];
                        if (retrieve) {
                            const attempts = Math.max(5, parseInt(process.env.MUX_RETRIEVE_RETRY_ATTEMPTS || '8', 10) || 8);
                            const base = Math.max(500, parseInt(process.env.MUX_RETRIEVE_RETRY_BASE_MS || '1000', 10) || 1000);
                            for (let i = 1; i <= attempts && !assetId; i++) {
                                try {
                                    const r = await retrieve.execute({
                                        context: {
                                            UPLOAD_ID: uploadId,
                                        }
                                    });
                                    const rb = Array.isArray(r) ? r : [r];
                                    for (const b of rb as any[]) {
                                        const t = b && typeof b === 'object' && typeof b.text === 'string' ? b.text : undefined;
                                        if (!t) continue;
                                        try {
                                            const payload = JSON.parse(t);
                                            const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : payload;
                                            const up = (data && typeof data === 'object' && 'upload' in data) ? (data as any).upload : data;
                                            assetId = assetId || up.asset_id || up.assetId || up.asset?.id;
                                            if (assetId) break;
                                        } catch (parseError) {
                                            console.warn('[tts-weather-upload] Failed to parse asset retrieval response:', parseError instanceof Error ? parseError.message : String(parseError));
                                        }
                                    }
                                } catch (retrieveError) {
                                    console.warn('[tts-weather-upload] Asset retrieval attempt failed:', retrieveError instanceof Error ? retrieveError.message : String(retrieveError));
                                }
                                if (!assetId) {
                                    const delay = base * Math.pow(1.5, i - 1);
                                    await new Promise(r => setTimeout(r, delay));
                                }
                            }
                            // Secondary timed poll (ensures we don't stop early)
                            if (!assetId) {
                                const pollMs = Math.max(2000, parseInt(process.env.MUX_RETRIEVE_POLL_MS || '5000', 10) || 5000);
                                const timeoutMs = Math.min(10 * 60 * 1000, Math.max(20_000, parseInt(process.env.MUX_RETRIEVE_TIMEOUT_MS || '180000', 10) || 180000));
                                const start = Date.now();
                                while (!assetId && (Date.now() - start) < timeoutMs) {
                                    try {
                                        const r = await retrieve.execute({
                                            context: {
                                                UPLOAD_ID: uploadId,
                                            }
                                        });
                                        const rb = Array.isArray(r) ? r : [r];
                                        for (const b of rb as any[]) {
                                            const t = b && typeof b === 'object' && typeof b.text === 'string' ? b.text : undefined;
                                            if (!t) continue;
                                        try {
                                            const payload = JSON.parse(t);
                                            const data = (payload && typeof payload === 'object' && 'data' in payload) ? (payload as any).data : payload;
                                            const up = (data && typeof data === 'object' && 'upload' in data) ? (data as any).upload : data;
                                            assetId = assetId || up.asset_id || up.assetId || up.asset?.id;
                                            if (assetId) break;
                                        } catch (parseError) {
                                            console.warn('[tts-weather-upload] Failed to parse secondary asset retrieval response:', parseError instanceof Error ? parseError.message : String(parseError));
                                        }
                                    }
                                } catch (retrieveError) {
                                    console.warn('[tts-weather-upload] Secondary asset retrieval attempt failed:', retrieveError instanceof Error ? retrieveError.message : String(retrieveError));
                                }
                                    if (!assetId) await new Promise(r => setTimeout(r, pollMs));
                                }
                            }
                        }
                    }

                    if (!assetId) throw new Error('No asset_id after upload');

                    // Build player URL immediately from assetId (always provide)
                    playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;

                    // Poll until ready for HLS URL
                    const ready = await waitForMuxAssetReady(assetId);
                    playbackUrl = ready.hlsUrl;
                    playbackId = ready.playbackId || undefined;

                    mux = {
                        assetId,
                        playbackId,
                        hlsUrl: playbackUrl,
                        playerUrl,
                    };
                } else {
                    mux = { error: 'Mux credentials missing. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.' };
                }
            } catch (e) {
                console.warn('[tts-weather-upload] Mux upload failed/skipped:', e instanceof Error ? e.message : String(e));
                mux = { error: e instanceof Error ? e.message : String(e) };
            }

            // Cleanup
            if (process.env.TTS_CLEANUP === 'true') {
                try { 
                    await fs.unlink(resolve(audioPath)); 
                    console.log('[tts-weather-upload] Cleaned up audio file:', audioPath);
                } catch (cleanupError) {
                    console.warn('[tts-weather-upload] Failed to cleanup audio file:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
                }
                try { 
                    await fs.unlink(resolve(videoPath)); 
                    console.log('[tts-weather-upload] Cleaned up video file:', videoPath);
                } catch (cleanupError) {
                    console.warn('[tts-weather-upload] Failed to cleanup video file:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
                }
                console.log('[tts-weather-upload] Cleanup completed');
            }

            // Always include playerUrl if we know assetId
            if (!playerUrl && assetId) {
                playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
            }

            return {
                success: true,
                zipCode: zip,
                summaryText: finalText,
                localAudioFile: audioPath,
                localVideoFile: videoPath,
                mux,
                playbackUrl,
                playerUrl,
                assetId,
                playbackId,
            };

        } catch (error) {
            console.error(`[tts-weather-upload] Error:`, error);
            return {
                success: false,
                zipCode: zip,
                error: error instanceof Error ? error.message : String(error),
                message: `Failed to create audio for ZIP ${zip}`,
            };
        } finally {
            releaseConnection();
        }
    },
});

function buildSystemPrompt() {
    return [
        'You are a helpful, natural-sounding, agriculture-focused weather assistant.',
        'If the user asks about weather without a ZIP code, kindly ask for a 5-digit ZIP code.',
        'Keep responses clear and conversational. When generating TTS, speak ZIP code digits clearly.',
        'Offer practical farm and field guidance tied to conditions (planting, irrigation, spraying, frost, livestock).',
        'IMPORTANT: When offering to create audio/visual weather forecasts, NEVER say "Would you like me to generate an audio forecast with these details?". Instead, always say "please wait one minute while i generate your visual weather forecast" and then immediately use the ttsWeatherTool.',
    ].join(' ');
}

export const weatherAgent = new Agent({
    name: 'weatherAgent',
    description: 'Provides agriculture-focused weather info for ZIP codes and generates a clear, natural TTS video uploaded to Mux with a streaming URL.',
    instructions: buildSystemPrompt(),
    model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'),
    tools: {
        weatherTool,
        ttsWeatherTool,
    },
    memory: new Memory({
        storage: new InMemoryStore(),
    }) as any,
});

// Extract a 5-digit ZIP and optional quoted text
function extractZipAndQuotedText(messages: Array<{ role: string; content: string }>) {
    const zipMatches: string[] = [];
    let quoted: string | undefined;

    for (const m of messages) {
        const content = String(m?.content || '');
        const zips = content.match(/\b(\d{5})(?:-\d{4})?\b/g) || [];
        for (const z of zips) {
            const zip5 = z.slice(0, 5);
            if (/^\d{5}$/.test(zip5)) zipMatches.push(zip5);
        }
        if (!quoted) {
            const q = content.match(/"([^"\n]{5,})"|'([^'\n]{5,})'/);
            quoted = (q?.[1] || q?.[2])?.trim();
        }
    }

    const zipCode = zipMatches.length ? zipMatches[zipMatches.length - 1] : undefined;
    return { zipCode, quotedText: quoted };
}

// Minimal .text shim
async function textShim(args: { messages: Array<{ role: string; content: string }> }): Promise<{ text: string }> {
    const messages = args?.messages || [];
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const lastContent = lastUser?.content || '';
    const { zipCode, quotedText } = extractZipAndQuotedText(messages);

    if (!zipCode) {
        return {
            text: 'Please share a 5-digit ZIP code so I can fetch your local agriculture weather.'
        };
    }

    // If audio/stream requested, run the TTS+upload tool and return URLs clearly
    if (/\b(audio|tts|voice|speak|stream)\b/i.test(lastContent)) {
        try {
            const res = await (ttsWeatherTool.execute as any)({ context: { zipCode, text: quotedText } });
            if ((res as any)?.success) {
                const r: any = res;

                // Consolidate tool results to ensure playback URLs are always surfaced
                const playbackUrl =
                    r.playbackUrl ||
                    r?.mux?.hlsUrl ||
                    (r?.playbackId ? `${MUX_HLS_BASE_URL}/${r.playbackId}.m3u8` : undefined);

                const assetId = r.assetId || r?.mux?.assetId;
                const playbackId = r.playbackId || r?.mux?.playbackId;

                const playerUrl =
                    r.playerUrl ||
                    r?.mux?.playerUrl ||
                    (assetId ? `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}` : undefined);

                const summary = r.summaryText || quotedText || `Agriculture weather for ZIP ${zipCode}`;

                // Build concise end-user message with clear playback links
                const lines: string[] = [];
                lines.push(`Agricultural Weather Insights for ${zipCode}:`);
                lines.push(summary);

                // Always show player URL if we have an assetId, even while HLS readies
                if (playerUrl) lines.push(`Player URL: ${playerUrl}`);

                // Show HLS when available
                if (playbackUrl) lines.push(`HLS: ${playbackUrl}`);

                // Also surface IDs for debugging/deep links if needed by UI
                if (playbackId) lines.push(`Playback ID: ${playbackId}`);
                if (assetId) lines.push(`Asset ID: ${assetId}`);

                return { text: lines.join(' ') };
            }
            
            // If TTS failed, fall back to regular weather response with explanation
            console.log(`[textShim] TTS failed for ZIP ${zipCode}, falling back to regular weather response`);
            const errorMsg = (res as any)?.message || (res as any)?.error || 'unknown error';
            
            // Get regular weather data as fallback
            const weatherData: any = await weatherTool.execute({ context: { zipCode } } as any);
            const loc = weatherData?.location?.displayName || 'your area';
            const fc = Array.isArray(weatherData?.forecast) ? weatherData.forecast : [];
            const p0 = fc[0];
            const p1 = fc[1];
            const p2 = fc[2];

            const parts: string[] = [];
            parts.push(`Agriculture weather for ${loc} (${zipCode}).`);
            if (p0) parts.push(`${p0.name}: ${p0.shortForecast}, ${p0.temperature}°${p0.temperatureUnit}. Winds ${p0.windSpeed} ${p0.windDirection}.`);
            if (p1) parts.push(`${p1.name}: ${p1.shortForecast}, ${p1.temperature}°${p1.temperatureUnit}.`);
            if (p2) parts.push(`Then ${p2.name.toLowerCase()}: ${p2.shortForecast.toLowerCase()}, around ${p2.temperature}°${p2.temperatureUnit}.`);

            // Brief advice
            const ref = p0 || p1 || p2;
            if (ref && typeof ref.temperature === 'number') {
                const t = ref.temperature;
                if (t >= 90) parts.push('Advice: Consider irrigation and avoid mid-day transplanting.');
                else if (t >= 80) parts.push('Advice: Monitor water needs; provide shade for tender plants.');
                else if (t >= 60) parts.push('Advice: Good window for planting and field work if winds are calm.');
                else if (t >= 40) parts.push('Advice: Protect sensitive seedlings overnight.');
                else parts.push('Advice: Frost risk—protect sensitive crops and ensure livestock shelter.');
            }

            parts.push(`\n\nNote: Audio generation is currently unavailable (${errorMsg}). Here's the text version above.`);
            return { text: parts.join(' ') };
        } catch (e) {
            console.log(`[textShim] TTS request failed for ZIP ${zipCode}, falling back to regular weather response:`, e);
            
            // Fall back to regular weather response
            const weatherData: any = await weatherTool.execute({ context: { zipCode } } as any);
            const loc = weatherData?.location?.displayName || 'your area';
            const fc = Array.isArray(weatherData?.forecast) ? weatherData.forecast : [];
            const p0 = fc[0];
            const p1 = fc[1];
            const p2 = fc[2];

            const parts: string[] = [];
            parts.push(`Agriculture weather for ${loc} (${zipCode}).`);
            if (p0) parts.push(`${p0.name}: ${p0.shortForecast}, ${p0.temperature}°${p0.temperatureUnit}. Winds ${p0.windSpeed} ${p0.windDirection}.`);
            if (p1) parts.push(`${p1.name}: ${p1.shortForecast}, ${p1.temperature}°${p1.temperatureUnit}.`);
            if (p2) parts.push(`Then ${p2.name.toLowerCase()}: ${p2.shortForecast.toLowerCase()}, around ${p2.temperature}°${p2.temperatureUnit}.`);

            // Brief advice
            const ref = p0 || p1 || p2;
            if (ref && typeof ref.temperature === 'number') {
                const t = ref.temperature;
                if (t >= 90) parts.push('Advice: Consider irrigation and avoid mid-day transplanting.');
                else if (t >= 80) parts.push('Advice: Monitor water needs; provide shade for tender plants.');
                else if (t >= 60) parts.push('Advice: Good window for planting and field work if winds are calm.');
                else if (t >= 40) parts.push('Advice: Protect sensitive seedlings overnight.');
                else parts.push('Advice: Frost risk—protect sensitive crops and ensure livestock shelter.');
            }

            parts.push(`\n\nNote: Audio generation is currently unavailable. Here's the text version above.`);
            return { text: parts.join(' ') };
        }
    }

    // Otherwise, return a concise agriculture-focused weather summary
    try {
        const data: any = await weatherTool.execute({ context: { zipCode } } as any);
        const loc = data?.location?.displayName || 'your area';
        const fc = Array.isArray(data?.forecast) ? data.forecast : [];
        const p0 = fc[0];
        const p1 = fc[1];
        const p2 = fc[2];

        const parts: string[] = [];
        parts.push(`Agriculture weather for ${loc} (${zipCode}).`);
        if (p0) parts.push(`${p0.name}: ${p0.shortForecast}, ${p0.temperature}°${p0.temperatureUnit}. Winds ${p0.windSpeed} ${p0.windDirection}.`);
        if (p1) parts.push(`${p1.name}: ${p1.shortForecast}, ${p1.temperature}°${p1.temperatureUnit}.`);
        if (p2) parts.push(`Then ${p2.name.toLowerCase()}: ${p2.shortForecast.toLowerCase()}, around ${p2.temperature}°${p2.temperatureUnit}.`);

        // Brief advice
        const ref = p0 || p1 || p2;
        if (ref && typeof ref.temperature === 'number') {
            const t = ref.temperature;
            if (t >= 90) parts.push('Advice: Consider irrigation and avoid mid-day transplanting.');
            else if (t >= 80) parts.push('Advice: Monitor water needs; provide shade for tender plants.');
            else if (t >= 60) parts.push('Advice: Good window for planting and field work if winds are calm.');
            else if (t >= 40) parts.push('Advice: Protect sensitive seedlings overnight.');
            else parts.push('Advice: Frost risk—protect sensitive crops and ensure livestock shelter.');
        }

        return { text: parts.join(' ') };
    } catch (e) {
        return { text: `Sorry, I couldn't fetch the weather for ZIP ${zipCode}: ${e instanceof Error ? e.message : String(e)}.` };
    }
}

export const weatherAgentTestWrapper: any = weatherAgent as any;
(weatherAgentTestWrapper as any).text = textShim;