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

class MuxMCPClient {
    // Timeout configuration constants
    private static readonly MIN_CONNECTION_TIMEOUT = 5000;    // 5 seconds minimum
    private static readonly MAX_CONNECTION_TIMEOUT = 600000;  // 10 minutes maximum
    private static readonly DEFAULT_CONNECTION_TIMEOUT = 120000; // 2 minutes default

    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private connected = false;
    private connectionPromise: Promise<void> | null = null;
    private keepAliveInterval: NodeJS.Timeout | null = null;

    /**
     * Get connection timeout with bounds validation
     * Supports environment variable configuration with safe defaults
     */
    private getConnectionTimeout(): number {
        const envTimeout = process.env.MUX_CONNECTION_TIMEOUT;

        // Use default if not specified
        if (!envTimeout) {
            return MuxMCPClient.DEFAULT_CONNECTION_TIMEOUT;
        }

        // Parse and validate the timeout value
        const parsedTimeout = parseInt(envTimeout, 10);

        // Check for invalid number
        if (isNaN(parsedTimeout)) {
            Logger.warn(`Invalid MUX_CONNECTION_TIMEOUT value: ${envTimeout}, using default ${MuxMCPClient.DEFAULT_CONNECTION_TIMEOUT}ms`);
            return MuxMCPClient.DEFAULT_CONNECTION_TIMEOUT;
        }

        // Apply bounds validation
        if (parsedTimeout < MuxMCPClient.MIN_CONNECTION_TIMEOUT) {
            Logger.warn(`MUX_CONNECTION_TIMEOUT too low (${parsedTimeout}ms), using minimum ${MuxMCPClient.MIN_CONNECTION_TIMEOUT}ms`);
            return MuxMCPClient.MIN_CONNECTION_TIMEOUT;
        }

        if (parsedTimeout > MuxMCPClient.MAX_CONNECTION_TIMEOUT) {
            Logger.warn(`MUX_CONNECTION_TIMEOUT too high (${parsedTimeout}ms), using maximum ${MuxMCPClient.MAX_CONNECTION_TIMEOUT}ms`);
            return MuxMCPClient.MAX_CONNECTION_TIMEOUT;
        }

        console.debug(`Using connection timeout: ${parsedTimeout}ms`);
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
            const errorMsg = "Missing required environment variables: MUX_TOKEN_ID and MUX_TOKEN_SECRET are required. MUX_MCP_UPLOAD_ARGS is optional but may affect connection behavior if misconfigured.";
            Logger.error("Environment validation failed:", errorMsg);
            throw new Error(errorMsg);
        }

        try {
            // Parse and validate MCP args from environment variable
            const mcpArgs = this.parseMcpArgs(process.env.MUX_MCP_UPLOAD_ARGS);

            Logger.info("Connecting to Mux MCP server...");
            console.debug("MUX_TOKEN_ID: [CONFIGURED]");
            console.debug("MUX_TOKEN_SECRET: [CONFIGURED]");
            console.debug(`MCP Args: ${mcpArgs.join(' ')}`);

            console.debug("[MuxMCP] Creating StdioClientTransport...");
            this.transport = new StdioClientTransport({
                command: "npx",
                args: mcpArgs,
                env: {
                    ...process.env,
                    MUX_TOKEN_ID: process.env.MUX_TOKEN_ID,
                    MUX_TOKEN_SECRET: process.env.MUX_TOKEN_SECRET,
                },
            });

            console.debug("[MuxMCP] Creating MCP Client...");
            this.client = new Client(
                {
                    name: "mux-mastra-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {},
                }
            );

            // Use validated connection timeout
            const connectionTimeout = this.getConnectionTimeout();
            console.debug(`[MuxMCP] Starting connection with timeout: ${connectionTimeout}ms`);
            
            const connectionPromise = this.client.connect(this.transport);
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    console.error(`[MuxMCP] Connection timeout after ${connectionTimeout}ms`);
                    reject(new Error(`Connection timeout: Failed to connect within ${connectionTimeout}ms`));
                }, connectionTimeout);
            });

            console.debug("[MuxMCP] Waiting for connection...");
            await Promise.race([connectionPromise, timeoutPromise]);

            // Atomically update the connected state
            this.connected = true;
            Logger.info("Connected to Mux MCP server successfully");
            
            // Start keep-alive mechanism
            this.startKeepAlive();

        } catch (error) {
            Logger.error("Failed to connect to Mux MCP server:", error);

            // Clean up on failure
            this.connected = false;
            if (this.transport) {
                try {
                    await this.transport.close();
                } catch (closeError) {
                    console.debug("Error during transport cleanup:", closeError);
                }
                this.transport = null;
            }
            this.client = null;

            throw error;
        }
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
                    console.debug('[MuxMCP] Keep-alive ping failed:', error);
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

    /**
     * Parse and validate MCP arguments from environment variable
     * Provides comprehensive security validation and fallback logic
     */
    private parseMcpArgs(envValue: string | undefined): string[] {
        // TEMPORARY WORKAROUND: Use generic tools instead of specific video.uploads resource
        // This avoids the union type bug in the create_video_uploads endpoint validation
        const defaultArgs = ["@mux/mcp", "client=claude", "--tools=dynamic"];

        // Use default if environment variable is not set
        if (!envValue) {
            console.debug("Using default MCP args (MUX_MCP_UPLOAD_ARGS not set)");
            return defaultArgs;
        }

        const trimmedValue = envValue.trim();

        if (!trimmedValue) {
            Logger.warn("MUX_MCP_UPLOAD_ARGS is empty, using defaults");
            return defaultArgs;
        }

        if (trimmedValue.length > 1000) {
            Logger.warn("MUX_MCP_UPLOAD_ARGS too long (>1000 chars), using defaults");
            return defaultArgs;
        }

        try {
            // Use more secure splitting that handles edge cases
            const rawArgs = trimmedValue.split(',').map(arg => arg.trim()).filter(arg => arg.length > 0);
            const processedArgs: string[] = [];

            for (const rawArg of rawArgs) {
                // Additional length check per argument
                if (rawArg.length > 200) {
                    Logger.warn(`MCP argument too long (${rawArg.length} chars), skipping: ${rawArg.slice(0, 50)}...`);
                    continue;
                }

                // Check for suspicious patterns
                if (this.containsSuspiciousPatterns(rawArg)) {
                    Logger.warn(`MCP argument contains suspicious patterns, skipping: ${rawArg}`);
                    continue;
                }

                if (!this.isValidMcpArgument(rawArg)) {
                    Logger.warn(`Skipping invalid MCP argument: ${rawArg}`);
                    continue;
                }

                processedArgs.push(rawArg);
            }

            if (processedArgs.length === 0) {
                Logger.warn("No valid MCP arguments found after parsing, using defaults");
                return defaultArgs;
            }

            if (!this.validateMcpCommandStructure(processedArgs)) {
                Logger.warn("Invalid MCP command structure, using defaults");
                return defaultArgs;
            }

            console.debug(`Successfully parsed ${processedArgs.length} MCP arguments`);
            return processedArgs;

        } catch (error) {
            Logger.error("Failed to parse MUX_MCP_UPLOAD_ARGS:", error);
            Logger.info("Falling back to default MCP arguments");
            return defaultArgs;
        }
    }

    /**
     * Check for suspicious patterns that might indicate injection attempts
     */
    private containsSuspiciousPatterns(arg: string): boolean {
        const suspiciousPatterns = [
            /\.\./,                    // Path traversal
            /\/\//,                    // Double slashes
            /[<>]/,                    // HTML/XML injection
            /javascript:/i,            // JavaScript injection
            /data:/i,                  // Data URI injection
            /vbscript:/i,              // VBScript injection
            /on\w+\s*=/i,              // Event handler injection
            /eval\s*\(/i,              // Code execution
            /exec\s*\(/i,              // Code execution
            /system\s*\(/i,            // System call
            /cmd\s*\(/i,               // Command execution
            /shell\s*\(/i,             // Shell execution
            /\$\{.*\}/,                // Variable substitution
            /\$\$/,                    // Double dollar signs
            /`.*`/,                    // Backtick execution
            /\|\|/,                    // Logical OR injection
            /&&/,                      // Logical AND injection
            /;.*;/,                    // Multiple semicolons
            /\|\s*[a-z]/i,             // Pipe to command
            /&&\s*[a-z]/i,             // AND with command
        ];
        
        return suspiciousPatterns.some(pattern => pattern.test(arg));
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

            console.debug("Available MCP tools:", result?.tools?.map(t => t.name) || []);

            if (result?.tools) {
                for (const tool of result.tools) {
                    try {
                        // Create a proper Mastra tool using createTool (directly exposed by MCP)
                        tools[tool.name] = createTool({
                            id: tool.name,
                            description: tool.description || `Mux MCP tool: ${tool.name}`,
                            inputSchema: this.convertToZodSchema(tool.inputSchema),
                            execute: async ({ context }) => {
                                if (!this.client) {
                                    throw new Error("Client not connected");
                                }

                                console.debug(`Calling MCP tool: ${tool.name}`, context);

                                try {
                                    return (await this.client.callTool({
                                        name: tool.name,
                                        arguments: context || {},
                                    })).content;
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
                    } catch (toolError) {
                        Logger.warn(`Skipping tool ${tool.name} due to error:`, toolError);
                        // Log the specific schema that caused the issue
                        if (toolError instanceof Error && toolError.message.includes('union')) {
                            console.error(`Union error for tool ${tool.name}:`, {
                                toolName: tool.name,
                                inputSchema: tool.inputSchema,
                                error: toolError.message,
                                stack: toolError.stack
                            });
                        }
                    }
                }
            }

            // If MCP exposes generic invoke_api_endpoint, synthesize concrete tools for video.uploads
            const hasInvoke = !!tools['invoke_api_endpoint'];
            console.debug(`Has invoke_api_endpoint: ${hasInvoke}`);

            if (hasInvoke) {
                const addWrapper = (id: string, endpoint: string, description: string) => {
                    // Do not overwrite real Mux MCP tools; only add wrapper if missing
                    if (tools[id]) {
                        console.debug(`Skipping wrapper for ${id}; direct MCP tool already exists.`);
                        return;
                    }
                    tools[id] = createTool({
                        id,
                        description,
                        inputSchema: z.object({
                            UPLOAD_ID: z.string().optional().describe("Upload ID"),
                        }).passthrough(),
                        execute: async ({ context }) => {
                            if (!this.client) throw new Error("Client not connected");

                            // Try direct tool call first (best case - the MCP exposes the endpoint directly)
                            const directTool = tools[endpoint];
                            if (directTool && directTool !== tools[id]) {
                                console.debug(`Using direct tool: ${endpoint}`);
                                return directTool.execute({ context });
                            }

                            console.debug(`Using invoke_api_endpoint wrapper for: ${endpoint}`);

                            const ctx = context || {};

                            // Build canonical path/body wrappers for common endpoints
                            // const idVal = (ctx as any).UPLOAD_ID || (ctx as any).upload_id || (ctx as any).id;
                            // const assetVal = (ctx as any).ASSET_ID || (ctx as any).asset_id || (ctx as any).id;
                            
                            // Use correct parameter names based on endpoint type
                            // let path: any = undefined;
                            // if (endpoint.includes('uploads')) {
                            //     if (idVal) {
                            //         // For uploads endpoints, use only UPLOAD_ID as per Mux API schema
                            //         path = { UPLOAD_ID: idVal };
                            //     }
                            // } else if (endpoint.includes('assets')) {
                            //     if (assetVal) {
                            //         // For assets endpoints, use only ASSET_ID as per Mux API schema
                            //         path = { ASSET_ID: assetVal };
                            //     }
                            // }

                            // Filter out problematic arguments that cause union type issues
                            const filteredCtx = { ...ctx } as any;
                            
                            // COMPLETE WORKAROUND: Remove all complex nested objects that cause union validation errors
                            // This is a more aggressive approach to ensure compatibility across all MCP SDK versions
                            
                            // Remove new_asset_settings entirely if it contains complex structures
                            if (filteredCtx.new_asset_settings) {
                                const settings = filteredCtx.new_asset_settings;
                                
                                // Check if settings contain problematic nested structures
                                const hasComplexInputs = settings.inputs && settings.inputs.some((input: any) => 
                                    input.overlay_settings || input.text_track_settings || input.audio_track_settings
                                );
                                
                                if (hasComplexInputs) {
                                    console.debug(`[invoke_api_endpoint] Removing complex new_asset_settings to avoid union type bug`);
                                    delete filteredCtx.new_asset_settings;
                                } else {
                                    // Create a minimal version with only essential fields
                                    const minimalSettings: any = {};
                                    if (settings.playback_policies) {
                                        minimalSettings.playback_policies = settings.playback_policies;
                                        console.debug(`[invoke_api_endpoint] Keeping minimal playback_policies: ${minimalSettings.playback_policies}`);
                                    }
                                    if (settings.playback_policy) {
                                        minimalSettings.playback_policy = settings.playback_policy;
                                        console.debug(`[invoke_api_endpoint] Keeping minimal playback_policy: ${minimalSettings.playback_policy}`);
                                    }
                                    
                                    // CRITICAL: Only set new_asset_settings if it has actual content
                                    // An empty object {} also triggers the "union is not a function" error!
                                    if (Object.keys(minimalSettings).length > 0) {
                                        filteredCtx.new_asset_settings = minimalSettings;
                                        console.debug(`[invoke_api_endpoint] Simplified new_asset_settings to minimal version`);
                                    } else {
                                        console.debug(`[invoke_api_endpoint] Removing empty new_asset_settings to avoid validation bug`);
                                        delete filteredCtx.new_asset_settings;
                                    }
                                }
                            }
                            
                            // Additional safety: Remove any other potentially problematic nested objects
                            const problematicKeys = ['overlay_settings', 'text_track_settings', 'audio_track_settings', 'video_settings'];
                            problematicKeys.forEach(key => {
                                if (filteredCtx[key]) {
                                    console.debug(`[invoke_api_endpoint] Removing potentially problematic key: ${key}`);
                                    delete filteredCtx[key];
                                }
                            });
                            
                            const attemptArgs = [
                                // Correct Mux MCP format - endpoint_name with nested args
                                { endpoint_name: endpoint, args: filteredCtx },
                            ] as any[];

                            let lastErr: any;
                            for (const args of attemptArgs) {
                                try {
                                    console.debug(`Invoking endpoint via wrapper: ${endpoint}`, args);
                                    const res = await this.client.callTool({ name: 'invoke_api_endpoint', arguments: args });
                                    return res.content;
                                } catch (e) {
                                    lastErr = e;
                                    const errorMsg = e instanceof Error ? e.message : String(e);
                                    Logger.warn(`invoke_api_endpoint failed with args variant, trying next: ${errorMsg}`);

                                    // Log the specific argument structure that failed for debugging
                                    if (process.env.DEBUG) {
                                        console.debug('Failed args structure:', JSON.stringify(args, null, 2));
                                    }
                                }
                            }
                            throw lastErr || new Error('invoke_api_endpoint failed for all argument variants');
                        },
                    });
                };

                // Primary snake_case IDs (match MCP endpoint names exactly)
                addWrapper('create_video_uploads', 'create_video_uploads', 'Creates a new direct upload for video content, audio-only assets with static images, or other media to be ingested to Mux.');
                addWrapper('retrieve_video_uploads', 'retrieve_video_uploads', 'Fetches information about a single direct upload');
                addWrapper('list_video_uploads', 'list_video_uploads', 'Lists direct uploads');
                addWrapper('cancel_video_uploads', 'cancel_video_uploads', 'Cancels a direct upload in waiting state');

                // Dotted aliases for convenience/compatibility (map to snake endpoints under the hood)
                addWrapper('video.uploads.create', 'create_video_uploads', 'Creates a new direct upload for video content');
                addWrapper('video.uploads.get', 'retrieve_video_uploads', 'Fetches information about a single direct upload');
                addWrapper('video.uploads.list', 'list_video_uploads', 'Lists direct uploads');
                addWrapper('video.uploads.cancel', 'cancel_video_uploads', 'Cancels a direct upload in waiting state');
            }

            Logger.info(`Successfully created ${Object.keys(tools).length} Mastra tools from MCP`);
            console.debug("Final tool names:", Object.keys(tools));
            return tools;
        } catch (error) {
            Logger.error("Failed to get tools:", error);
            throw error;
        }
    }

    // Convert MCP input schema to Zod schema
    private convertToZodSchema(inputSchema: any): z.ZodSchema {
        if (!inputSchema || typeof inputSchema !== 'object') {
            return z.object({});
        }

        try {
            // Handle union types (anyOf, oneOf, allOf) - use z.any() to avoid validation issues
            if (inputSchema.anyOf) {
                // Use z.any() instead of z.union() to avoid Zod validation issues
                return z.any();
            }
            
            if (inputSchema.oneOf) {
                // Use z.any() instead of z.union() to avoid Zod validation issues
                return z.any();
            }
            
            if (inputSchema.allOf) {
                // For allOf, we typically want to merge the schemas
                const mergedSchema = inputSchema.allOf.reduce((acc: any, schema: any) => {
                    return { ...acc, ...schema };
                }, {});
                return this.convertToZodSchema(mergedSchema);
            }

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

                return z.object(schemaObject).passthrough();
            }
        } catch (error) {
            console.warn("Failed to convert schema, using fallback:", error);
        }

        // Fallback schema with correct parameter names
        return z.object({
            UPLOAD_ID: z.string().optional().describe("Upload ID"),
            cors_origin: z.string().optional().describe("If the upload URL will be used in a browser, you must specify the origin in order for the signed URL to have the correct CORS headers."),
            new_asset_settings: z.object({
                playback_policies: z.array(z.string()).optional().describe("Playback policies for the asset"),
                inputs: z.array(z.object({
                    type: z.string().describe("Type of input (audio, video, etc.)"),
                    url: z.string().optional().describe("URL for the input"),
                    overlay_settings: z.object({
                        width: z.string().optional(),
                        height: z.string().optional(),
                        horizontal_align: z.string().optional(),
                        vertical_align: z.string().optional(),
                        opacity: z.string().optional()
                    }).optional().describe("Overlay settings for video inputs")
                })).optional().describe("Input configuration for the asset")
            }).optional().describe("Settings for the new asset"),
            test: z.boolean().optional().describe("Indicates if this is a test Direct Upload"),
            timeout: z.number().optional().describe("Max time in seconds for the signed upload URL to be valid"),
            audio_only_with_image: z.object({
                image_url: z.string().describe("URL of the static image to display for the duration of the audio. Maximum size is 4096x4096."),
                image_duration: z.enum(['audio_duration', '30s', '1m', '2m', '5m', '10m']).default('audio_duration').describe("How long the image should be displayed"),
                image_fit: z.enum(['fill', 'contain', 'cover']).default('fill').describe("How the image should fit in the video frame")
            }).optional().describe("Convenience option for creating audio-only assets with a static image"),
            limit: z.number().optional().describe("Number of items to return"),
            offset: z.number().optional().describe("Number of items to skip"),
        });
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        
        // Stop keep-alive mechanism
        this.stopKeepAlive();

        if (this.transport) {
            try {
                await this.transport.close();
            } catch (error) {
                console.debug("Warning during transport close:", error);
            }
            this.transport = null;
        }

        this.client = null;
        Logger.info("Disconnected from Mux MCP server");
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
export const muxMcpClient = new MuxMCPClient();

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