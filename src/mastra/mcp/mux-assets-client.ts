// TypeScript
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";

/**
 * Simple logger with environment-based log levels
 */
class Logger {
    private static logLevel: keyof typeof Logger.levels = process.env.NODE_ENV === 'production' ? 'error' : 'debug';
    private static levels = { debug: 0, info: 1, warn: 2, error: 3 };

    private static shouldLog(level: keyof typeof Logger.levels): boolean {
        const levelMap = Logger.levels;
        // Fallback to 'error' if logLevel is ever misconfigured at runtime
        const currentLevel = (levelMap as Record<string, number>)[Logger.logLevel] ?? levelMap.error;
        const requestedLevel = levelMap[level];
        return requestedLevel >= currentLevel;
    }

    static debug(message: string, ...args: any[]) {
        if (Logger.shouldLog('debug')) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    }

    static info(message: string, ...args: any[]) {
        if (Logger.shouldLog('info')) {
            console.log(`[INFO] ${message}`, ...args);
        }
    }

    static warn(message: string, ...args: any[]) {
        if (Logger.shouldLog('warn')) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }

    static error(message: string, ...args: any[]) {
        if (Logger.shouldLog('error')) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
}

class MuxMCPAssetsClient {
    // Timeout configuration constants
    private static readonly MIN_CONNECTION_TIMEOUT = 5000;    // 5 seconds minimum
    private static readonly MAX_CONNECTION_TIMEOUT = 300000;  // 5 minutes maximum
    private static readonly DEFAULT_CONNECTION_TIMEOUT = 20000; // 20 seconds default

    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private connected = false;
    private connectionPromise: Promise<void> | null = null;

    /**
     * Get connection timeout with bounds validation
     * Supports environment variable configuration with safe defaults
     */
    private getConnectionTimeout(): number {
        const envTimeout = process.env.MUX_CONNECTION_TIMEOUT;

        // Use default if not specified
        if (!envTimeout) {
            return MuxMCPAssetsClient.DEFAULT_CONNECTION_TIMEOUT;
        }

        // Parse and validate the timeout value
        const parsedTimeout = parseInt(envTimeout, 10);

        // Check for invalid number
        if (isNaN(parsedTimeout)) {
            Logger.warn(`Invalid MUX_CONNECTION_TIMEOUT value: ${envTimeout}, using default ${MuxMCPAssetsClient.DEFAULT_CONNECTION_TIMEOUT}ms`);
            return MuxMCPAssetsClient.DEFAULT_CONNECTION_TIMEOUT;
        }

        // Apply bounds validation
        if (parsedTimeout < MuxMCPAssetsClient.MIN_CONNECTION_TIMEOUT) {
            Logger.warn(`MUX_CONNECTION_TIMEOUT too low (${parsedTimeout}ms), using minimum ${MuxMCPAssetsClient.MIN_CONNECTION_TIMEOUT}ms`);
            return MuxMCPAssetsClient.MIN_CONNECTION_TIMEOUT;
        }

        if (parsedTimeout > MuxMCPAssetsClient.MAX_CONNECTION_TIMEOUT) {
            Logger.warn(`MUX_CONNECTION_TIMEOUT too high (${parsedTimeout}ms), using maximum ${MuxMCPAssetsClient.MAX_CONNECTION_TIMEOUT}ms`);
            return MuxMCPAssetsClient.MAX_CONNECTION_TIMEOUT;
        }

        Logger.debug(`Using connection timeout: ${parsedTimeout}ms`);
        return parsedTimeout;
    }

    private async ensureConnected(): Promise<void> {
        // If already connected, return immediately
        if (this.connected && this.client) {
            return;
        }

        // If a connection attempt is already in progress, wait for it
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        // Start a new connection attempt
        this.connectionPromise = this.performConnection();

        try {
            await this.connectionPromise;
        } finally {
            // Clear the connection promise after completion (success or failure)
            this.connectionPromise = null;
        }
    }

    private async performConnection(): Promise<void> {
        // Validate environment before attempting connection
        if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
            const errorMsg = "Missing required environment variables: MUX_TOKEN_ID and MUX_TOKEN_SECRET are required. MUX_MCP_ASSETS_ARGS is optional but may affect connection behavior if misconfigured.";
            Logger.error("Environment validation failed:", errorMsg);
            throw new Error(errorMsg);
        }

        try {
            // Parse and validate MCP args from environment variable
            const mcpArgs = this.parseMcpArgs(process.env.MUX_MCP_ASSETS_ARGS);

            Logger.info("Connecting to Mux MCP Assets server...");
            Logger.debug("MUX_TOKEN_ID: [CONFIGURED]");
            Logger.debug("MUX_TOKEN_SECRET: [CONFIGURED]");
            Logger.debug(`MCP Args: ${mcpArgs.join(' ')}`);

            this.transport = new StdioClientTransport({
                command: "npx",
                args: mcpArgs,
                env: {
                    ...process.env,
                    MUX_TOKEN_ID: process.env.MUX_TOKEN_ID,
                    MUX_TOKEN_SECRET: process.env.MUX_TOKEN_SECRET,
                },
            });

            this.client = new Client(
                {
                    name: "mux-assets-mastra-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {},
                }
            );

            // Use validated connection timeout
            const connectionTimeout = this.getConnectionTimeout();
            const connectionPromise = this.client.connect(this.transport);
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Connection timeout: Failed to connect within ${connectionTimeout}ms`)), connectionTimeout);
            });

            await Promise.race([connectionPromise, timeoutPromise]);

            // Atomically update the connected state
            this.connected = true;
            Logger.info("Connected to Mux MCP Assets server successfully");

        } catch (error) {
            Logger.error("Failed to connect to Mux MCP Assets server:", error);

            // Clean up on failure
            this.connected = false;
            if (this.transport) {
                try {
                    await this.transport.close();
                } catch (closeError) {
                    Logger.debug("Error during transport cleanup:", closeError);
                }
                this.transport = null;
            }
            this.client = null;

            throw error;
        }
    }

    /**
     * Parse and validate MCP arguments from environment variable
     * Provides comprehensive security validation and fallback logic
     */
    private parseMcpArgs(envValue: string | undefined): string[] {
        const defaultArgs = ["@mux/mcp", "client=openai-agents", "--tools=dynamic", "--resource=video.assets"];

        // Use default if environment variable is not set
        if (!envValue) {
            Logger.debug("Using default MCP args (MUX_MCP_ASSETS_ARGS not set)");
            return defaultArgs;
        }

        const trimmedValue = envValue.trim();

        if (!trimmedValue) {
            Logger.warn("MUX_MCP_ASSETS_ARGS is empty, using defaults");
            return defaultArgs;
        }

        if (trimmedValue.length > 1000) {
            Logger.warn("MUX_MCP_ASSETS_ARGS too long (>1000 chars), using defaults");
            return defaultArgs;
        }

        try {
            const rawArgs = trimmedValue.split(',');
            const processedArgs: string[] = [];

            for (const rawArg of rawArgs) {
                const trimmedArg = rawArg.trim();

                if (!trimmedArg) {
                    Logger.debug("Skipping empty MCP argument");
                    continue;
                }

                if (!this.isValidMcpArgument(trimmedArg)) {
                    Logger.warn(`Skipping invalid MCP argument: ${trimmedArg}`);
                    continue;
                }

                processedArgs.push(trimmedArg);
            }

            if (processedArgs.length === 0) {
                Logger.warn("No valid MCP arguments found after parsing, using defaults");
                return defaultArgs;
            }

            if (!this.validateMcpCommandStructure(processedArgs)) {
                Logger.warn("Invalid MCP command structure, using defaults");
                return defaultArgs;
            }

            Logger.debug(`Successfully parsed ${processedArgs.length} MCP arguments`);
            return processedArgs;

        } catch (error) {
            Logger.error("Failed to parse MUX_MCP_ASSETS_ARGS:", error);
            Logger.info("Falling back to default MCP arguments");
            return defaultArgs;
        }
    }

    /**
     * Validate individual MCP argument for security and format compliance
     */
    private isValidMcpArgument(arg: string): boolean {
        // Length validation
        if (arg.length > 200) {
            return false;
        }

        // Shell injection prevention - comprehensive dangerous character list
        const dangerousChars = [';', '&', '|', '`', '$', '(', ')', '<', '>', '"', "'", '\\', '\n', '\r', '\t'];
        if (dangerousChars.some(char => arg.includes(char))) {
            return false;
        }

        // Path traversal prevention
        if (arg.includes('..') || arg.includes('//')) {
            return false;
        }

        // Null byte injection prevention
        if (arg.includes('\0')) {
            return false;
        }

        // Only allow safe characters: alphanumeric, hyphens, underscores, dots, equals, colons, forward slashes, @
        const safePattern = /^[@a-zA-Z0-9._:=\/\-]+$/;
        if (!safePattern.test(arg)) {
            return false;
        }

        // Validate specific MCP argument patterns
        if (arg.startsWith('@')) {
            // Package name validation: @scope/package-name
            const packagePattern = /^@[a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_]+$/;
            if (!packagePattern.test(arg)) {
                return false;
            }
        } else if (arg.startsWith('--')) {
            // Long option validation: --option-name or --option-name=value
            const longOptionPattern = /^--[a-zA-Z0-9\-]+(=[a-zA-Z0-9\-_.,:]+)?$/;
            if (!longOptionPattern.test(arg)) {
                return false;
            }
        } else if (arg.includes('=')) {
            // Key-value pair validation: key=value
            const keyValuePattern = /^[a-zA-Z0-9\-_]+=[a-zA-Z0-9\-_.,:]+$/;
            if (!keyValuePattern.test(arg)) {
                return false;
            }
        } else {
            // Simple argument validation: alphanumeric with limited special chars
            const simpleArgPattern = /^[a-zA-Z0-9\-_.]+$/;
            if (!simpleArgPattern.test(arg)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate the overall MCP command structure
     */
    private validateMcpCommandStructure(args: string[]): boolean {
        if (args.length === 0) {
            return false;
        }

        // First argument should be a package name (starting with @) or a command
        const firstArg = args[0];
        if (!firstArg.startsWith('@') && !firstArg.match(/^[a-zA-Z0-9\-_.]+$/)) {
            return false;
        }

        // Check for required MCP-related terms in the command
        const mcpIndicators = ['mcp', '@mux/mcp'];
        const hasMcpIndicator = args.some(arg =>
            mcpIndicators.some(indicator => arg.toLowerCase().includes(indicator))
        );

        if (!hasMcpIndicator) {
            return false;
        }

        // Validate argument count (reasonable limits)
        if (args.length > 20) {
            return false;
        }

        // Check for balanced options (no orphaned values)
        let expectingValue = false;
        for (let i = 1; i < args.length; i++) {
            const arg = args[i];

            if (arg.startsWith('--')) {
                expectingValue = !arg.includes('=');
            } else if (expectingValue) {
                expectingValue = false;
            } else if (!arg.includes('=') && !arg.startsWith('@')) {
                // Unexpected standalone argument
                return false;
            }
        }

        return true;
    }

    // Convert MCP tools to proper Mastra tools using createTool
    async getTools(): Promise<Record<string, any>> {
        await this.ensureConnected();

        if (!this.client) {
            throw new Error("Client not connected");
        }

        try {
            const result = await this.client.listTools();
            const tools: Record<string, any> = {};

            Logger.debug("Available MCP assets tools:", result?.tools?.map(t => t.name) || []);

            if (result?.tools) {
                for (const tool of result.tools) {
                    try {
                        // Create a proper Mastra tool using createTool (directly exposed by MCP)
                        tools[tool.name] = createTool({
                            id: tool.name,
                            description: tool.description || `Mux MCP Assets tool: ${tool.name}`,
                            inputSchema: this.convertToZodSchema(tool.inputSchema),
                            execute: async ({ context }) => {
                                if (!this.client) {
                                    throw new Error("Client not connected");
                                }

                                Logger.debug(`Calling MCP Assets tool: ${tool.name}`, context);

                                return (await this.client.callTool({
                                    name: tool.name,
                                    arguments: context || {},
                                })).content;
                            },
                        });
                    } catch (toolError) {
                        Logger.warn(`Skipping assets tool ${tool.name} due to error:`, toolError);
                    }
                }
            }

            // If MCP only exposes generic invoke_api_endpoint, synthesize concrete tools for video.assets
            const hasInvoke = !!tools['invoke_api_endpoint'];
            Logger.debug(`Has invoke_api_endpoint: ${hasInvoke}`);

            if (hasInvoke) {
                const addWrapper = (id: string, endpoint: string, description: string) => {
                    tools[id] = createTool({
                        id,
                        description,
                        inputSchema: z.object({
                            id: z.string().optional().describe("Asset ID"),
                        }).passthrough(),
                        execute: async ({ context }) => {
                            if (!this.client) throw new Error("Client not connected");

                            // Try direct tool call first (best case - the MCP exposes the endpoint directly)
                            const directTool = tools[endpoint];
                            if (directTool && directTool !== tools[id]) {
                                Logger.debug(`Using direct tool: ${endpoint}`);
                                return directTool.execute({ context });
                            }

                            Logger.debug(`Using invoke_api_endpoint wrapper for: ${endpoint}`);

                            const ctx = context || {};
                            const attemptArgs = [
                                // Standard format that most MCP servers expect
                                { endpoint, args: ctx },

                                // Direct endpoint call format
                                { endpoint_name: endpoint, args: ctx },

                                // Legacy formats (keep as fallback)
                                { endpoint, ...ctx },
                                { endpoint, body: ctx },
                                { endpoint, params: ctx },
                                { endpoint, data: ctx },
                                { endpoint, arguments: ctx },
                                { name: endpoint, arguments: ctx },
                                { id: endpoint, arguments: ctx },
                                { tool: endpoint, arguments: ctx },
                                { endpoint, input: ctx },
                                { endpoint, payload: ctx },
                            ];

                            let lastErr: any;
                            for (const args of attemptArgs) {
                                try {
                                    Logger.debug(`Invoking assets endpoint via wrapper: ${endpoint}`, args);
                                    const res = await this.client.callTool({ name: 'invoke_api_endpoint', arguments: args });
                                    return res.content;
                                } catch (e) {
                                    lastErr = e;
                                    const errorMsg = e instanceof Error ? e.message : String(e);
                                    Logger.warn(`invoke_api_endpoint failed with args variant, trying next: ${errorMsg}`);

                                    // Log the specific argument structure that failed for debugging
                                    if (process.env.DEBUG) {
                                        Logger.debug('Failed args structure:', JSON.stringify(args, null, 2));
                                    }
                                }
                            }
                            throw lastErr || new Error('invoke_api_endpoint failed for all argument variants');
                        },
                    });
                };

                // Primary snake_case IDs for assets endpoints
                addWrapper('get_video_assets', 'get_video_assets', 'Fetches information about a single video asset');
                addWrapper('retrieve_video_assets', 'retrieve_video_assets', 'Fetches information about a single video asset');
                addWrapper('list_video_assets', 'list_video_assets', 'Lists video assets');
                addWrapper('create_video_assets', 'create_video_assets', 'Creates a new video asset');
                addWrapper('update_video_assets', 'update_video_assets', 'Updates a video asset');
                addWrapper('delete_video_assets', 'delete_video_assets', 'Deletes a video asset');

                // Dotted aliases for convenience/compatibility
                addWrapper('video.assets.get', 'get_video_assets', 'Fetches information about a single video asset');
                addWrapper('video.assets.retrieve', 'retrieve_video_assets', 'Fetches information about a single video asset');
                addWrapper('video.assets.list', 'list_video_assets', 'Lists video assets');
                addWrapper('video.assets.create', 'create_video_assets', 'Creates a new video asset');
                addWrapper('video.assets.update', 'update_video_assets', 'Updates a video asset');
                addWrapper('video.assets.delete', 'delete_video_assets', 'Deletes a video asset');
            }

            Logger.info(`Successfully created ${Object.keys(tools).length} Mastra assets tools from MCP`);
            Logger.debug("Final assets tool names:", Object.keys(tools));
            return tools;
        } catch (error) {
            Logger.error("Failed to get assets tools:", error);
            throw error;
        }
    }

    // Convert MCP input schema to Zod schema
    private convertToZodSchema(inputSchema: any): z.ZodSchema {
        if (!inputSchema || typeof inputSchema !== 'object') {
            return z.object({});
        }

        try {
            // Handle JSON Schema to Zod conversion
            if (inputSchema.type === 'object' && inputSchema.properties) {
                const schemaObject: Record<string, z.ZodTypeAny> = {};

                for (const [key, value] of Object.entries(inputSchema.properties)) {
                    const prop = value as any;
                    let zodType: z.ZodTypeAny = z.string();

                    // Convert based on JSON Schema type
                    switch (prop.type) {
                        case 'string':
                            zodType = z.string();
                            break;
                        case 'number':
                        case 'integer':
                            zodType = z.number();
                            break;
                        case 'boolean':
                            zodType = z.boolean();
                            break;
                        case 'array':
                            zodType = z.array(z.any());
                            break;
                        case 'object':
                            zodType = z.object({});
                            break;
                        default:
                            zodType = z.any();
                    }

                    // Add description if available
                    if (prop.description) {
                        zodType = zodType.describe(prop.description);
                    }

                    // Make optional if not required
                    const required = inputSchema.required || [];
                    if (!required.includes(key)) {
                        zodType = zodType.optional();
                    }

                    schemaObject[key] = zodType;
                }

                return z.object(schemaObject);
            }
        } catch (error) {
            console.warn("Failed to convert schema, using fallback:", error);
        }

        // Fallback schema
        return z.object({
            id: z.string().optional().describe("Asset ID"),
            limit: z.number().optional().describe("Number of items to return"),
            offset: z.number().optional().describe("Number of items to skip"),
        });
    }

    async disconnect(): Promise<void> {
        this.connected = false;

        if (this.transport) {
            try {
                await this.transport.close();
            } catch (error) {
                Logger.debug("Warning during transport close:", error);
            }
            this.transport = null;
        }

        this.client = null;
        Logger.info("Disconnected from Mux MCP Assets server");
    }

    isConnected(): boolean {
        return this.connected;
    }

    async reset(): Promise<void> {
        await this.disconnect();
        await this.ensureConnected();
    }
}

// Create and export a singleton instance
export const muxMcpClient = new MuxMCPAssetsClient();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    try {
        await muxMcpClient.disconnect();
    } catch (error) {
        // Ignore errors during shutdown
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    try {
        await muxMcpClient.disconnect();
    } catch (error) {
        // Ignore errors during shutdown
    }
    process.exit(0);
});