import 'dotenv/config';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

/**
 * Clean Text-to-Speech test script supporting:
 * - Deepgram TTS (REST)
 * - Cartesia TTS (WS preferred; REST fallback)
 *
 * Usage:
 *   npm run test:tts:deepgram
 *   npm run test:tts:cartesia
 *   node dist/scripts/test-tts.js "Hello world" deepgram
 *
 * Environment variables:
 *   CARTESIA_API_KEY, CARTESIA_VOICE, CARTESIA_TTS_MODEL
 *   DEEPGRAM_API_KEY, DEEPGRAM_TTS_MODEL
 *   TTS_FORMAT=mp3|wav, TTS_OUTPUT_BASE=files/tts-sample
 */

// -----------------------------
// Cartesia WebSocket Client
// -----------------------------
class CartesiaStreamingTTSClient {
    private ws!: WebSocket;
    private closed = false;
    private timer?: NodeJS.Timeout;
    private keepAlive?: NodeJS.Timeout;
    private chunks: Buffer[] = [];
    private resolveDone?: (value: { audio: Uint8Array }) => void;
    private rejectDone?: (reason?: any) => void;
    private donePromise: Promise<{ audio: Uint8Array }>;
    private finishSent = false;

    readonly contextId: string;
    readonly voiceId?: string;
    readonly format: 'mp3' | 'wav';
    readonly audioExt: '.mp3' | '.wav';
    readonly modelId?: string;

    constructor(opts?: {
        contextId?: string;
        voiceId?: string;
        format?: 'mp3' | 'wav';
        modelId?: string;
    }) {
        this.contextId = opts?.contextId || uuidv4();
        this.voiceId = opts?.voiceId || process.env.CARTESIA_VOICE;
        this.format = opts?.format === 'wav' ? 'wav' : 'mp3';
        this.audioExt = this.format === 'wav' ? '.wav' : '.mp3';
        this.modelId = opts?.modelId || process.env.CARTESIA_TTS_MODEL;

        this.donePromise = new Promise((res, rej) => {
            this.resolveDone = res;
            this.rejectDone = rej;
        });
    }

    async connect(): Promise<void> {
        const apiKey = process.env.CARTESIA_API_KEY;
        if (!apiKey) throw new Error('CARTESIA_API_KEY not set in environment');

        const wsUrl = process.env.CARTESIA_TTS_WS_URL || 'wss://api.cartesia.ai/tts/websocket';
        const version = process.env.CARTESIA_VERSION || '2025-04-16';

        console.log(`    WebSocket URL: ${wsUrl}`);
        console.log(`    Version: ${version}`);

        this.ws = new WebSocket(wsUrl, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Cartesia-Version': version,
            },
        });

        this.ws.on('open', () => {
            console.log('    WebSocket opened successfully');
            try {
                // Send a session start/update message to establish format/voice/model
                const srEnv = process.env.CARTESIA_SAMPLE_RATE;
                const sampleRate = srEnv && Number(srEnv) > 0 ? Number(srEnv) : 44100;
                let output_format: any;
                if (this.format === 'wav') {
                    output_format = { container: 'wav', encoding: 'pcm_s16le', sample_rate: sampleRate };
                } else {
                    output_format = { container: 'mp3', encoding: 'mp3', sample_rate: sampleRate };
                }
                const startMsg: any = {
                    context_id: this.contextId,
                    type: 'start',
                    output_format,
                };
                if (this.modelId) startMsg.model_id = this.modelId;
                if (this.voiceId) startMsg.voice = { mode: 'id', id: this.voiceId };
                if (process.env.DEBUG) {
                    console.log('    Sending WS start message:', JSON.stringify(startMsg));
                }
                this.ws.send(JSON.stringify(startMsg));
            } catch (e) {
                console.warn('    Failed to send WS start message:', (e as Error)?.message || e);
            }
        });

        this.ws.on('message', (data, isBinary) => {
            try {
                if (isBinary || Buffer.isBuffer(data)) {
                    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
                    console.log(`    Received binary data: ${buf.length} bytes`);
                    this.chunks.push(buf);
                    
                    // If this appears to be the final chunk (small size might indicate end)
                    // or if we have substantial audio data, we might be done
                    if (this.chunks.length >= 2) {
                        // Give a bit more time for potential "done" message, but don't wait forever
                        setTimeout(() => {
                            if (!this.closed && this.chunks.length > 0) {
                                console.log('    Auto-completing due to received audio data');
                                this.succeed();
                            }
                        }, 2000); // Wait 2 seconds after last audio chunk
                    }
                    return;
                }

                const str = data.toString();
                console.log(`    Received text message: ${str.slice(0, 200)}`);
                let msg: any;
                try {
                    msg = JSON.parse(str);
                } catch {
                    console.warn('    Failed to parse JSON message');
                    return;
                }

                if (typeof msg.audio === 'string') {
                    const buf = Buffer.from(msg.audio, 'base64');
                    console.log(`    Received base64 audio: ${buf.length} bytes`);
                    this.chunks.push(buf);
                    return;
                }

                if (msg.error || msg.type === 'error') {
                    const message = msg.message || msg.error || 'Cartesia WS error';
                    console.log(`    Error message: ${message}`);
                    this.fail(new Error(message));
                    return;
                }

                if (msg.type === 'done' || msg.done === true) {
                    console.log(`    Received done message for context: ${msg.context_id}`);
                    if (!msg.context_id || msg.context_id === this.contextId) {
                        this.succeed();
                        return;
                    }
                }
            } catch (e) {
                console.log(`    Message handling error: ${e}`);
                this.fail(e as Error);
            }
        });

        this.ws.on('error', (err) => {
            console.log(`    WebSocket error: ${err.message}`);
            this.fail(err as Error);
        });

        this.ws.on('close', (code) => {
            console.log(`    WebSocket closed with code: ${code}`);
            console.log(`    Total chunks received: ${this.chunks.length}`);

            if (this.chunks.length > 0) {
                // Attempt to finalize with validation/repair
                this.succeed();
            } else if (code !== 1000) {
                this.fail(new Error(`Cartesia WS closed unexpectedly (${code})`));
            } else {
                this.fail(new Error('Cartesia WS closed without audio'));
            }
        });

        const timeoutMs = Number(process.env.CARTESIA_WS_TIMEOUT_MS || 30000);
        this.timer = setTimeout(() => {
            console.log(`    WebSocket timeout after ${timeoutMs}ms`);
            this.fail(new Error(`Cartesia WS timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        await new Promise<void>((resolve, reject) => {
            this.ws.once('open', () => resolve());
            this.ws.once('error', reject);
        });

        this.keepAlive = setInterval(() => {
            try {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    (this.ws as any).ping?.();
                }
            } catch {}
        }, 20000);
    }

    sendPart(transcript: string, options?: { continue?: boolean }) {
        if (this.closed || this.ws?.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }

        // Create output format based on format
        let output_format: any;
        if (this.format === 'wav') {
            const sampleRate = Number(process.env.CARTESIA_SAMPLE_RATE) || 44100;
            output_format = {
                container: 'wav',
                encoding: 'pcm_s16le',
                sample_rate: sampleRate
            };
        } else {
            // For MP3, include sample rate for consistency
            const sampleRate = Number(process.env.CARTESIA_SAMPLE_RATE) || 44100;
            output_format = {
                container: 'mp3',
                encoding: 'mp3',
                sample_rate: sampleRate
            };
        }

        const payload: any = {
            context_id: this.contextId,
            type: 'speak',
            transcript,
            continue: options?.continue ?? true,
            output_format,
        };

        if (this.voiceId) payload.voice = { mode: 'id', id: this.voiceId };
        if (this.modelId) payload.model_id = this.modelId;

        console.log(`    Sending payload: ${JSON.stringify(payload).slice(0, 300)}...`);
        this.ws.send(JSON.stringify(payload));
    }

    finish() {
        if (this.closed || this.ws?.readyState !== WebSocket.OPEN) return;
        if (this.finishSent) return;

        this.finishSent = true;
        const payload: any = {
            context_id: this.contextId,
            type: 'finish',
            transcript: '',
            continue: false
        };

        if (this.modelId) payload.model_id = this.modelId;
        if (this.voiceId) payload.voice = { mode: 'id', id: this.voiceId };

        this.ws.send(JSON.stringify(payload));
    }

    async waitUntilDone(): Promise<{ audio: Uint8Array; extension: string }> {
        const { audio } = await this.donePromise;
        return { audio, extension: this.audioExt };
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        if (this.timer) clearTimeout(this.timer);
        if (this.keepAlive) clearInterval(this.keepAlive);
        try {
            this.ws?.close();
        } catch {}
    }

    private succeed() {
        if (this.closed) return;
        this.closed = true;
        if (this.timer) clearTimeout(this.timer);
        if (this.keepAlive) clearInterval(this.keepAlive);

        const concatenated = Buffer.concat(this.chunks);

        // If audio is too small, consider it invalid to trigger REST fallback
        if (!concatenated || concatenated.length < 2048) {
            this.rejectDone?.(new Error(`Cartesia WS produced insufficient audio data (${concatenated?.length || 0} bytes)`));
            try { this.ws.close(); } catch {}
            return;
        }

        // Helpers to validate/repair audio
        const isLikelyWav = (buf: Buffer) => buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';
        const isLikelyMp3 = (buf: Buffer) => {
            if (buf.length < 2) return false;
            if (buf.toString('ascii', 0, 3) === 'ID3') return true; // ID3 header
            // Frame sync: 11 bits set
            return (buf[0] === 0xff) && ((buf[1] & 0xe0) === 0xe0);
        };
        const pcm16leToWav = (pcm: Buffer, sampleRate: number, channels: number = 1, bitsPerSample: number = 16) => {
            const byteRate = (sampleRate * channels * bitsPerSample) / 8;
            const blockAlign = (channels * bitsPerSample) / 8;
            const wav = Buffer.alloc(44 + pcm.length);
            // RIFF header
            wav.write('RIFF', 0);
            wav.writeUInt32LE(36 + pcm.length, 4);
            wav.write('WAVE', 8);
            // fmt chunk
            wav.write('fmt ', 12);
            wav.writeUInt32LE(16, 16); // PCM chunk size
            wav.writeUInt16LE(1, 20); // PCM format
            wav.writeUInt16LE(channels, 22);
            wav.writeUInt32LE(sampleRate, 24);
            wav.writeUInt32LE(byteRate, 28);
            wav.writeUInt16LE(blockAlign, 32);
            wav.writeUInt16LE(bitsPerSample, 34);
            // data chunk
            wav.write('data', 36);
            wav.writeUInt32LE(pcm.length, 40);
            pcm.copy(wav, 44);
            return wav;
        };

        let outBuf = concatenated;
        if (this.format === 'wav') {
            // If it doesn't look like a WAV, assume PCM_s16le and wrap with a WAV header
            if (!isLikelyWav(outBuf)) {
                const srEnv = process.env.CARTESIA_SAMPLE_RATE;
                const sampleRate = srEnv && Number(srEnv) > 0 ? Number(srEnv) : 44100;
                outBuf = pcm16leToWav(outBuf, sampleRate, 1, 16);
            }
            this.resolveDone?.({ audio: new Uint8Array(outBuf) });
        } else {
            // mp3 path: ensure it looks like valid MP3; otherwise treat as failure
            if (!isLikelyMp3(outBuf)) {
                this.rejectDone?.(new Error('Cartesia WS returned data that does not look like MP3 audio'));
                try { this.ws.close(); } catch {}
                return;
            }
            this.resolveDone?.({ audio: new Uint8Array(outBuf) });
        }

        try {
            this.ws.close();
        } catch {}
    }

    private fail(err: Error) {
        if (this.closed) return;
        this.closed = true;
        if (this.timer) clearTimeout(this.timer);
        if (this.keepAlive) clearInterval(this.keepAlive);
        this.rejectDone?.(err);
        try {
            this.ws.close();
        } catch {}
    }
}

// -----------------------------
// Utilities
// -----------------------------
function ensureExtension(pathname: string, ext: string): string {
    const lower = pathname.toLowerCase();
    if (lower.endsWith(ext.toLowerCase())) return pathname;

    const knownExts = ['.mp3', '.wav', '.opus', '.aac', '.flac', '.ulaw', '.alaw'];
    for (const k of knownExts) {
        if (lower.endsWith(k)) {
            return pathname.slice(0, -k.length) + ext;
        }
    }
    return pathname + ext;
}

async function writeBinaryFile(pathname: string, data: ArrayBuffer | Uint8Array) {
    const abs = resolve(pathname);
    // Use Buffer.from for both ArrayBuffer and Uint8Array to avoid invalid instanceof narrowing in TS
    const buf = Buffer.from(data as any);
    await fs.writeFile(abs, buf);
    return abs;
}

function sanitizeFilenamePart(s: string | undefined | null): string | undefined {
    if (!s) return undefined;
    return s
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function buildOutPath(base: string, ext: string, parts: Array<string | undefined>): string {
    const safeParts = parts.map(sanitizeFilenamePart).filter(Boolean) as string[];
    const withSuffix = safeParts.length ? `${base}-${safeParts.join('-')}` : base;
    return ensureExtension(withSuffix, ext);
}

function shortId(): string {
    return uuidv4().slice(0, 8);
}

function splitIntoCartesiaFriendlyChunks(input: string): string[] {
    const trimmed = input?.trim() || '';
    if (!trimmed) return [];

    const sentenceLike = trimmed.match(/[^.!?]+[.!?]?\s*/g);
    if (sentenceLike && sentenceLike.length > 1) {
        return sentenceLike;
    }

    // Fallback: split by words
    const tokens = trimmed.split(/(\s+)/);
    const chunks: string[] = [];
    let buf = '';
    let wordCount = 0;
    const wordsPerChunk = 6;

    for (const t of tokens) {
        buf += t;
        if (!t.trim()) continue;
        wordCount++;
        if (wordCount >= wordsPerChunk) {
            chunks.push(buf);
            buf = '';
            wordCount = 0;
        }
    }
    if (buf) chunks.push(buf);
    return chunks;
}

function assertValidCartesiaVoice(voiceId?: string) {
    const v = (voiceId || '').trim();
    if (!v) {
        throw new Error('Cartesia TTS requires a voice id. Set CARTESIA_VOICE environment variable.');
    }
}

// -----------------------------
// Deepgram TTS (REST)
// -----------------------------
async function synthesizeWithDeepgram(text: string, model?: string, format: string = 'mp3') {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set in environment');

    const chosenModel = model || process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en';

    // Normalize and validate Deepgram encoding
    const requested = (format || 'mp3').toLowerCase();
    const allowed = ['mp3', 'opus', 'aac', 'flac', 'linear16', 'mulaw', 'alaw'];
    const encoding = allowed.includes(requested) ? requested : 'mp3';
    if (requested !== encoding) {
        console.warn(`⚠️ Unsupported Deepgram encoding "${requested}". Falling back to "${encoding}".`);
    }

    const url = new URL('https://api.deepgram.com/v1/speak');
    url.searchParams.set('model', chosenModel);
    url.searchParams.set('encoding', encoding);

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json'
            // Do not set Accept; let Deepgram choose appropriate content type for encoding
        } as any,
        body: JSON.stringify({ text }),
    } as any);

    if (!res.ok) {
        const textErr = await res.text().catch(() => '');
        throw new Error(`Deepgram TTS HTTP ${res.status}: ${textErr}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const extMap: Record<string, string> = {
        mp3: '.mp3',
        opus: '.opus',
        aac: '.aac',
        flac: '.flac',
        linear16: '.wav',
        mulaw: '.ulaw',
        alaw: '.alaw',
    };
    const ext = extMap[encoding] || '.mp3';
    return { audio: arrayBuf, extension: ext, model: chosenModel };
}

async function synthesizeWithCartesiaREST(text: string, voice?: string, format: string = 'mp3') {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) throw new Error('CARTESIA_API_KEY not set in environment');

    const version = process.env.CARTESIA_VERSION || '2025-04-16';
    const model_id = process.env.CARTESIA_TTS_MODEL;

    // Create output format based on requested format
    // Important: Cartesia requires a valid non-zero sample_rate. Default to 44100 when not provided.
    let output_format: any;
    const srEnv = process.env.CARTESIA_SAMPLE_RATE;
    const sampleRate = srEnv && Number(srEnv) > 0 ? Number(srEnv) : 44100;
    if (format === 'wav') {
        output_format = {
            container: 'wav',
            encoding: 'pcm_s16le',
            sample_rate: sampleRate,
        };
    } else {
        output_format = {
            container: 'mp3',
            encoding: 'mp3',
            sample_rate: sampleRate,
        };
    }

    const voiceId = voice || process.env.CARTESIA_VOICE;
    assertValidCartesiaVoice(voiceId);

    const body = {
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        output_format,
        ...(model_id ? { model_id } : {})
    };

    // Debug: Show exactly what we're sending
    console.log('🔍 Cartesia REST Debug:');
    console.log(`  Format requested: ${format}`);
    console.log(`  CARTESIA_SAMPLE_RATE env: ${process.env.CARTESIA_SAMPLE_RATE || 'not set'}`);
    console.log(`  Output format object:`, JSON.stringify(output_format, null, 2));
    console.log(`  Full request body:`, JSON.stringify(body, null, 2));

    const res = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Cartesia-Version': version,
            'Content-Type': 'application/json',
            Accept: format === 'wav' ? 'audio/wav' : 'audio/mpeg',
        },
        body: JSON.stringify(body),
    } as any);

    console.log(`  HTTP Status: ${res.status}`);

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.log(`  Error Response: ${errText}`);
        throw new Error(`Cartesia TTS HTTP ${res.status}: ${errText}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const ext = format === 'wav' ? '.wav' : '.mp3';
    return { audio: arrayBuf, extension: ext, voice: voiceId, model: model_id };
}

async function synthesizeWithCartesia(text: string, voice?: string, format: string = 'mp3') {
    console.log('🔍 Cartesia Environment Check:');
    console.log(`  CARTESIA_API_KEY: ${process.env.CARTESIA_API_KEY ? 'Set' : 'Missing'}`);
    console.log(`  CARTESIA_VOICE: ${process.env.CARTESIA_VOICE || 'Missing'}`);

    // Try WebSocket first (preferred)
    try {
        assertValidCartesiaVoice(voice || process.env.CARTESIA_VOICE);
        const client = new CartesiaStreamingTTSClient({
            voiceId: voice || process.env.CARTESIA_VOICE,
            format: (format as 'mp3' | 'wav') || 'mp3',
            modelId: process.env.CARTESIA_TTS_MODEL,
        });

        console.log('  Connecting to WebSocket...');
        await client.connect();

        console.log('  Sending text chunks...');
        const chunks = splitIntoCartesiaFriendlyChunks(text);
        console.log(`  Text split into ${chunks.length} chunks`);

        for (let i = 0; i < chunks.length; i++) {
            const isLast = i === chunks.length - 1;
            console.log(`  Sending chunk ${i + 1}/${chunks.length}: "${chunks[i].slice(0, 50)}..."`);
            client.sendPart(chunks[i], { continue: !isLast });
        }

        console.log('  Finishing synthesis...');
        client.finish();

        const { audio, extension } = await client.waitUntilDone();
        client.close();

        return {
            audio,
            extension,
            voice: voice || process.env.CARTESIA_VOICE,
            model: process.env.CARTESIA_TTS_MODEL,
        };
    } catch (e) {
        console.warn(`  WebSocket failed: ${e instanceof Error ? e.message : String(e)}. Falling back to REST...`);
    }

    // Fallback to REST
    return await synthesizeWithCartesiaREST(text, voice, format);
}

// -----------------------------
// Main Function
// -----------------------------
async function main() {
    // Parse arguments: prioritize command line over environment
    const textArg = process.argv[2] || process.env.TTS_TEXT || 'Hello! This is a test of the text to speech system.';
    const cliProvider = process.argv[3];
    const envProvider = process.env.TTS_PROVIDER;
    const providerArg = (cliProvider || envProvider || 'both').toLowerCase();
    const outBaseArg = process.env.TTS_OUTPUT_BASE || 'files/tts-sample';
    const format = (process.env.TTS_FORMAT || 'mp3').toLowerCase();

    console.log('🧪 TTS Test Script');
    console.log(`• Text: "${textArg}"`);
    console.log(`• Provider: ${providerArg}`);
    console.log(`• Format: ${format}`);
    console.log(`• Output base: ${resolve(outBaseArg)}`);
    console.log('');

    // Test Deepgram if requested
    if (providerArg === 'deepgram' || providerArg === 'both') {
        try {
            console.log('🗣️  Deepgram synthesis...');
            const model = process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en';
            const { audio, extension, model: usedModel } = await synthesizeWithDeepgram(textArg, model, format);

            // Deepgram-specific filename: deepgram-model-shortid
            const outPath = buildOutPath(
                outBaseArg,
                extension as any,
                ['deepgram', usedModel, shortId()]
            );

            const saved = await writeBinaryFile(outPath, audio);
            console.log('✅ Deepgram audio saved:', saved);
        } catch (err) {
            console.error('❌ Deepgram TTS failed:', err instanceof Error ? err.message : String(err));
        }
    }

    // Test Cartesia if requested
    if (providerArg === 'cartesia' || providerArg === 'both') {
        try {
            console.log('🗣️  Cartesia synthesis...');
            const voice = process.env.CARTESIA_VOICE;
            const { audio, extension, voice: usedVoice } = await synthesizeWithCartesia(textArg, voice, format);

            // Cartesia-specific filename: cartesia-voiceid-shortid
            const outPath = buildOutPath(
                outBaseArg,
                extension as any,
                ['cartesia', usedVoice || voice, shortId()]
            );

            const saved = await writeBinaryFile(outPath, audio);
            console.log('✅ Cartesia audio saved:', saved);
        } catch (err) {
            console.error('❌ Cartesia TTS failed:', err instanceof Error ? err.message : String(err));
            console.error('💡 Verify your CARTESIA_API_KEY and CARTESIA_VOICE are correctly set.');
        }
    }

    // Validate provider argument
    if (!['deepgram', 'cartesia', 'both'].includes(providerArg)) {
        console.error(`❌ Invalid provider: ${providerArg}. Use 'deepgram', 'cartesia', or 'both'.`);
        process.exit(1);
    }
}

// Execute if run directly
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error('❌ TTS test script error:', error);
        process.exit(1);
    });
}