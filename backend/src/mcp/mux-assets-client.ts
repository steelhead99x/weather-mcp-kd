// TypeScript: MCP client wrapper for Mux Assets tools
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";

class Logger {
    private static logLevel: keyof typeof Logger.levels = process.env.NODE_ENV === 'production' ? 'error' : 'debug';
    private static levels = { debug: 0, info: 1, warn: 2, error: 3 };
    private static shouldLog(level: keyof typeof Logger.levels): boolean {
        const levelMap = Logger.levels;
        const currentLevel = (levelMap as Record<string, number>)[Logger.logLevel] ?? levelMap.error;
        const requestedLevel = levelMap[level];
        return requestedLevel >= currentLevel;
    }
    static debug(message: string, ...args: any[]) { if (Logger.shouldLog('debug')) console.log(`[DEBUG] ${message}`, ...args); }
    static info(message: string, ...args: any[]) { if (Logger.shouldLog('info')) console.log(`[INFO] ${message}`, ...args); }
    static warn(message: string, ...args: any[]) { if (Logger.shouldLog('warn')) console.warn(`[WARN] ${message}`, ...args); }
    static error(message: string, ...args: any[]) { if (Logger.shouldLog('error')) console.error(`[ERROR] ${message}`, ...args); }
}

class MuxAssetsMCPClient {
    private static readonly MIN_CONNECTION_TIMEOUT = 5000;
    private static readonly MAX_CONNECTION_TIMEOUT = 600000;  // 10 minutes maximum
    private static readonly DEFAULT_CONNECTION_TIMEOUT = 120000; // 2 minutes default

    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private connected = false;
    private connectionPromise: Promise<void> | null = null;
    private keepAliveInterval: NodeJS.Timeout | null = null;

    private getConnectionTimeout(): number {
        const envTimeout = process.env.MUX_CONNECTION_TIMEOUT;
        if (!envTimeout) return MuxAssetsMCPClient.DEFAULT_CONNECTION_TIMEOUT;
        const parsed = parseInt(envTimeout, 10);
        if (isNaN(parsed)) return MuxAssetsMCPClient.DEFAULT_CONNECTION_TIMEOUT;
        return Math.min(MuxAssetsMCPClient.MAX_CONNECTION_TIMEOUT, Math.max(MuxAssetsMCPClient.MIN_CONNECTION_TIMEOUT, parsed));
    }

    private async ensureConnected(): Promise<void> {
        if (this.connected && this.client) return;
        if (this.connectionPromise) return this.connectionPromise;
        this.connectionPromise = this.performConnection();
        try { await this.connectionPromise; } finally { this.connectionPromise = null; }
    }

    private async performConnection(): Promise<void> {
        if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
            throw new Error("Missing MUX_TOKEN_ID or MUX_TOKEN_SECRET in environment");
        }
        const mcpArgs = this.parseMcpArgs(process.env.MUX_MCP_ASSETS_ARGS);
        Logger.info("Connecting to Mux MCP (assets)...");
        console.debug(`MCP Args: ${mcpArgs.join(' ')}`);

        console.debug("[MuxAssetsMCP] Creating StdioClientTransport...");
        this.transport = new StdioClientTransport({
            command: "npx",
            args: mcpArgs,
            env: {
                ...process.env,
                MUX_TOKEN_ID: process.env.MUX_TOKEN_ID,
                MUX_TOKEN_SECRET: process.env.MUX_TOKEN_SECRET,
            },
        });

        console.debug("[MuxAssetsMCP] Creating MCP Client...");
        this.client = new Client({ name: "mux-assets-mastra-client", version: "1.0.0" }, { capabilities: {} });

        const connectionTimeout = this.getConnectionTimeout();
        console.debug(`[MuxAssetsMCP] Starting connection with timeout: ${connectionTimeout}ms`);
        
        const connectionPromise = this.client.connect(this.transport);
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                console.error(`[MuxAssetsMCP] Connection timeout after ${connectionTimeout}ms`);
                reject(new Error(`Connection timeout after ${connectionTimeout}ms`));
            }, connectionTimeout);
        });
        
        console.debug("[MuxAssetsMCP] Waiting for connection...");
        await Promise.race([connectionPromise, timeoutPromise]);
        this.connected = true;
        Logger.info("Connected to Mux MCP (assets)");
        
        // Start keep-alive mechanism
        this.startKeepAlive();
    }

    /**
     * Start keep-alive mechanism to prevent connection timeouts
     */
    private startKeepAlive(): void {
        // Clear any existing keep-alive interval
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
        }
        
        // Send a ping every 30 seconds to keep the connection alive
        this.keepAliveInterval = setInterval(async () => {
            if (this.connected && this.client) {
                try {
                    // Send a simple ping by listing tools (lightweight operation)
                    await this.client.listTools();
                } catch (error) {
                    console.debug('[MuxAssetsMCP] Keep-alive ping failed:', error);
                    // Don't throw here, just log the error
                }
            }
        }, 30000); // 30 seconds
    }

    /**
     * Stop keep-alive mechanism
     */
    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    private parseMcpArgs(envValue: string | undefined): string[] {
        // TEMPORARY WORKAROUND: Use generic tools instead of specific video.assets resource
        // This avoids potential union type bugs in endpoint validation
        const defaultArgs = ["@mux/mcp", "client=claude", "--tools=dynamic"]; 
        const value = (envValue || '').trim();
        if (!value) return defaultArgs;
        if (value.length > 1000) return defaultArgs;
        try {
            const rawArgs = value.split(',').map(s => s.trim()).filter(Boolean);
            const safePattern = /^[@a-zA-Z0-9._:=\/\-]+$/;
            const processed = rawArgs.filter(a => a.length <= 200 && safePattern.test(a));
            return processed.length ? processed : defaultArgs;
        } catch {
            return defaultArgs;
        }
    }

    async getTools(): Promise<Record<string, any>> {
        await this.ensureConnected();
        if (!this.client) throw new Error("Client not connected");
        const result = await this.client.listTools();
        const tools: Record<string, any> = {};

        if (result?.tools) {
            for (const tool of result.tools) {
                try {
                    tools[tool.name] = createTool({
                        id: tool.name,
                        description: tool.description || `Mux MCP tool: ${tool.name}`,
                        inputSchema: this.convertToZodSchema(tool.inputSchema),
                        execute: async ({ context }) => {
                            if (!this.client) throw new Error("Client not connected");
                            
                            try {
                                return (await this.client.callTool({ name: tool.name, arguments: context || {} })).content;
                            } catch (error) {
                                // Handle union type errors from MCP SDK version conflicts
                                if (error instanceof Error && (
                                    error.message.includes('union is not a function') ||
                                    error.message.includes('evaluatedProperties.union') ||
                                    error.message.includes('needle.evaluatedProperties')
                                )) {
                                    console.error(`MCP SDK version conflict error for tool ${tool.name}:`, {
                                        toolName: tool.name,
                                        context,
                                        error: error.message,
                                        stack: error.stack,
                                        sdkVersion: '1.17.5+',
                                        suggestion: 'This error indicates a version conflict in @modelcontextprotocol/sdk. Please ensure all dependencies are updated.'
                                    });
                                    
                                    // Return a more user-friendly error with actionable information
                                    throw new Error(`MCP tool ${tool.name} failed due to SDK version conflict. The @modelcontextprotocol/sdk version needs to be updated to 1.17.5 or higher to resolve this issue.`);
                                }
                                throw error;
                            }
                        },
                    });
                } catch (e) {
                    Logger.warn(`Skipping tool ${tool.name}:`, e);
                    // Log the specific schema that caused the issue
                    if (e instanceof Error && e.message.includes('union')) {
                        console.error(`Union error for tool ${tool.name}:`, {
                            toolName: tool.name,
                            inputSchema: tool.inputSchema,
                            error: e.message,
                            stack: e.stack
                        });
                    }
                }
            }
        }

        // If MCP exposes generic invoke_api_endpoint, add convenient wrappers for assets endpoints
        if (tools['invoke_api_endpoint']) {
            const addWrapper = (id: string, endpoint: string, description: string, schema?: z.ZodSchema) => {
                // Do not overwrite real Mux MCP tools; only add wrapper if missing
                if (tools[id]) {
                    console.debug(`Skipping wrapper for ${id}; direct MCP tool already exists.`);
                    return;
                }
                tools[id] = createTool({
                    id,
                    description,
                    inputSchema: schema || z.object({ ASSET_ID: z.string().optional() }).passthrough(),
                    execute: async ({ context }) => {
                        if (!this.client) throw new Error("Client not connected");
                        // Prefer direct endpoint if present
                        const direct = tools[endpoint];
                        if (direct && direct !== tools[id]) return direct.execute({ context });
                        const ctx = context || {};
                        // const idVal = (ctx as any).ASSET_ID || (ctx as any).asset_id || (ctx as any).id;
                        // Use only ASSET_ID as per Mux API schema
                        // const path = idVal ? { ASSET_ID: idVal } : undefined;
                        // Filter out problematic arguments that cause union type issues
                        const filteredCtx = { ...ctx };
                        // Only filter out new_asset_settings if it's not explicitly needed for playback policy
                        if (filteredCtx.new_asset_settings && !filteredCtx.new_asset_settings.playback_policies) {
                            console.debug(`[invoke_api_endpoint] Filtering out new_asset_settings to avoid union type bug`);
                            delete filteredCtx.new_asset_settings;
                        } else if (filteredCtx.new_asset_settings?.playback_policies) {
                            console.debug(`[invoke_api_endpoint] Keeping new_asset_settings for playback policy: ${filteredCtx.new_asset_settings.playback_policies}`);
                        }
                        
                        const attemptArgs = [
                            // Correct Mux MCP format - endpoint_name with nested args
                            { endpoint_name: endpoint, args: filteredCtx },
                        ] as any[];
                        let lastErr: any;
                        for (const args of attemptArgs) {
                            try { return (await this.client.callTool({ name: 'invoke_api_endpoint', arguments: args })).content; }
                            catch (e) { lastErr = e; }
                        }
                        throw lastErr || new Error('invoke_api_endpoint failed');
                    },
                });
            };

            // Snake_case canonical endpoints
            addWrapper('retrieve_video_assets', 'retrieve_video_assets', 'Retrieve a single asset by ID');
            addWrapper('list_video_assets', 'list_video_assets', 'List assets with pagination', z.object({ limit: z.number().optional(), page: z.number().optional() }).passthrough());

            // Dotted aliases
            addWrapper('video.assets.retrieve', 'retrieve_video_assets', 'Retrieve a single asset by ID');
            addWrapper('video.assets.list', 'list_video_assets', 'List assets with pagination', z.object({ limit: z.number().optional(), page: z.number().optional() }).passthrough());
        }

        return tools;
    }

    private convertToZodSchema(inputSchema: any): z.ZodSchema {
        if (!inputSchema || typeof inputSchema !== 'object') return z.object({});
        try {
            // Handle union types (anyOf, oneOf, allOf)
            if (inputSchema.anyOf) {
                const unionTypes = inputSchema.anyOf.map((schema: any) => this.convertToZodSchema(schema));
                return z.union(unionTypes as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
            }
            
            if (inputSchema.oneOf) {
                const unionTypes = inputSchema.oneOf.map((schema: any) => this.convertToZodSchema(schema));
                return z.union(unionTypes as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
            }
            
            if (inputSchema.allOf) {
                // For allOf, we typically want to merge the schemas
                const mergedSchema = inputSchema.allOf.reduce((acc: any, schema: any) => {
                    return { ...acc, ...schema };
                }, {});
                return this.convertToZodSchema(mergedSchema);
            }

            if (inputSchema.type === 'object' && inputSchema.properties) {
                const schemaObject: Record<string, z.ZodTypeAny> = {};
                for (const [key, value] of Object.entries(inputSchema.properties)) {
                    const prop = value as any;
                    let zodType: z.ZodTypeAny = z.string();
                    switch (prop.type) {
                        case 'string': zodType = z.string(); break;
                        case 'number':
                        case 'integer': zodType = z.number(); break;
                        case 'boolean': zodType = z.boolean(); break;
                        case 'array': zodType = z.array(z.any()); break;
                        case 'object': zodType = z.object({}); break;
                        default: zodType = z.any();
                    }
                    if (prop.description) zodType = zodType.describe(prop.description);
                    const required = inputSchema.required || [];
                    if (!required.includes(key)) zodType = zodType.optional();
                    schemaObject[key] = zodType;
                }
                return z.object(schemaObject);
            }
        } catch (error) {
            console.warn("Failed to convert schema in assets client:", error);
        }
        return z.object({ ASSET_ID: z.string().optional(), limit: z.number().optional(), page: z.number().optional() });
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        
        // Stop keep-alive mechanism
        this.stopKeepAlive();
        
        if (this.transport) { try { await this.transport.close(); } catch {} this.transport = null; }
        this.client = null;
    }

    isConnected(): boolean { return this.connected; }
    async reset(): Promise<void> { await this.disconnect(); await this.ensureConnected(); }
}

export const muxMcpClient = new MuxAssetsMCPClient();

process.on('SIGINT', async () => { try { await muxMcpClient.disconnect(); } catch {} process.exit(0); });
process.on('SIGTERM', async () => { try { await muxMcpClient.disconnect(); } catch {} process.exit(0); });