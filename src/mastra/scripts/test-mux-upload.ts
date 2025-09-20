import 'dotenv/config';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { muxMcpClient as uploadClient } from '../mcp/mux-upload-client';

/**
 * Script-test for mux-upload-client using /files/uploads as sample location.
 * - Reads a sample file from files/uploads (default mux-sample.mp4)
 * - Mocks internal MCP client and ensures the file path is forwarded via tool execute
 */
async function main() {
  const samplePath = process.env.MUX_SAMPLE_FILE || 'files/uploads/samples/mux-sample.wav';
  const absPath = resolve(samplePath);

  // Ensure the file exists
  try {
    await fs.access(absPath);
  } catch {
    throw new Error(`Sample file not found at ${absPath}. Place a sample in /files/uploads/ or set MUX_SAMPLE_FILE`);
  }

  const anyClient: any = uploadClient as any;
  anyClient.ensureConnected = async () => {};

  const calls: Array<{ name: string; arguments: any }> = [];
  anyClient.client = {
    listTools: async () => ({
      tools: [
        {
          name: 'video.uploads.create',
          description: 'Create an upload (mock)',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to local file to upload' },
              playback_policy: { type: 'string' },
            },
            required: ['path'],
          },
        },
      ],
    }),
    callTool: async ({ name, arguments: args }: any) => {
      calls.push({ name, arguments: args });
      return { content: [{ type: 'text', text: `uploaded:${args?.path || ''}` }] };
    },
  };

  const tools = await anyClient.getTools();
  const create = tools['video.uploads.create'];
  if (!create) throw new Error('Expected tool video.uploads.create to be available');

  await create.execute({ context: { path: absPath, playback_policy: 'public' } });
  const last = calls.at(-1);
  if (!last) throw new Error('No tool calls captured');
  if (last.name !== 'video.uploads.create') throw new Error('Unexpected tool name invoked');
  if (!last.arguments || last.arguments.path !== absPath) throw new Error('File path was not forwarded to callTool');

  console.log('✅ mux-upload-client test passed (file path forwarded):', absPath);
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ mux-upload-client test failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
