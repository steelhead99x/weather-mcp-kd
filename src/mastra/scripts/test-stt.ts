import 'dotenv/config';
import { promises as fs } from 'fs';
import { basename, resolve } from 'path';
import { pathToFileURL } from 'url';

// Utility to read audio file as Buffer
async function readAudioFile(filePath: string): Promise<Buffer> {
  const abs = resolve(filePath);
  return await fs.readFile(abs);
}

// Try to infer basic content-type from extension
function guessContentType(filePath: string): string {
  const name = filePath.toLowerCase();
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.m4a')) return 'audio/m4a';
  if (name.endsWith('.webm')) return 'audio/webm';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  return 'application/octet-stream';
}

// Deepgram transcription using REST API
async function transcribeWithDeepgram(audio: Buffer, contentType: string) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY not set in environment');
  }

  const url = new URL('https://api.deepgram.com/v1/listen');
  // Choose a modern model; can be overridden via env
  url.searchParams.set('model', process.env.DEEPGRAM_MODEL || 'nova-2-general');
  // Optional params
  url.searchParams.set('smart_format', 'true');
  if (process.env.DEEPGRAM_LANGUAGE) url.searchParams.set('language', process.env.DEEPGRAM_LANGUAGE);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
      Accept: 'application/json',
    },
    body: audio,
  } as any);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deepgram HTTP ${res.status}: ${text}`);
  }

  const json = await res.json() as any;
  // Deepgram JSON structure typically includes results.channels[0].alternatives[0].transcript
  const transcript = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? json?.result ?? JSON.stringify(json);
  return { transcript, raw: json };
}

// Cartesia transcription using multipart form data
async function transcribeWithCartesia(audio: Buffer, contentType: string) {
  const apiKey = process.env.CARTESIA_API_KEY;
  const apiUrl = process.env.CARTESIA_API_URL || 'https://api.cartesia.ai/stt/transcribe';
  const version = process.env.CARTESIA_VERSION || '2025-04-16';
  const model = process.env.CARTESIA_STT_MODEL || 'whisper-large-v3';

  if (!apiKey) {
    throw new Error(
      'Cartesia STT not configured. Please set CARTESIA_API_KEY in your .env.'
    );
  }

  // Create FormData for multipart upload
  const formData = new FormData();
  
  // Create a Blob from the audio buffer with the appropriate MIME type
  const audioBlob = new Blob([audio], { type: contentType });
  
  // Append the audio file - the field name might be 'file' or 'audio'
  formData.append('file', audioBlob, 'audio_file');
  
  // Add model parameter if specified
  if (model) {
    formData.append('model', model);
  }

  // Add any other optional parameters
  if (process.env.CARTESIA_LANGUAGE) {
    formData.append('language', process.env.CARTESIA_LANGUAGE);
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Cartesia-Version': version,
      // Don't set Content-Type header - let fetch set it automatically for FormData
    },
    body: formData,
  } as any);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cartesia HTTP ${res.status}: ${text}`);
  }

  const json = await res.json() as any;
  // Try common fields for transcription response
  const transcript = json?.transcript ?? json?.text ?? json?.result ?? JSON.stringify(json);
  return { transcript, raw: json };
}

async function main() {
  // Support env-configured input and output paths
  const fileArg = process.env.STT_INPUT_FILE || process.argv[2] || 'files/samples/mux-sample.wav';
  const providerArg = (process.env.STT_PROVIDER || process.argv[3] || 'both').toLowerCase(); // deepgram | cartesia | both
  const outputPath = process.env.STT_OUTPUT_FILE || process.argv[4]; // optional: where to save transcript(s)
  const contentType = guessContentType(fileArg);

  console.log('🧪 STT Test Script');
  console.log(`• Audio file: ${resolve(fileArg)} (${basename(fileArg)})`);
  console.log(`• Content-Type: ${contentType}`);
  console.log(`• Provider: ${providerArg}`);
  if (outputPath) console.log(`• Output file: ${resolve(outputPath)}`);
  console.log('');

  const audio = await readAudioFile(fileArg);

  // Collect transcripts for optional saving
  const results: Record<string, string | undefined> = {};

  if (providerArg === 'deepgram' || providerArg === 'both') {
    try {
      console.log('🎧 Deepgram transcription...');
      const { transcript } = await transcribeWithDeepgram(audio, contentType);
      results.deepgram = transcript;
      console.log('✅ Deepgram Transcript:\n' + transcript + '\n');
    } catch (err) {
      console.error('❌ Deepgram failed:', err instanceof Error ? err.message : String(err));
    }
  }

  if (providerArg === 'cartesia' || providerArg === 'both') {
    try {
      console.log('🎧 Cartesia transcription...');
      const { transcript } = await transcribeWithCartesia(audio, contentType);
      results.cartesia = transcript;
      console.log('✅ Cartesia Transcript:\n' + transcript + '\n');
    } catch (err) {
      console.error('❌ Cartesia failed:', err instanceof Error ? err.message : String(err));
      console.error('💡 If this provider name is incorrect, please clarify the service and credentials.');
    }
  }

  if (outputPath) {
    try {
      const abs = resolve(outputPath);
      if (abs.toLowerCase().endsWith('.json')) {
        await fs.writeFile(abs, Buffer.from(JSON.stringify(results, null, 2), 'utf8'));
      } else {
        const text = [
          results.deepgram ? `Deepgram:\n${results.deepgram}` : undefined,
          results.cartesia ? `Cartesia:\n${results.cartesia}` : undefined,
        ].filter(Boolean).join('\n\n');
        await fs.writeFile(abs, Buffer.from(text, 'utf8'));
      }
      console.log('📝 Transcripts saved to:', abs);
    } catch (err) {
      console.error('❌ Failed to write transcripts:', err instanceof Error ? err.message : String(err));
    }
  }
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error('❌ STT test script error:', error);
    process.exit(1);
  });
}
