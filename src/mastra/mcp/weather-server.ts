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

// Simple healthcheck tool to validate reachability via MCP
const health = createTool({
  id: "health",
  description: "Basic healthcheck for the Weather MCP server. Returns ok with timestamp.",
  inputSchema: z.object({}).optional(),
  execute: async () => ({ ok: true, timestamp: new Date().toISOString() }),
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
    health,
  },
});
