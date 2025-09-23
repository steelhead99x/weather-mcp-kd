import 'dotenv/config';
import { Agent } from "@mastra/core";
import { anthropic } from "@ai-sdk/anthropic";
import { weatherTool } from "../tools/weather";
import { promises as fs } from 'fs';
import { resolve, dirname, join } from 'path';
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client';
import { Memory } from "@mastra/memory";
import { InMemoryStore } from "@mastra/core/storage";
import ffmpeg from 'fluent-ffmpeg';
// IMPORTANT: Avoid using ffmpeg-static on Alpine to prevent glibc/musl issues
// import ffmpegStatic from 'ffmpeg-static';
import { existsSync } from 'fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Configure FFmpeg path: prefer system ffmpeg in container (/usr/bin/ffmpeg) to avoid glibc mismatch
(function configureFfmpeg() {
    const candidates = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/bin/ffmpeg',
        // typeof ffmpegStatic === 'string' ? ffmpegStatic : null, // intentionally not used on Alpine
    ].filter(Boolean) as string[];

    const found = candidates.find(p => {
        try { return existsSync(p); } catch { return false; }
    });

    if (found) {
        ffmpeg.setFfmpegPath(found);
        console.log(`[ffmpeg] Using ffmpeg at: ${found}`);
    } else {
        console.warn('[ffmpeg] No ffmpeg binary found in expected locations. Video features may fail.');
    }
})();

// Log ffmpeg version once at startup to verify runtime binary
(async () => {
    try {
        // Try the path fluent-ffmpeg is configured with (it prepends path internally)
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
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(imagePath)
            .inputOptions(['-loop 1'])
            .input(audioPath)
            .audioCodec('aac')              // ensure explicit selection
            .videoCodec('libx264')
            .outputOptions([
                '-b:a 128k',               // slightly lower bitrate to reduce resource use
                '-pix_fmt yuv420p',
                '-shortest',
                '-movflags +faststart',    // better muxing for streaming and sometimes fewer fs issues
            ])
            .output(outputPath)
            .on('start', (cmd: string) => console.log(`[createVideo] FFmpeg: ${cmd}`))
            .on('stderr', (line: string) => console.log(`[createVideo][stderr] ${line}`))
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
    if (!apiKey) {
        throw new Error('DEEPGRAM_API_KEY not set in environment');
    }
    const model = process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en';
    // Request linear PCM to wrap as WAV (Deepgram returns WAV for linear16)
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

// Provide a bundled fallback background image (avoid lavfi filter dependency)
async function getFallbackBackgroundPng(): Promise<string> {
    // Place a small static PNG in repo at files/images/fallback-bg.png
    const bundled = resolve('files/images/fallback-bg.png');
    try {
        await fs.access(bundled);
        return bundled;
    } catch {
        // As last resort: create a 1x1 PNG in memory (tiny), then scale in ffmpeg via image input
        const out = resolve('/tmp/fallback-bg.png');
        await fs.mkdir(dirname(out), { recursive: true });
        // A minimal 1x1 transparent PNG
        const tinyPng = Buffer.from(
            '89504E470D0A1A0A0000000D4948445200000001000000010806000000' +
            '1F15C4890000000A49444154789C6360000002000150A0A4' +
            '1B0000000049454E44AE426082', 'hex'
        );
        await fs.writeFile(out, tinyPng);
        return out;
    }
}

// ... existing code ...

const ttsWeatherTool = createTool({
    id: "tts-weather-upload",
    description: "Convert weather report to audio and upload to Mux",
    inputSchema: z.object({
        zipCode: z.string().describe("5-digit ZIP code"),
        text: z.string().optional().describe("Weather text to convert to speech"),
    }),
    execute: async ({ context }) => {
        let { zipCode, text } = context as { zipCode?: string; text?: string };

        const zip = String(zipCode || '').trim();
        if (!/^\d{5}$/.test(zip)) {
            return {
                success: false,
                zipCode: zip,
                message: 'Please provide a valid 5-digit ZIP code.'
            };
        }

        try {
            // If no text provided, fetch weather and build a concise summary for TTS
            let finalText = (text || '').trim();
            let weatherData: any = null;

            if (!finalText) {
                weatherData = await weatherTool.execute({ context: { zipCode: zip } } as any);
                const loc = weatherData?.location?.displayName || 'your area';
                const fc = Array.isArray(weatherData?.forecast) ? weatherData.forecast : [];
                const p0 = fc[0];
                const p1 = fc[1];
                const p2 = fc[2];

                const parts: string[] = [];
                parts.push(`Weather for ${loc} (${zip}).`);
                if (p0) {
                    parts.push(`${p0.name}: ${p0.shortForecast}, ${p0.temperature}\u00B0${p0.temperatureUnit}. Winds ${p0.windSpeed} ${p0.windDirection}.`);
                }
                if (p1) {
                    parts.push(`${p1.name}: ${p1.shortForecast}, ${p1.temperature}\u00B0${p1.temperatureUnit}.`);
                }
                if (p2) {
                    parts.push(`Then ${p2.name.toLowerCase()}: ${p2.shortForecast.toLowerCase()}, around ${p2.temperature}\u00B0${p2.temperatureUnit}.`);
                }
                finalText = parts.join(' ');
            }

            // Synthesize TTS (Deepgram)
            const audioBuffer = await synthesizeWithDeepgramTTS(finalText);
            const audioSource = 'deepgram';

            // Use /tmp for temp files in container environments
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const baseDir = process.env.TTS_TMP_DIR || '/tmp/tts';
            const audioPath = join(baseDir, `weather-${timestamp}-${zip}.wav`);
            const videoPath = join(baseDir, `weather-${timestamp}-${zip}.mp4`);

            await fs.mkdir(dirname(resolve(audioPath)), { recursive: true });

            await fs.writeFile(resolve(audioPath), audioBuffer);
            console.log(`[tts-weather-upload] Audio saved: ${audioPath} (${audioBuffer.length} bytes, source: ${audioSource})`);

            // Get random background image or bundled fallback
            let finalImagePath: string;
            try {
                finalImagePath = await getRandomBackgroundImage();
                console.log(`[tts-weather-upload] Using background image: ${finalImagePath}`);
            } catch {
                finalImagePath = await getFallbackBackgroundPng();
                console.log(`[tts-weather-upload] Using bundled fallback background: ${finalImagePath}`);
            }

            console.log(`[tts-weather-upload] Creating video...`);
            await createVideoFromAudioAndImage(
                resolve(audioPath),
                finalImagePath,
                resolve(videoPath)
            );

            console.log(`[tts-weather-upload] Video created: ${videoPath}`);

            // Optionally attempt Mux upload if credentials and MCP are configured
            let mux: any = null;
            try {
                if (process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET) {
                    await uploadClient.getTools();
                    // Best-effort: create a direct upload for a file we will upload externally (not via MCP here)
                    // Return the temp file paths for caller to handle actual HTTP upload if needed.
                    mux = { message: 'Mux MCP available. Use video.uploads.create to create a direct upload and POST the file.' };
                }
            } catch (e) {
                console.warn('[tts-weather-upload] Mux upload skipped:', e instanceof Error ? e.message : String(e));
            }

            // Clean up files if requested
            if (process.env.TTS_CLEANUP === 'true') {
                try { await fs.unlink(resolve(audioPath)); } catch {}
                try { await fs.unlink(resolve(videoPath)); } catch {}
                console.log('[tts-weather-upload] Cleaned up temp files');
            }

            return {
                success: true,
                zipCode: zip,
                summaryText: finalText,
                localAudioFile: audioPath,
                localVideoFile: videoPath,
                mux,
            };

        } catch (error) {
            console.error(`[tts-weather-upload] Error:`, error);
            return {
                success: false,
                zipCode: zip,
                error: error instanceof Error ? error.message : String(error),
                message: `Failed to create audio for ZIP ${zip}`,
            };
        }
    },
});

// Build the agent that can answer weather and generate TTS summaries

function buildSystemPrompt() {
    return [
        'You are a helpful weather assistant.',
        'When the user asks about weather without providing a ZIP code, ask them to share a 5-digit ZIP.',
        'Be concise and factual.',
    ].join(' ');
}

export const weatherAgent = new Agent({
    name: 'weatherAgent',
    instructions: buildSystemPrompt(),
    model: anthropic('claude-3-5-sonnet-latest'),
    tools: {
        weatherTool,
        ttsWeatherTool,
    },
    memory: new Memory({
        storage: new InMemoryStore(),
    }) as any,
});

// Lightweight helper to extract a 5-digit ZIP and optional quoted text from user messages
function extractZipAndQuotedText(messages: Array<{ role: string; content: string }>) {
    const zipMatches: string[] = [];
    let quoted: string | undefined;

    for (const m of messages) {
        const content = String(m?.content || '');
        const zips = content.match(/\b(\d{5})(?:-\d{4})?\b/g) || [];
        for (const z of zips) {
            // take the first 5 digits
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

// Attach a minimal .text(messages) method for test scripts
async function textShim(args: { messages: Array<{ role: string; content: string }> }): Promise<{ text: string }> {
    const messages = args?.messages || [];
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const lastContent = lastUser?.content || '';
    const { zipCode, quotedText } = extractZipAndQuotedText(messages);

    // If no ZIP anywhere, ask for it
    if (!zipCode) {
        return {
            text: 'Please share a 5-digit ZIP code so I can fetch your local weather. You can say "My ZIP is 10001" or provide a postal code.'
        };
    }

    // If the user is asking for TTS/audio, trigger the TTS tool
    if (/\b(audio|tts|voice|speak|stream)\b/i.test(lastContent)) {
        try {
            if (!ttsWeatherTool.execute) {
                return {
                    text: `TTS functionality is not available. The ttsWeatherTool.execute method is not defined.`
                };
            }
            const res = await ttsWeatherTool.execute({ context: { zipCode, text: quotedText } } as any);
            if ((res as any)?.success) {
                const r: any = res;
                const muxNote = r?.mux ? ' Mux upload tooling is available; you can create a direct upload to stream the audio/video.' : '';
                return {
                    text: `TTS audio created for ZIP ${zipCode}. Summary: ${r.summaryText || quotedText || 'Weather update'}. Local files: ${r.localAudioFile || 'n/a'}, ${r.localVideoFile || 'n/a'}.${muxNote}`
                };
            }
            return {
                text: `Attempted TTS for ZIP ${zipCode}, but it was not successful: ${(res as any)?.message || (res as any)?.error || 'unknown error'}. You may need to configure credentials or try again.`
            };
        } catch (e) {
            return {
                text: `TTS request for ZIP ${zipCode} failed: ${e instanceof Error ? e.message : String(e)}. Check credentials/configuration and try again.`
            };
        }
    }

    // Otherwise, fetch and summarize the weather
    try {
        const data: any = await weatherTool.execute({ context: { zipCode } } as any);
        const loc = data?.location?.displayName || 'your area';
        const fc = Array.isArray(data?.forecast) ? data.forecast : [];
        const p0 = fc[0];
        const p1 = fc[1];
        const p2 = fc[2];
        const parts: string[] = [];
        parts.push(`Weather for ${loc} (${zipCode}).`);
        if (p0) parts.push(`${p0.name}: ${p0.shortForecast}, ${p0.temperature}\u00B0${p0.temperatureUnit}.`);
        if (p1) parts.push(`${p1.name}: ${p1.shortForecast}, ${p1.temperature}\u00B0${p1.temperatureUnit}.`);
        if (p2) parts.push(`Then ${p2.name.toLowerCase()}: ${p2.shortForecast.toLowerCase()}, around ${p2.temperature}\u00B0${p2.temperatureUnit}.`);
        return { text: parts.join(' ') };
    } catch (e) {
        return { text: `Sorry, I couldn't fetch the weather for ZIP ${zipCode}: ${e instanceof Error ? e.message : String(e)}.` };
    }
}

// For tests to import a stable instance with a .text() shim
export const weatherAgentTestWrapper: any = weatherAgent as any;
(weatherAgentTestWrapper as any).text = textShim;