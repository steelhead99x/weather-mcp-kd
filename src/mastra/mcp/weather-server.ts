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

// Expose a custom MCP tool that streams text via Agent.streamVNext (vNext) or Agent.stream
const askWeatherAgent = createTool({
  id: "ask_weatherAgent",
  description:
    "Ask the weatherAgent a question. Supports both streamVNext (experimental) and regular stream methods.",
  inputSchema: z.object({
    message: z.string().describe("The user question or input for the agent."),
    format: z
      .enum(["default", "aisdk"]) // optional: allow ai sdk v5 formatting for client compatibility
      .default("default")
      .optional(),
    streamingMethod: z
      .enum(["streamVNext", "stream", "auto"]) // allow choosing streaming method
      .default("auto")
      .optional(),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "");
    const format = ((context as any)?.format as "default" | "aisdk" | undefined) ?? "default";
    const streamingMethod = ((context as any)?.streamingMethod as "streamVNext" | "stream" | "auto" | undefined) ?? "auto";
    
    console.log('[askWeatherAgent] Received request:', { message, format, streamingMethod });

    // Helper function to try regular stream method
    const tryStreamMethod = async () => {
      console.log('[askWeatherAgent] Trying regular stream method...');
      const stream = await weatherAgent.stream([{ role: "user", content: message }]);
      const fullText = await stream.text;
      console.log('[askWeatherAgent] stream succeeded, text length:', fullText.length);
      
      return {
        streamed: true,
        text: fullText,
        textStream: stream.textStream ?? null,
        finishReason: stream.finishReason ?? null,
        usage: stream.usage ?? null,
        method: 'stream'
      };
    };

    // Helper function to try streamVNext method
    const tryStreamVNextMethod = async () => {
      console.log('[askWeatherAgent] Trying streamVNext method...');
      const stream = await weatherAgent.streamVNext(
        [{ role: "user", content: message }],
        format === "aisdk" ? { format: "aisdk" } : undefined as any
      );
      const fullText = await stream.text;
      console.log('[askWeatherAgent] streamVNext succeeded, text length:', fullText.length);
      
      return {
        streamed: true,
        text: fullText,
        textStream: (stream as any).textStream ?? null,
        finishReason: (stream as any).finishReason ?? null,
        usage: (stream as any).usage ?? null,
        method: 'streamVNext'
      };
    };

    // Helper function to try text fallback
    const tryTextFallback = async () => {
      console.log('[askWeatherAgent] Trying text fallback...');
      const result = await weatherAgentTestWrapper.text({ messages: [{ role: "user", content: message }] });
      const fullText = String(result?.text ?? "");
      console.log('[askWeatherAgent] text fallback succeeded, text length:', fullText.length);
      
      return {
        streamed: false,
        text: fullText,
        textStream: null,
        finishReason: null,
        usage: null,
        method: 'text'
      };
    };

    try {
      let result;

      if (streamingMethod === "stream") {
        // Use regular stream method
        result = await tryStreamMethod();
      } else if (streamingMethod === "streamVNext") {
        // Use streamVNext method
        result = await tryStreamVNextMethod();
      } else {
        // Auto mode: try streamVNext first, then stream, then text
        try {
          result = await tryStreamVNextMethod();
        } catch (streamVNextError) {
          console.warn('[askWeatherAgent] streamVNext failed, trying regular stream:', streamVNextError);
          try {
            result = await tryStreamMethod();
          } catch (streamError) {
            console.warn('[askWeatherAgent] stream also failed, falling back to text:', streamError);
            result = await tryTextFallback();
          }
        }
      }

      // If AISDK format requested, return a simple compatible shape
      if (format === "aisdk") {
        return {
          streamed: result.streamed,
          text: result.text,
          textStream: result.textStream,
          method: result.method
        };
      }

      return result;

    } catch (error) {
      console.error('[askWeatherAgent] All methods failed:', error);
      return {
        streamed: false,
        text: `Agent error: ${error instanceof Error ? error.message : String(error)}`,
        textStream: null,
        finishReason: null,
        usage: null,
        method: 'error'
      };
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
      const stream = await weatherAgent.stream([{ role: "user", content: message }]);
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
      version: "1.0.0"
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

export const weatherMcpServer = new MCPServer({
  id: "weather-mcp-server",
  name: "Weather MCP Server",
  version: "1.0.0",
  description: "Provides weather information and TTS capabilities via MCP with multiple streaming options",
  // Do not use auto agent-to-tool conversion (non-streaming). We expose streaming tools instead.
  tools: {
    weatherTool,
    ask_weatherAgent: askWeatherAgent,           // Auto-selects best streaming method
    ask_weatherAgent_stream: askWeatherAgentStream, // Regular stream method
    ask_weatherAgent_text: askWeatherAgentText,    // Non-streaming fallback
    test_agent: testAgent,                        // Simple test tool
    health,
  },
});
