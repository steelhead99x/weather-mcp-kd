import 'dotenv/config';
import { pathToFileURL } from 'url';
import { muxMcpClient as assetsClient } from '../mcp/mux-assets-client';

/**
 * Script-test for mux-assets-client.getTools()
 * - Mocks internal connection to avoid network/Mux dependency
 * - Verifies that tools are converted via createTool and executable
 */
async function main() {
  // Monkey-patch the private ensureConnected to a no-op and inject a fake client
  const anyClient: any = assetsClient as any;

  // Replace ensureConnected with a no-op
  anyClient.ensureConnected = async () => {};

  // Provide a fake MCP client with listTools and callTool
  const calls: Array<{ name: string; arguments: any }> = [];
  anyClient.client = {
    listTools: async () => ({
      tools: [
        {
          name: 'video.assets.list',
          description: 'List assets',
          inputSchema: { type: 'object', properties: { limit: { type: 'number' } }, required: [] },
        },
        {
          name: 'video.assets.get',
          description: 'Get asset by id',
          inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
      ],
    }),
    callTool: async ({ name, arguments: args }: any) => {
      calls.push({ name, arguments: args });
      // echo back minimal content to match expected shape
      return { content: [{ type: 'text', text: `called:${name}` }] };
    },
  };

  const tools = await anyClient.getTools();
  if (!tools || typeof tools !== 'object') throw new Error('getTools() did not return an object');

  // Ensure both tools were wired
  const expectedTools = ['video.assets.list', 'video.assets.get'];
  for (const t of expectedTools) {
    if (!tools[t]) throw new Error(`Missing tool ${t}`);
  }

  // Call an execute to ensure it proxies correctly
  const execRes = await tools['video.assets.get'].execute({ context: { id: 'tomcat' } });
  const last = calls.at(-1);
  if (!last || last.name !== 'video.assets.get') throw new Error('callTool was not invoked');
  if (!last.arguments || last.arguments.id !== 'tomcat') throw new Error('Arguments not forwarded');

  console.log('✅ mux-assets-client test passed');
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]!).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ mux-assets-client test failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
