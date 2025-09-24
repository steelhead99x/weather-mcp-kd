import { MCPServer } from "@mastra/mcp";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { weatherAgent, weatherAgentTestWrapper } from "../agents/weather-agent.js";
import { weatherTool } from "../tools/weather.js";

// Expose a custom MCP tool that streams text via Agent.streamVNext (vNext)
const askWeatherAgent = createTool({
  id: "ask_weatherAgent",
  description:
    "Ask the weatherAgent a question. Streams text tokens (vNext) by default over SSE when supported.",
  inputSchema: z.object({
    message: z.string().describe("The user question or input for the agent."),
    format: z
      .enum(["default", "aisdk"]) // optional: allow ai sdk v5 formatting for client compatibility
      .default("default")
      .optional(),
  }),
  execute: async ({ context }) => {
    const message = String((context as any)?.message ?? "");
    const format = ((context as any)?.format as "default" | "aisdk" | undefined) ?? "default";
    
    console.log('[askWeatherAgent] Received request:', { message, format });

    try {
      // Try streamVNext first (experimental)
      const stream = await weatherAgent.streamVNext(
        [{ role: "user", content: message }],
        format === "aisdk" ? { format: "aisdk" } : undefined as any
      );

      // Return a shape that MCP + Mastra can stream over SSE when supported
      // Fallback to full text for clients that don't consume streams
      const fullText = await stream.text;
      console.log('[askWeatherAgent] streamVNext succeeded, text length:', fullText.length);

      // If AISDK format requested, return a simple compatible shape
      if (format === "aisdk") {
        return {
          streamed: true,
          text: fullText,
          textStream: (stream as any).textStream ?? null,
        };
      }

      return {
        streamed: true,
        text: fullText,
        // Some MCP transports can detect and pipe web streams
        // We include a hint field for streaming UIs.
        textStream: (stream as any).textStream ?? null,
        finishReason: (stream as any).finishReason ?? null,
        usage: (stream as any).usage ?? null,
      };
    } catch (streamError) {
      console.warn('[askWeatherAgent] streamVNext failed, falling back to text method:', streamError);
      
      // Fallback to regular text method
      try {
        const result = await weatherAgentTestWrapper.text({ messages: [{ role: "user", content: message }] });
        const fullText = String(result?.text ?? "");
        console.log('[askWeatherAgent] text fallback succeeded, text length:', fullText.length);
        
        return {
          streamed: false,
          text: fullText,
          textStream: null,
          finishReason: null,
          usage: null,
        };
      } catch (textError) {
        console.error('[askWeatherAgent] Both streamVNext and text methods failed:', textError);
        return {
          streamed: false,
          text: `Agent error: ${textError instanceof Error ? textError.message : String(textError)}`,
          textStream: null,
          finishReason: null,
          usage: null,
        };
      }
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
    try {
      const res = await (weatherAgentTestWrapper as any).text({ messages: [{ role: "user", content: message }] });
      return { streamed: false, text: String(res?.text ?? "") };
    } catch (e) {
      return { streamed: false, text: `Agent text error: ${e instanceof Error ? e.message : String(e)}` };
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
  description: "Provides weather information and TTS capabilities via MCP",
  // Do not use auto agent-to-tool conversion (non-streaming). We expose a streaming tool instead.
  tools: {
    weatherTool,
    ask_weatherAgent: askWeatherAgent,
    ask_weatherAgent_text: askWeatherAgentText,
    health,
  },
});
