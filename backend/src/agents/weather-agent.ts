import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables - try multiple locations
// 1. First try root .env (when running from backend/)
const rootEnvPath = resolvePath(process.cwd(), '../.env');
// 2. Try current directory .env (when running from root)
const localEnvPath = resolvePath(process.cwd(), '.env');
// 3. Try backend/.env as fallback
const backendEnvPath = resolvePath(process.cwd(), 'backend/.env');

if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else if (existsSync(localEnvPath)) {
  config({ path: localEnvPath });
} else if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath });
} else {
  config(); // Load from default location
}
import { Agent } from "@mastra/core";
import { anthropic } from "@ai-sdk/anthropic";
import { weatherTool } from "../tools/weather.js";
import { promises as fs } from 'fs';
import { resolve, dirname, join, basename } from 'path';
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client.js';
import { muxMcpClient as assetsClient } from '../mcp/mux-assets-client.js';
import { generateTemperatureChartFromForecast, getChartUrl } from '../utils/chartGenerator.js';

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

// interface MuxUploadResponse {
//     upload_id?: string;
//     id?: string;
//     upload?: { id: string };
//     url?: string;
//     asset_id?: string;
//     asset?: { id: string };
// }

interface MuxAssetResponse {
    status: string;
    playback_ids?: Array<{ id: string }>;
}

// interface MuxResult {
//     assetId?: string;
//     playbackId?: string;
//     hlsUrl?: string;
//     playerUrl?: string;
//     error?: string;
// }

// interface TTSWeatherResult {
//     success: boolean;
//     zipCode: string;
//     summaryText?: string;
//     localAudioFile?: string;
//     localVideoFile?: string;
//     mux?: MuxResult;
//     playbackUrl?: string;
//     playerUrl?: string;
//     assetId?: string;
//     playbackId?: string;
//     error?: string;
//     message?: string;
// }


// Configurable URLs with environment variable support
const MUX_HLS_BASE_URL = process.env.MUX_HLS_BASE_URL || 'https://stream.mux.com';
const STREAMING_PORTFOLIO_BASE_URL = process.env.STREAMING_PORTFOLIO_BASE_URL || 'https://streamingportfolio.com';

// Memory optimization configuration removed - now using Mux direct upload

// FFmpeg functions removed - now using Mux direct upload for audio-only with static image




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


/**
 * Normalize text for natural TTS pronunciation
 * Expands abbreviations, converts symbols, and ensures smooth speech
 */
function normalizeForTTS(text: string): string {
    let normalized = text;
    
    // Expand common abbreviations
    normalized = normalized.replace(/\bZIP\b/gi, 'zip code');
    normalized = normalized.replace(/\bUS\b/g, 'United States');
    normalized = normalized.replace(/\bUSA\b/g, 'United States');
    normalized = normalized.replace(/\bN\b(?=\s|$)/g, 'North');
    normalized = normalized.replace(/\bS\b(?=\s|$)/g, 'South');
    normalized = normalized.replace(/\bE\b(?=\s|$)/g, 'East');
    normalized = normalized.replace(/\bW\b(?=\s|$)/g, 'West');
    normalized = normalized.replace(/\bNE\b/g, 'Northeast');
    normalized = normalized.replace(/\bNW\b/g, 'Northwest');
    normalized = normalized.replace(/\bSE\b/g, 'Southeast');
    normalized = normalized.replace(/\bSW\b/g, 'Southwest');
    normalized = normalized.replace(/\bNNE\b/g, 'North-Northeast');
    normalized = normalized.replace(/\bENE\b/g, 'East-Northeast');
    normalized = normalized.replace(/\bESE\b/g, 'East-Southeast');
    normalized = normalized.replace(/\bSSE\b/g, 'South-Southeast');
    normalized = normalized.replace(/\bSSW\b/g, 'South-Southwest');
    normalized = normalized.replace(/\bWSW\b/g, 'West-Southwest');
    normalized = normalized.replace(/\bWNW\b/g, 'West-Northwest');
    normalized = normalized.replace(/\bNNW\b/g, 'North-Northwest');
    
    // Temperature units
    normalized = normalized.replace(/(\d+)\s*°F/g, '$1 degrees Fahrenheit');
    normalized = normalized.replace(/(\d+)\s*°C/g, '$1 degrees Celsius');
    normalized = normalized.replace(/(\d+)\s*F\b/g, '$1 degrees Fahrenheit');
    normalized = normalized.replace(/(\d+)\s*C\b/g, '$1 degrees Celsius');
    
    // Speed units
    normalized = normalized.replace(/(\d+)\s*mph/gi, '$1 miles per hour');
    normalized = normalized.replace(/(\d+)\s*kph/gi, '$1 kilometers per hour');
    
    // Distance units
    normalized = normalized.replace(/(\d+)\s*ft\b/gi, '$1 feet');
    normalized = normalized.replace(/(\d+)\s*mi\b/gi, '$1 miles');
    normalized = normalized.replace(/(\d+)\s*km\b/gi, '$1 kilometers');
    
    // Percentage
    normalized = normalized.replace(/(\d+)%/g, '$1 percent');
    
    // Time abbreviations
    normalized = normalized.replace(/\bAM\b/g, 'A.M.');
    normalized = normalized.replace(/\bPM\b/g, 'P.M.');
    
    // Clean up multiple spaces
    normalized = normalized.replace(/\s{2,}/g, ' ');
    
    return normalized.trim();
}

/**
 * Pronounce ZIP code digits clearly with spacing for TTS
 * Now returns natural "zip code" followed by spaced digits
 */
function speakZip(zip: string): string {
    // Return spaced digits for clear pronunciation
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

    // Helper to simplify wind with proper TTS formatting
    const windPhrase = (p: WeatherForecast) => {
        if (!p?.windSpeed) return '';
        const speed = String(p.windSpeed).replace(/\s+/g, ' ');
        const direction = p.windDirection || '';
        const phrase = `Winds ${speed} ${direction}`.trim();
        return normalizeForTTS(phrase) + '.';
    };

    const parts: string[] = [];
    parts.push(`Agriculture weather for ${loc}. Zip code ${sayZip}.`);

    if (today) {
        const todayText = `${today.name}: ${today.shortForecast.toLowerCase()}. Temperature around ${today.temperature} degrees ${today.temperatureUnit}. ${windPhrase(today)}`;
        parts.push(normalizeForTTS(todayText));
    }
    if (tonightOrNext) {
        const tonightText = `${tonightOrNext.name}: ${tonightOrNext.shortForecast.toLowerCase()}. Near ${tonightOrNext.temperature} degrees ${tonightOrNext.temperatureUnit}.`;
        parts.push(normalizeForTTS(tonightText));
    }
    if (tomorrow) {
        const tomorrowText = `Looking to ${tomorrow.name.toLowerCase()}: ${tomorrow.shortForecast.toLowerCase()}, about ${tomorrow.temperature} degrees ${tomorrow.temperatureUnit}.`;
        parts.push(normalizeForTTS(tomorrowText));
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

    parts.push(`Check back before spraying or harvesting, conditions can shift quickly.`);
    
    // Final normalization pass for the entire speech
    const finalSpeech = parts.join(' ');
    return normalizeForTTS(finalSpeech);
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
        console.debug(`[waitForMuxAssetReady] Asset ${assetId} already being polled, waiting for existing poll...`);
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
    timeoutMs,
}: { pollMs?: number; timeoutMs: number }): Promise<{
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
    
    // Progressive polling intervals: start frequent, then back off
    const getPollInterval = (elapsedMs: number): number => {
        if (elapsedMs < 60000) return 5000; // First minute: every 5 seconds
        if (elapsedMs < 300000) return 10000; // Next 4 minutes: every 10 seconds
        if (elapsedMs < 900000) return 30000; // Next 10 minutes: every 30 seconds
        return 60000; // After 15 minutes: every minute
    };
    
    while (Date.now() - start < timeoutMs) {
        const elapsedMs = Date.now() - start;
        const currentPollInterval = getPollInterval(elapsedMs);
        
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
                console.debug(`[performAssetPolling] Skipping unparseable response for asset ${assetId}: ${text.slice(0, 100)}...`);
                await new Promise(r => setTimeout(r, currentPollInterval));
                continue;
            }
            
            const status = lastPayload?.status as string | undefined;
            console.debug(`[performAssetPolling] Asset ${assetId} status: ${status} (${Math.round(elapsedMs / 1000)}s elapsed, next check in ${currentPollInterval / 1000}s)`);
            
            if (status === 'ready' && 'playback_ids' in lastPayload) {
                const playbackId = Array.isArray(lastPayload.playback_ids) && lastPayload.playback_ids.length > 0
                    ? (lastPayload.playback_ids[0]?.id as string | undefined)
                    : undefined;
                console.log(`[performAssetPolling] Asset ${assetId} is ready! Playback ID: ${playbackId}`);
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
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.warn(`[performAssetPolling] Error polling asset ${assetId} (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, errorMsg);
            
            // If we have too many consecutive errors, fail fast
            if (consecutiveErrors >= maxConsecutiveErrors) {
                throw new Error(`Too many consecutive errors (${consecutiveErrors}) polling asset ${assetId}: ${errorMsg}`);
            }
            
            // transient errors: jitter then continue
            await new Promise(r => setTimeout(r, Math.min(2000, currentPollInterval)));
        }
        
        // Use progressive polling interval
        await new Promise(r => setTimeout(r, currentPollInterval));
    }
    throw new Error(`Timeout waiting for Mux asset ${assetId} to be ready after ${timeoutMs}ms`);
}

// Connection management and rate limiting
let activeConnections = 0;
const MAX_CONCURRENT_CONNECTIONS = 2; // Reduced to prevent overload
const connectionQueue: Array<() => void> = [];
const CONNECTION_TIMEOUT = 30000; // 30 seconds timeout

// Mux MCP health check - NOT USED since we're bypassing MCP entirely
// @ts-ignore - Kept for reference but not used since we're using direct REST API
async function checkMuxMCPHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
        console.debug("[HealthCheck] Starting Mux MCP health check...");
        
        // Check environment variables first
        if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
            console.debug("[HealthCheck] Missing environment variables");
            return { healthy: false, error: 'Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET' };
        }

        console.debug("[HealthCheck] Environment variables OK, getting tools from upload client...");
        // Try to get tools from upload client
        const uploadTools = await uploadClient.getTools();
        console.debug("[HealthCheck] Got upload tools:", Object.keys(uploadTools || {}));
        
        if (!uploadTools || Object.keys(uploadTools).length === 0) {
            console.debug("[HealthCheck] No tools available");
            return { healthy: false, error: 'No Mux MCP tools available' };
        }

        // Check for essential tools
        const hasCreateTool = uploadTools['create_video_uploads'] || uploadTools['video.uploads.create'];
        if (!hasCreateTool) {
            console.debug("[HealthCheck] Missing create tool");
            return { healthy: false, error: 'Missing Mux upload creation tool' };
        }

        console.debug("[HealthCheck] Health check passed");
        return { healthy: true };
    } catch (error) {
        console.error("[HealthCheck] Health check failed:", error);
        return { 
            healthy: false, 
            error: `Mux MCP health check failed: ${error instanceof Error ? error.message : String(error)}` 
        };
    }
}

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

// Create a shared memory instance for ZIP code storage with working memory
const zipMemory = new Memory({
    storage: new InMemoryStore(),
    options: {
        workingMemory: {
            enabled: true,
            scope: 'thread', // Use thread-scoped memory (supported by InMemoryStore)
            template: `# User Weather Preferences
- ZIP Code: 
- Last Weather Request:
- Preferred Format: [text/audio]
`,
        },
    },
}) as any;

// Initialize the default thread for ZIP code storage
(async () => {
    try {
        await zipMemory.createThread({
            threadId: "default-thread",
            resourceId: "default-user",
            title: "ZIP Code Storage Thread"
        });
        console.debug('[zipMemory] Default thread created successfully');
    } catch (e) {
        console.debug('[zipMemory] Default thread may already exist:', e instanceof Error ? e.message : String(e));
    }
})();

// Memory tool for storing and retrieving ZIP codes
const zipMemoryTool = createTool({
    id: "zip-memory",
    description: "Store or retrieve ZIP codes in memory for weather requests",
    inputSchema: z.object({
        action: z.enum(["store", "retrieve"]).describe("Action to perform: store a ZIP code or retrieve the stored ZIP code"),
        zipCode: z.string().optional().describe("ZIP code to store (required for store action)"),
    }),
    execute: async ({ context }): Promise<{ success: boolean; message: string; zipCode?: string | null }> => {
        const { action, zipCode } = context as { action: string; zipCode?: string };
        
        if (action === "store") {
            if (!zipCode || !/^\d{5}$/.test(zipCode)) {
                return {
                    success: false,
                    message: "Invalid ZIP code provided for storage"
                };
            }
            
            // Store ZIP code in working memory
            try {
                await zipMemory.updateWorkingMemory({
                    threadId: "default-thread",
                    workingMemory: `# User Weather Preferences
- ZIP Code: ${zipCode}
- Last Weather Request: ${new Date().toISOString()}
- Preferred Format: audio
`,
                });
                return {
                    success: true,
                    message: `ZIP code ${zipCode} stored in memory`,
                    zipCode
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Failed to store ZIP code: ${e instanceof Error ? e.message : String(e)}`
                };
            }
        } else if (action === "retrieve") {
            // Retrieve ZIP code from working memory
            try {
                const thread = await zipMemory.getThreadById({
                    threadId: "default-thread",
                });
                
                // Extract ZIP code from working memory content in thread metadata
                let storedZip = null;
                if (thread?.metadata?.workingMemory) {
                    const content = thread.metadata.workingMemory;
                    const zipMatch = content.match(/- ZIP Code: (\d{5})/);
                    if (zipMatch) {
                        storedZip = zipMatch[1];
                    }
                }
                
                return {
                    success: true,
                    message: storedZip ? `Retrieved ZIP code: ${storedZip}` : "No ZIP code stored in memory",
                    zipCode: storedZip || null
                };
            } catch (e) {
                return {
                    success: false,
                    message: `Failed to retrieve ZIP code: ${e instanceof Error ? e.message : String(e)}`,
                    zipCode: null
                };
            }
        }
        
        return {
            success: false,
            message: "Invalid action. Use 'store' or 'retrieve'"
        };
    },
});

/**
 * Create a Mux upload using either MCP or REST API based on USE_MUX_MCP env variable
 * @returns Upload data with id, url, and asset_id
 */
async function createMuxUpload(): Promise<{ uploadId?: string; uploadUrl?: string; assetId?: string }> {
    const useMcp = process.env.USE_MUX_MCP === 'true';
    const corsOrigin = process.env.MUX_CORS_ORIGIN || 'https://weather-mcp-kd.streamingportfolio.com';
    const playbackPolicy = process.env.MUX_PLAYBACK_POLICY;
    
    if (useMcp) {
        console.debug('[createMuxUpload] Using Mux MCP for upload creation');
        
        try {
            const uploadTools = await uploadClient.getTools();
            let createTool = uploadTools['create_video_uploads'] || uploadTools['video.uploads.create'];
            
            // If no direct tool, try invoke_api_endpoint
            if (!createTool) {
                const invokeTool = uploadTools['invoke_api_endpoint'];
                if (!invokeTool) {
                    throw new Error('Mux MCP did not expose any upload tools or invoke_api_endpoint');
                }
                
                createTool = {
                    execute: async ({ context }: { context: any }) => {
                        return await invokeTool.execute({ 
                            context: { 
                                endpoint_name: 'create_video_uploads',
                                arguments: context 
                            } 
                        });
                    }
                };
            }
            
            const createArgs: any = {
                cors_origin: corsOrigin
            };
            
            // Add playback policy if specified
            if (playbackPolicy && playbackPolicy !== 'public') {
                createArgs.new_asset_settings = {
                    playback_policies: [playbackPolicy]
                };
            }
            
            console.debug('[createMuxUpload] Creating upload via MCP');
            const createRes = await createTool.execute({ context: createArgs });
            
            // Parse MCP response
            const blocks = Array.isArray(createRes) ? createRes : [createRes];
            let uploadId: string | undefined;
            let uploadUrl: string | undefined;
            let assetId: string | undefined;
            
            for (const b of blocks as any[]) {
                const t = b && typeof b === 'object' && typeof b.text === 'string' ? b.text : undefined;
                if (!t) continue;
                
                try {
                    const payload = JSON.parse(t);
                    console.debug('[createMuxUpload] Parsed MCP response:', JSON.stringify(payload, null, 2));
                    
                    uploadId = uploadId || payload.upload_id || payload.id || payload.upload?.id;
                    uploadUrl = uploadUrl || payload.url || payload.upload?.url;
                    assetId = assetId || payload.asset_id || payload.asset?.id;
                    
                    if (uploadId && uploadUrl) {
                        break;
                    }
                } catch (parseError) {
                    console.warn('[createMuxUpload] Failed to parse MCP response block:', parseError);
                }
            }
            
            if (!uploadUrl) {
                throw new Error('No upload URL received from Mux MCP');
            }
            
            console.debug(`[createMuxUpload] MCP upload created: id=${uploadId}, has_url=${!!uploadUrl}, asset_id=${assetId}`);
            return { uploadId, uploadUrl, assetId };
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('[createMuxUpload] MCP upload creation failed:', errorMsg);
            throw new Error(`Mux MCP upload creation failed: ${errorMsg}`);
        }
        
    } else {
        console.debug('[createMuxUpload] Using Mux REST API for upload creation');
        
        const muxTokenId = process.env.MUX_TOKEN_ID;
        const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
        
        if (!muxTokenId || !muxTokenSecret) {
            throw new Error('MUX_TOKEN_ID and MUX_TOKEN_SECRET are required');
        }
        
        const uploadPayload: any = {
            cors_origin: corsOrigin
        };
        
        // Add playback policy if specified
        if (playbackPolicy && playbackPolicy !== 'public') {
            uploadPayload.new_asset_settings = {
                playback_policy: [playbackPolicy]
            };
        }
        
        const authHeader = 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64');
        
        console.debug('[createMuxUpload] Creating upload via REST API');
        
        const createRes = await fetch('https://api.mux.com/video/v1/uploads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(uploadPayload)
        } as any);
        
        if (!createRes.ok) {
            const errorText = await createRes.text().catch(() => '');
            throw new Error(`Mux API error ${createRes.status}: ${errorText}`);
        }
        
        const createData = await createRes.json() as any;
        console.debug('[createMuxUpload] REST API upload created successfully');
        
        // Parse REST API response
        // Expected format: { data: { id: "...", url: "...", asset_id: "..." } }
        if (createData && createData.data) {
            const uploadId = createData.data.id;
            const uploadUrl = createData.data.url;
            const assetId = createData.data.asset_id;
            
            console.debug(`[createMuxUpload] REST API upload created: id=${uploadId}, has_url=${!!uploadUrl}, asset_id=${assetId}`);
            return { uploadId, uploadUrl, assetId };
        }
        
        throw new Error('Invalid response format from Mux REST API');
    }
}

/**
 * Retrieve asset ID from an upload using REST API
 */
async function retrieveAssetIdFromUpload(uploadId: string): Promise<string | undefined> {
    const muxTokenId = process.env.MUX_TOKEN_ID;
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
    
    if (!muxTokenId || !muxTokenSecret) {
        console.warn('[retrieveAssetIdFromUpload] Missing Mux credentials');
        return undefined;
    }
    
    try {
        const authHeader = 'Basic ' + Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64');
        
        const retrieveRes = await fetch(`https://api.mux.com/video/v1/uploads/${uploadId}`, {
            method: 'GET',
            headers: {
                'Authorization': authHeader
            }
        } as any);
        
        if (retrieveRes.ok) {
            const retrieveData = await retrieveRes.json() as any;
            console.debug('[retrieveAssetIdFromUpload] Retrieval response:', JSON.stringify(retrieveData, null, 2));
            
            if (retrieveData && retrieveData.data) {
                const assetId = retrieveData.data.asset_id;
                if (assetId) {
                    console.debug(`[retrieveAssetIdFromUpload] Retrieved asset ID: ${assetId}`);
                    return assetId;
                }
            }
        } else {
            console.warn('[retrieveAssetIdFromUpload] Failed to retrieve upload info:', retrieveRes.status);
        }
    } catch (error) {
        console.warn('[retrieveAssetIdFromUpload] Retrieval failed:', error instanceof Error ? error.message : String(error));
    }
    
    return undefined;
}

// Asset readiness check tool
const assetReadinessTool = createTool({
    id: "check-asset-readiness",
    description: "Check if a Mux asset is ready for playback and return updated URLs",
    inputSchema: z.object({
        assetId: z.string().describe("Mux asset ID to check"),
    }),
    execute: async ({ context }) => {
        const { assetId } = context as { assetId: string };
        
        if (!assetId) {
            return {
                success: false,
                message: 'Asset ID is required'
            };
        }

        try {
            console.debug(`[check-asset-readiness] Checking asset ${assetId}...`);
            const ready = await waitForMuxAssetReady(assetId, { 
                pollMs: 2000, // Check every 2 seconds
                timeoutMs: 10000 // 10 second timeout for quick checks
            });
            
            return {
                success: true,
                assetId: ready.assetId,
                status: ready.status,
                playbackId: ready.playbackId,
                hlsUrl: ready.hlsUrl,
                playerUrl: ready.playerUrl,
                message: `Asset ${assetId} is ready for playback`
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.debug(`[check-asset-readiness] Asset ${assetId} not ready: ${errorMsg}`);
            
            return {
                success: false,
                assetId,
                message: `Asset ${assetId} is still processing: ${errorMsg}`,
                playerUrl: `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`
            };
        }
    },
});

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
                // If user provides text, normalize it for TTS and include ZIP
                finalText = `For zip code ${speakZip(zip)}. ${finalText}`;
                finalText = normalizeForTTS(finalText);
            }

            // Synthesize TTS (Deepgram)
            const audioBuffer = await synthesizeWithDeepgramTTS(finalText);

            // Temp paths for audio only
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const baseDir = process.env.TTS_TMP_DIR || '/tmp/tts';
            const audioPath = join(baseDir, `weather-${timestamp}-${zip}.wav`);

            await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });
            await fs.writeFile(resolve(audioPath), audioBuffer);
            console.debug(`[tts-weather-upload] Audio saved: ${audioPath} (${audioBuffer.length} bytes)`);

            // Generate temperature chart if we have weather data
            let chartUrl: string | undefined;
            if (weatherData && Array.isArray(weatherData.forecast)) {
                try {
                    const chartPath = await generateTemperatureChartFromForecast(weatherData.forecast);
                    chartUrl = await getChartUrl(chartPath);
                    console.debug(`[tts-weather-upload] Generated temperature chart: ${chartUrl}`);
                } catch (chartError) {
                    console.warn('[tts-weather-upload] Failed to generate temperature chart:', chartError instanceof Error ? chartError.message : String(chartError));
                }
            }

            // Background image or fallback - use publicly accessible URLs
            let imageUrl: string;
            try {
                const finalImagePath = await getRandomBackgroundImage();
                console.debug(`[tts-weather-upload] Using background image: ${finalImagePath}`);
                
                // Try local server first, then fallback to public URLs
                const localUrl = `${process.env.STREAMING_PORTFOLIO_BASE_URL || 'https://weather-mcp-kd.streamingportfolio.com'}/files/images/${basename(finalImagePath)}`;
                
                // Test if local URL is accessible
                try {
                    const testResponse = await fetch(localUrl, { method: 'HEAD' });
                    if (testResponse.ok) {
                        imageUrl = localUrl;
                        console.debug(`[tts-weather-upload] Using local image URL: ${imageUrl}`);
                    } else {
                        throw new Error('Local URL not accessible');
                    }
                } catch {
                    // Fallback to a publicly accessible image
                    const publicImages = [
                        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center',
                        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop&crop=center',
                        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center'
                    ];
                    const randomIndex = Math.floor(Math.random() * publicImages.length);
                    imageUrl = publicImages[randomIndex]!;
                    console.debug(`[tts-weather-upload] Using public fallback image URL: ${imageUrl}`);
                }
            } catch {
                // Ultimate fallback to a simple public image
                imageUrl = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center';
                console.debug(`[tts-weather-upload] Using ultimate fallback image URL: ${imageUrl}`);
            }

            console.debug(`[tts-weather-upload] Image URL: ${imageUrl}`);

            // Upload to Mux and get streaming URLs
            let mux: any = null;
            let playbackUrl: string | undefined;
            let playerUrl: string | undefined;
            let assetId: string | undefined;
            let playbackId: string | undefined;

            try {
                // Create upload using configurable method (MCP or REST API)
                const useMcp = process.env.USE_MUX_MCP === 'true';
                console.debug(`[tts-weather-upload] Using ${useMcp ? 'MCP' : 'REST API'} for upload (USE_MUX_MCP=${useMcp})`);
                
                // Create upload
                const uploadData = await createMuxUpload();
                const uploadId = uploadData.uploadId;
                const uploadUrl = uploadData.uploadUrl;
                assetId = uploadData.assetId;
                
                if (!uploadUrl) {
                    throw new Error('No upload URL received from Mux - cannot proceed with file upload');
                }
                
                console.debug(`[tts-weather-upload] Upload URL: ${uploadUrl}`);
                if (uploadId) console.debug(`[tts-weather-upload] Upload ID: ${uploadId}`);
                if (assetId) console.debug(`[tts-weather-upload] Asset ID: ${assetId}`);

                console.debug('[tts-weather-upload] Uploading audio file to Mux...');
                await putFileToMux(uploadUrl, resolve(audioPath));
                console.debug('[tts-weather-upload] Audio file upload completed');

                // Retrieve asset ID if not provided
                if (!assetId && uploadId) {
                    console.debug('[tts-weather-upload] Retrieving asset ID from upload...');
                    assetId = await retrieveAssetIdFromUpload(uploadId);
                }

                if (!assetId) {
                    console.warn('[tts-weather-upload] No asset ID available - will use upload ID for player URL');
                    assetId = uploadId; // Fallback to upload ID
                }

                // Build player URL immediately from assetId (always provide)
                playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
                console.debug(`[tts-weather-upload] Player URL: ${playerUrl}`);

                // Start asset readiness polling in the background (non-blocking)
                let assetReadyPromise: Promise<any> | null = null;
                if (assetId) {
                    console.debug('[tts-weather-upload] Starting background asset readiness polling...');
                    
                    // Calculate timeout based on audio file size (longer files take more time to process)
                    let audioFileSize = 0;
                    try {
                        const stats = await fs.stat(audioPath);
                        audioFileSize = stats.size;
                    } catch (error) {
                        console.debug(`[tts-weather-upload] Could not get audio file size: ${error instanceof Error ? error.message : String(error)}`);
                    }
                    const baseTimeoutMs = 10 * 60 * 1000; // 10 minutes base
                    const sizeBasedTimeoutMs = Math.min(audioFileSize / 1000, 10 * 60 * 1000); // 1ms per KB, max 10 minutes
                    const totalTimeoutMs = Math.min(baseTimeoutMs + sizeBasedTimeoutMs, 30 * 60 * 1000); // Max 30 minutes
                    
                    console.debug(`[tts-weather-upload] Audio file size: ${audioFileSize} bytes, calculated timeout: ${Math.round(totalTimeoutMs / 1000)}s`);
                    
                    assetReadyPromise = waitForMuxAssetReady(assetId, {
                        pollMs: 5000, // Initial poll interval (will be overridden by progressive logic)
                        timeoutMs: totalTimeoutMs
                    }).then(result => {
                        console.log(`[tts-weather-upload] Asset ${assetId} is ready! Status: ${result.status}, Playback ID: ${result.playbackId}`);
                        return result;
                    }).catch(error => {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        if (errorMsg.includes('Timeout')) {
                            console.warn(`[tts-weather-upload] Background asset polling timed out for ${assetId} after ${Math.round(totalTimeoutMs / 1000)}s. Asset may still be processing.`);
                        } else {
                            console.warn(`[tts-weather-upload] Background asset polling failed for ${assetId}:`, errorMsg);
                        }
                        return null;
                    });
                } else {
                    console.warn('[tts-weather-upload] No asset ID available for polling');
                }

                mux = {
                    assetId,
                    playbackId,
                    hlsUrl: playbackUrl,
                    playerUrl,
                    assetReadyPromise, // Include the promise for background polling
                };
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                console.error('[tts-weather-upload] Mux upload failed:', errorMsg);
                
                // Provide more specific error information
                if (errorMsg.includes('connection')) {
                    mux = { error: 'Mux MCP connection failed. Please check your MUX_TOKEN_ID and MUX_TOKEN_SECRET.' };
                } else if (errorMsg.includes('parse')) {
                    mux = { error: 'Failed to parse Mux response. The Mux service may be experiencing issues.' };
                } else if (errorMsg.includes('upload')) {
                    mux = { error: 'File upload to Mux failed. Please try again.' };
                } else {
                    mux = { error: `Mux upload failed: ${errorMsg}` };
                }
            }

            // Cleanup
            if (process.env.TTS_CLEANUP === 'true') {
                try { 
                    await fs.unlink(resolve(audioPath)); 
                    console.debug('[tts-weather-upload] Cleaned up audio file:', audioPath);
                } catch (cleanupError) {
                    console.warn('[tts-weather-upload] Failed to cleanup audio file:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
                }
                console.debug('[tts-weather-upload] Cleanup completed');
            }

            // Always include playerUrl if we know assetId
            if (!playerUrl && assetId) {
                playerUrl = `${STREAMING_PORTFOLIO_BASE_URL}/player?assetId=${assetId}`;
            }

            // Determine success based on what we achieved
            const hasPlayerUrl = !!playerUrl;
            const hasHlsUrl = !!playbackUrl;
            const hasMuxError = mux && 'error' in mux;
            
            const success = hasPlayerUrl || hasHlsUrl || !hasMuxError;

            return {
                success,
                zipCode: zip,
                summaryText: finalText,
                localAudioFile: audioPath,
                chartUrl,
                mux,
                playbackUrl,
                playerUrl,
                assetId,
                playbackId,
                message: success 
                    ? 'Audio weather report with static image and temperature chart generated successfully'
                    : 'Audio generated but Mux upload failed - check local files'
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
        'IMPORTANT MEMORY RULES:',
        '- Always remember ZIP codes that users provide in previous messages',
        '- If a user provides a ZIP code, store it in memory for future reference using the zipMemoryTool',
        '- When a user asks about weather without providing a ZIP code, check your memory first for previously provided ZIP codes using the zipMemoryTool',
        '- Only ask for a ZIP code if you have no ZIP code stored in memory',
        '- After storing a ZIP code, immediately use it for weather requests without asking again',
        '- Keep responses clear and conversational. When generating TTS, speak ZIP code digits clearly.',
        'Offer practical farm and field guidance tied to conditions (planting, irrigation, spraying, frost, livestock).',
        'AUDIO/VISUAL WEATHER RULES:',
        '- When a user requests audio, TTS, voice, speak, stream, or visual weather forecasts, ALWAYS automatically call the ttsWeatherTool',
        '- NEVER ask "Would you like me to generate an audio forecast?" - just generate it automatically',
        '- Always say "please wait one minute while i generate your visual weather forecast" before calling ttsWeatherTool',
        '- Use the stored ZIP code from memory when calling ttsWeatherTool',
        '- If no ZIP code is stored, ask for one first, then proceed with audio generation',
        '- The ttsWeatherTool will automatically generate both a random background image AND a temperature trend chart for the next 7 days',
        '- After generating a video, display the player URL immediately and mention that the asset is processing',
        '- Always display the temperature chart image in your response when available',
        '- If a user asks about asset status or if the video is ready, use the check-asset-readiness tool to check the current status',
        '- When an asset becomes ready, inform the user that the video is now fully available for playback',
    ].join(' ');
}

export const weatherAgent: any = new Agent({
    name: 'weatherAgent',
    description: 'Provides agriculture-focused weather info for ZIP codes and generates a clear, natural TTS video uploaded to Mux with a streaming URL.',
    instructions: buildSystemPrompt(),
    model: anthropic(process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest'),
    tools: {
        weatherTool,
        ttsWeatherTool,
        zipMemoryTool,
        assetReadinessTool,
    },
    memory: zipMemory,
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
    
    // Handle empty messages array - provide a default greeting
    if (messages.length === 0) {
        return {
            text: 'Hello! I\'m your agriculture-focused weather assistant. Please provide a 5-digit ZIP code to get started with weather information for your area.'
        };
    }
    
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const lastContent = lastUser?.content || '';
    const { zipCode, quotedText } = extractZipAndQuotedText(messages);

    // Check if we have a ZIP code in the current messages
    let currentZipCode = zipCode;
    
    // Check if the user is asking a general weather question without providing a ZIP
    const isGeneralWeatherQuestion = !currentZipCode && (
        lastContent.toLowerCase().includes('weather') ||
        lastContent.toLowerCase().includes('forecast') ||
        lastContent.toLowerCase().includes('temperature') ||
        lastContent.toLowerCase().includes('rain') ||
        lastContent.toLowerCase().includes('sunny') ||
        lastContent.toLowerCase().includes('cloudy')
    );

    // If no ZIP in current messages and it's a general weather question, don't use stored ZIP
    if (!currentZipCode && !isGeneralWeatherQuestion) {
        try {
            const thread = await zipMemory.getThreadById({
                threadId: "default-thread",
            });
            
            // Extract ZIP code from working memory content in thread metadata
            if (thread?.metadata?.workingMemory) {
                const content = thread.metadata.workingMemory;
                const zipMatch = content.match(/- ZIP Code: (\d{5})/);
                if (zipMatch) {
                    currentZipCode = zipMatch[1];
                    console.debug(`[textShim] Retrieved ZIP from memory: ${currentZipCode}`);
                }
            }
        } catch (e) {
            console.warn('[textShim] Failed to retrieve ZIP from memory:', e);
        }
    } else if (currentZipCode) {
        // Store the ZIP code in memory for future use
        try {
            await zipMemory.updateWorkingMemory({
                threadId: "default-thread",
                workingMemory: `# User Weather Preferences
- ZIP Code: ${currentZipCode}
- Last Weather Request: ${new Date().toISOString()}
- Preferred Format: audio
`,
            });
            console.debug(`[textShim] Stored ZIP in memory: ${currentZipCode}`);
        } catch (e) {
            console.warn('[textShim] Failed to store ZIP in memory:', e);
        }
    }

    if (!currentZipCode) {
        return {
            text: 'Please share a 5-digit ZIP code so I can fetch your local agriculture weather.'
        };
    }

    // If audio/stream requested, run the TTS+upload tool and return URLs clearly
    if (/\b(audio|tts|voice|speak|stream)\b/i.test(lastContent)) {
        try {
            const res = await (ttsWeatherTool.execute as any)({ context: { zipCode: currentZipCode, text: quotedText } });
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

                const summary = r.summaryText || quotedText || `Agriculture weather for ZIP ${currentZipCode}`;

                // Build concise end-user message with clear playback links
                const lines: string[] = [];
                lines.push(`Agricultural Weather Insights for ${currentZipCode}:`);
                lines.push(summary);

                // Add temperature chart if available
                if (r.chartUrl) {
                    lines.push(`\n📊 Temperature Trend Chart:`);
                    lines.push(`<img src="${r.chartUrl}" alt="7-Day Temperature Forecast" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />`);
                }

                // Always show player URL if we have an assetId, even while HLS readies
                if (playerUrl) {
                    // Create an HTML iframe for the signed player
                    const playerHtml = `
<div style="margin: 20px 0; text-align: center;">
  <iframe 
    src="${playerUrl}" 
    width="100%" 
    height="400" 
    frameborder="0" 
    allowfullscreen
    style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"
    onclick="navigator.clipboard.writeText('${playerUrl}').then(() => alert('Player URL copied to clipboard!'))"
    title="Weather Video Player - Click to copy URL"
  ></iframe>
  <p style="margin-top: 10px; font-size: 14px; color: #666;">
    ⏳ Asset is processing... The player will be ready shortly. 
    <br>Click the video to copy the full URL to clipboard.
  </p>
</div>`;
                    lines.push(playerHtml);
                }

                // Show HLS when available
                if (playbackUrl) {
                    lines.push(`🔗 HLS Stream: ${playbackUrl}`);
                }

                // Also surface IDs for debugging/deep links if needed by UI
                if (playbackId) lines.push(`Playback ID: ${playbackId}`);
                if (assetId) lines.push(`Asset ID: ${assetId}`);

                // Add a note about background processing
                if (r?.mux?.assetReadyPromise) {
                    lines.push(`\n📡 Asset readiness is being checked in the background. The player will work once processing is complete.`);
                }

                return { text: lines.join(' ') };
            }
            
            // If TTS failed, fall back to regular weather response with explanation
            console.debug(`[textShim] TTS failed for ZIP ${currentZipCode}, falling back to regular weather response`);
            const errorMsg = (res as any)?.message || (res as any)?.error || 'unknown error';
            
            // Get regular weather data as fallback
            const weatherData: any = await weatherTool.execute({ context: { zipCode: currentZipCode } } as any);
            const loc = weatherData?.location?.displayName || 'your area';
            const fc = Array.isArray(weatherData?.forecast) ? weatherData.forecast : [];
            const p0 = fc[0];
            const p1 = fc[1];
            const p2 = fc[2];

            const parts: string[] = [];
            parts.push(`Agriculture weather for ${loc} (${currentZipCode}).`);
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
            console.debug(`[textShim] TTS request failed for ZIP ${currentZipCode}, falling back to regular weather response:`, e);
            
            // Fall back to regular weather response
            const weatherData: any = await weatherTool.execute({ context: { zipCode: currentZipCode } } as any);
            const loc = weatherData?.location?.displayName || 'your area';
            const fc = Array.isArray(weatherData?.forecast) ? weatherData.forecast : [];
            const p0 = fc[0];
            const p1 = fc[1];
            const p2 = fc[2];

            const parts: string[] = [];
            parts.push(`Agriculture weather for ${loc} (${currentZipCode}).`);
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
        const data: any = await weatherTool.execute({ context: { zipCode: currentZipCode } } as any);
        const loc = data?.location?.displayName || 'your area';
        const fc = Array.isArray(data?.forecast) ? data.forecast : [];
        const p0 = fc[0];
        const p1 = fc[1];
        const p2 = fc[2];

        const parts: string[] = [];
        parts.push(`Agriculture weather for ${loc} (${currentZipCode}).`);
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
        return { text: `Sorry, I couldn't fetch the weather for ZIP ${currentZipCode}: ${e instanceof Error ? e.message : String(e)}.` };
    }
}

export const weatherAgentTestWrapper: any = weatherAgent as any;
(weatherAgentTestWrapper as any).text = textShim;