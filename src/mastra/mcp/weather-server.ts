import { MCPServer } from "@mastra/mcp";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { weatherAgent, weatherAgentTestWrapper } from "../agents/weather-agent.js";
import { weatherTool } from "../tools/weather.js";

/**
 * Weather MCP Server with Multiple Streaming Options
 * 
 * This server provides several tools for interacting with the weather agent:
 * 
 * 1. ask_weatherAgent - Smart tool that auto-selects the best streaming method
 *    - Supports streamVNext (experimental), regular stream, and text fallback
 *    - Parameters: message, format (default|aisdk), streamingMethod (streamVNext|stream|auto)
 * 
 * 2. ask_weatherAgent_stream - Uses the regular stream method (stable)
 *    - Parameters: message
 *    - Always uses weatherAgent.stream()
 * 
 * 3. ask_weatherAgent_text - Non-streaming fallback
 *    - Parameters: message
 *    - Always uses weatherAgentTestWrapper.text()
 * 
 * 4. weatherTool - Direct weather data access
 *    - Parameters: zipCode
 *    - Returns raw weather data without agent processing
 * 
 * 5. health - Health check endpoint
 *    - Returns server status and timestamp
 */

// Circuit breaker pattern to prevent system overload
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private readonly failureThreshold = 3;
  private readonly timeout = 30000; // 30 seconds

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN - system overloaded');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

const circuitBreaker = new CircuitBreaker();

// AI SDK v5 compatible streamVNext tool
const askWeatherAgentStreamVNext = createTool({
  id: "ask_weatherAgent_streamVNext",
  description: "Ask the weatherAgent using the streamVNext method (AI SDK v5 compatible).",
  inputSchema: z.object({
    message: z.string().describe("The user question or input for the agent (should contain a ZIP code)."),
    format: z
      .enum(["mastra", "aisdk"])
      .default("mastra")
      .optional(),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "");
    const format = ((context as any)?.format as "mastra" | "aisdk" | undefined) ?? "mastra";
    
    console.log('[askWeatherAgentStreamVNext] Received request:', { message, format });

    try {
      const stream = await weatherAgent.streamVNext([{ role: "user", content: message }], {
        format: format
      });
      const fullText = await stream.text;
      console.log('[askWeatherAgentStreamVNext] streamVNext succeeded, text length:', fullText.length);
      
      return {
        streamed: true,
        text: fullText,
        textStream: stream.textStream ?? null,
        finishReason: 'finishReason' in stream ? stream.finishReason ?? null : null,
        usage: 'usage' in stream ? stream.usage ?? null : null,
        method: 'streamVNext',
        format: format,
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('[askWeatherAgentStreamVNext] streamVNext failed:', e);
      return { 
        streamed: false, 
        text: `Agent streamVNext error: ${e instanceof Error ? e.message : String(e)}`,
        method: 'error',
        format: format,
        timestamp: new Date().toISOString()
      };
    }
  },
});

// Simplified agent tool that focuses on getting responses working
const askWeatherAgent = createTool({
  id: "ask_weatherAgent",
  description: "Ask the weatherAgent a question. Returns weather information for ZIP codes.",
  inputSchema: z.object({
    message: z.string().describe("The user question or input for the agent (should contain a ZIP code)."),
    format: z
      .enum(["default", "aisdk"])
      .default("default")
      .optional(),
    streamingMethod: z
      .enum(["streamVNext", "stream", "auto"])
      .default("auto")
      .optional(),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "");
    const format = ((context as any)?.format as "default" | "aisdk" | undefined) ?? "default";
    const streamingMethod = ((context as any)?.streamingMethod as "streamVNext" | "stream" | "auto" | undefined) ?? "auto";
    
    console.log('[askWeatherAgent] Received request:', { message, format, streamingMethod });

    try {
      // Try streamVNext first if requested or auto (with circuit breaker protection)
      if (streamingMethod === "streamVNext" || (streamingMethod === "auto" && format === "aisdk")) {
        console.log('[askWeatherAgent] Attempting streamVNext method...');
        try {
          const result = await circuitBreaker.execute(async () => {
            // Add timeout protection to prevent overload
            const streamPromise = weatherAgent.streamVNext([{ role: "user", content: message }], {
              format: format === "aisdk" ? "aisdk" : "mastra"
            });
            
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('StreamVNext timeout - system overloaded')), 25000);
            });
            
            const stream = await Promise.race([streamPromise, timeoutPromise]);
            const fullText = await stream.text;
            console.log('[askWeatherAgent] streamVNext succeeded, text length:', fullText.length);
            
            return {
              streamed: true,
              text: fullText,
              textStream: stream.textStream ?? null,
              finishReason: 'finishReason' in stream ? stream.finishReason ?? null : null,
              usage: 'usage' in stream ? stream.usage ?? null : null,
              method: 'streamVNext',
              format: format,
              timestamp: new Date().toISOString()
            };
          });
          return result;
        } catch (streamVNextError) {
          console.warn('[askWeatherAgent] streamVNext failed, falling back to text method:', streamVNextError);
          // Fall through to text method
        }
      }

      // Fallback to text method for reliability (with circuit breaker protection)
      console.log('[askWeatherAgent] Using text method for reliability...');
      const result = await circuitBreaker.execute(async () => {
        return await weatherAgentTestWrapper.text({ 
          messages: [{ role: "user", content: message }] 
        });
      });
      
      const fullText = String(result?.text ?? "");
      console.log('[askWeatherAgent] Text method succeeded, response length:', fullText.length);
      console.log('[askWeatherAgent] Response preview:', fullText.substring(0, 200) + '...');
      
      // Return a consistent format
      const response = {
        streamed: false,
        text: fullText,
        textStream: null,
        finishReason: "stop",
        usage: null,
        method: 'text',
        timestamp: new Date().toISOString()
      };

      // If AISDK format requested, return a simple compatible shape
      if (format === "aisdk") {
        return {
          streamed: response.streamed,
          text: response.text,
          textStream: response.textStream,
          method: response.method
        };
      }

      return response;

    } catch (error) {
      console.error('[askWeatherAgent] All methods failed:', error);
      const errorResponse = {
        streamed: false,
        text: `Agent error: ${error instanceof Error ? error.message : String(error)}`,
        textStream: null,
        finishReason: "error",
        usage: null,
        method: 'error',
        timestamp: new Date().toISOString()
      };
      
      console.log('[askWeatherAgent] Returning error response:', errorResponse);
      return errorResponse;
    }
  },
});

// Dedicated tool for regular stream method
const askWeatherAgentStream = createTool({
  id: "ask_weatherAgent_stream",
  description: "Ask the weatherAgent using the regular stream method (non-experimental).",
  inputSchema: z.object({
    message: z.string().describe("The user question or input for the agent."),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "");
    console.log('[askWeatherAgentStream] Received request:', { message });
    
    try {
      // Add timeout protection to prevent overload
      const streamPromise = weatherAgent.stream([{ role: "user", content: message }]);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Stream timeout - system overloaded')), 25000);
      });
      
      const stream = await Promise.race([streamPromise, timeoutPromise]);
      const fullText = await stream.text;
      console.log('[askWeatherAgentStream] stream succeeded, text length:', fullText.length);
      
      return {
        streamed: true,
        text: fullText,
        textStream: stream.textStream ?? null,
        finishReason: stream.finishReason ?? null,
        usage: stream.usage ?? null,
        method: 'stream'
      };
    } catch (e) {
      console.error('[askWeatherAgentStream] stream failed:', e);
      return { 
        streamed: false, 
        text: `Agent stream error: ${e instanceof Error ? e.message : String(e)}`,
        method: 'error'
      };
    }
  },
});

// Non-streaming fallback to ensure an immediate response for clients that cannot consume streams
const askWeatherAgentText = createTool({
  id: "ask_weatherAgent_text",
  description: "Ask the weatherAgent using a non-streaming text shim. Always returns a final text.",
  inputSchema: z.object({
    message: z.string().describe("The user question or input for the agent."),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "");
    console.log('[askWeatherAgentText] Received request:', { message });
    
    try {
      const res = await (weatherAgentTestWrapper as any).text({ messages: [{ role: "user", content: message }] });
      return { streamed: false, text: String(res?.text ?? ""), method: 'text' };
    } catch (e) {
      console.error('[askWeatherAgentText] text failed:', e);
      return { streamed: false, text: `Agent text error: ${e instanceof Error ? e.message : String(e)}`, method: 'error' };
    }
  },
});

// Comprehensive healthcheck tool to validate reachability and diagnose issues
const health = createTool({
  id: "health",
  description: "Comprehensive healthcheck for the Weather MCP server. Returns status, environment info, and agent health.",
  inputSchema: z.object({
    detailed: z.boolean().default(false).optional().describe("Include detailed diagnostic information")
  }).optional(),
  execute: async ({ context }) => {
    const detailed = (context as any)?.detailed ?? false;
    const timestamp = new Date().toISOString();
    
    const healthInfo: any = {
      ok: true,
      timestamp,
      server: "weather-mcp-server",
      version: "1.0.0",
      circuitBreakerState: circuitBreaker['state']
    };
    
    if (detailed) {
      // Check environment variables
      const envVars = {
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        DEEPGRAM_API_KEY: !!process.env.DEEPGRAM_API_KEY,
        MUX_TOKEN_ID: !!process.env.MUX_TOKEN_ID,
        MUX_TOKEN_SECRET: !!process.env.MUX_TOKEN_SECRET,
        TTS_TMP_DIR: process.env.TTS_TMP_DIR || '/tmp/tts'
      };
      
      healthInfo.environment = envVars;
      
      // Test agent methods
      const agentTests: any = {};
      
      try {
        // Test text method
        const textResult = await weatherAgentTestWrapper.text({ 
          messages: [{ role: "user", content: "96062" }] 
        });
        agentTests.textMethod = { 
          ok: true, 
          responseLength: textResult?.text?.length || 0 
        };
      } catch (error) {
        agentTests.textMethod = { 
          ok: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
      
      try {
        // Test stream method
        const stream = await weatherAgent.stream([{ role: "user", content: "96062" }]);
        const streamText = await stream.text;
        agentTests.streamMethod = { 
          ok: true, 
          responseLength: streamText?.length || 0 
        };
      } catch (error) {
        agentTests.streamMethod = { 
          ok: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
      
      try {
        // Test streamVNext method
        const streamVNext = await weatherAgent.streamVNext([{ role: "user", content: "96062" }]);
        const streamVNextText = await streamVNext.text;
        agentTests.streamVNextMethod = { 
          ok: true, 
          responseLength: streamVNextText?.length || 0 
        };
      } catch (error) {
        agentTests.streamVNextMethod = { 
          ok: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
      
      healthInfo.agentTests = agentTests;
      
      // Overall health based on tests
      const allTestsPass = Object.values(agentTests).every((test: any) => test.ok);
      healthInfo.ok = allTestsPass;
    }
    
    return healthInfo;
  },
});

// Simple test tool that bypasses MCP complexity
const testAgent = createTool({
  id: "test_agent",
  description: "Simple test tool to verify agent is working. Bypasses MCP complexity.",
  inputSchema: z.object({
    message: z.string().default("96062").optional().describe("Test message to send to agent (use ZIP code for best results)"),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "96062");
    console.log('[testAgent] Testing agent with message:', message);
    
    try {
      const result = await weatherAgentTestWrapper.text({ 
        messages: [{ role: "user", content: message }] 
      });
      
      return {
        success: true,
        message: "Agent is working correctly",
        response: result?.text || "No response text",
        responseLength: result?.text?.length || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[testAgent] Agent test failed:', error);
      return {
        success: false,
        message: "Agent test failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  },
});

// Debug tool to help troubleshoot issues
const debugAgent = createTool({
  id: "debug_agent",
  description: "Debug tool to help troubleshoot agent issues. Returns detailed diagnostic information.",
  inputSchema: z.object({
    message: z.string().default("96062").optional().describe("Test message to send to agent"),
    includeEnvCheck: z.boolean().default(true).optional().describe("Include environment variable check"),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "96062");
    const includeEnvCheck = (context as any)?.includeEnvCheck ?? true;
    
    console.log('[debugAgent] Running diagnostics with message:', message);
    
    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      testMessage: message,
      tests: {}
    };
    
    // Environment check
    if (includeEnvCheck) {
      debugInfo.environment = {
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        DEEPGRAM_API_KEY: !!process.env.DEEPGRAM_API_KEY,
        MUX_TOKEN_ID: !!process.env.MUX_TOKEN_ID,
        MUX_TOKEN_SECRET: !!process.env.MUX_TOKEN_SECRET,
        NODE_ENV: process.env.NODE_ENV || 'development'
      };
    }
    
    // Test agent text method
    try {
      const result = await weatherAgentTestWrapper.text({ 
        messages: [{ role: "user", content: message }] 
      });
      debugInfo.tests.textMethod = {
        success: true,
        responseLength: result?.text?.length || 0,
        responsePreview: result?.text?.substring(0, 100) + '...',
        fullResponse: result?.text || "No response"
      };
    } catch (error) {
      debugInfo.tests.textMethod = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
    }
    
    // Test weather tool directly
    try {
      const zipMatch = message.match(/\b(\d{5})\b/);
      if (zipMatch) {
        const zipCode = zipMatch[1];
        const weatherResult = await weatherTool.execute({ context: { zipCode } } as any);
        debugInfo.tests.weatherTool = {
          success: true,
          zipCode,
          hasLocation: !!weatherResult?.location,
          hasForecast: !!weatherResult?.forecast,
          forecastLength: Array.isArray(weatherResult?.forecast) ? weatherResult.forecast.length : 0
        };
      } else {
        debugInfo.tests.weatherTool = {
          success: false,
          error: "No ZIP code found in message"
        };
      }
    } catch (error) {
      debugInfo.tests.weatherTool = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    
    console.log('[debugAgent] Diagnostics complete:', debugInfo);
    return debugInfo;
  },
});

// Compatibility tool that converts streamVNext to legacy format
const askWeatherAgentCompatible = createTool({
  id: "ask_weatherAgent_compatible",
  description: "Ask the weatherAgent using streamVNext but return in legacy data stream format for frontend compatibility.",
  inputSchema: z.object({
    message: z.string().describe("The user question or input for the agent (should contain a ZIP code)."),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "");
    console.log('[askWeatherAgentCompatible] Received request:', { message });

    try {
      // Use streamVNext internally but convert to legacy format
      const stream = await weatherAgent.streamVNext([{ role: "user", content: message }], {
        format: "mastra"
      });
      
      // Collect all text chunks
      let fullText = '';
      const textChunks: string[] = [];
      
      try {
        for await (const chunk of stream.textStream) {
          textChunks.push(chunk);
          fullText += chunk;
        }
      } catch (streamError) {
        console.warn('[askWeatherAgentCompatible] Stream reading error:', streamError);
        // Continue with whatever text we have
      }
      
      console.log('[askWeatherAgentCompatible] Stream completed, text length:', fullText.length);
      
      // Return in legacy format that frontend expects
      return {
        streamed: true,
        text: fullText,
        textStream: textChunks,
        finishReason: 'finishReason' in stream ? stream.finishReason : 'stop',
        usage: 'usage' in stream ? stream.usage : null,
        method: 'streamVNext-compatible',
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      console.error('[askWeatherAgentCompatible] Error:', e);
      return { 
        streamed: false, 
        text: `Agent error: ${e instanceof Error ? e.message : String(e)}`,
        method: 'error',
        timestamp: new Date().toISOString()
      };
    }
  },
});

export const weatherMcpServer = new MCPServer({
  id: "weather-mcp-server",
  name: "Weather MCP Server",
  version: "1.0.0",
  description: "Provides weather information and TTS capabilities via MCP with multiple streaming options",
  // Do not use auto agent-to-tool conversion (non-streaming). We expose streaming tools instead.
  tools: {
    weatherTool,
    ask_weatherAgent: askWeatherAgent,                    // Smart agent tool with auto-fallback
    ask_weatherAgent_compatible: askWeatherAgentCompatible, // Legacy format compatibility
    ask_weatherAgent_streamVNext: askWeatherAgentStreamVNext, // AI SDK v5 streamVNext method
    ask_weatherAgent_stream: askWeatherAgentStream,       // Regular stream method
    ask_weatherAgent_text: askWeatherAgentText,           // Non-streaming fallback
    test_agent: testAgent,                               // Simple test tool
    debug_agent: debugAgent,                             // Debug tool
    health,
  },
});
