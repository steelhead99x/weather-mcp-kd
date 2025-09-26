import 'dotenv/config';
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { registerApiRoute } from "@mastra/core/server";
import { weatherAgent } from "./agents/weather-agent.js";
import { weatherMcpServer } from "./mcp/weather-server.js";

const corsOrigins = [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:8080',
    'https://weather-mcp-kd.streamingportfolio.com',
    'https://streamingportfolio.com',
    'https://ai.streamingportfolio.com',
    'https://stage-ai.streamingportfolio.com',
    ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [])
];

console.log('🌐 CORS Origins configured:', corsOrigins);
console.log('🔧 CORS_ORIGIN env var:', process.env.CORS_ORIGIN || 'not set');
console.log('🚀 Starting Weather Agent...');

export const mastra = new Mastra({
    agents: {
        weatherAgent
    },
    mcpServers: {
        weatherMcpServer
    },
    storage: new InMemoryStore(),
    server: {
        port: parseInt(process.env.PORT || '3000', 10),
        host: process.env.HOST || '0.0.0.0',
        build: {
            openAPIDocs: true,
            swaggerUI: true
        },
        cors: {
            origin: corsOrigins,
            credentials: true,
            allowHeaders: [
                'Content-Type',
                'Authorization',
                'X-Requested-With',
                'Accept',
                'Origin',
                'Access-Control-Request-Method',
                'Access-Control-Request-Headers',
                'sec-ch-ua',
                'sec-ch-ua-mobile',
                'sec-ch-ua-platform',
                'User-Agent',
                'Referer'
            ],
            allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
        },
        // Add custom routes for health checks
        apiRoutes: [
            // Health check endpoint for Mastra connection testing
            registerApiRoute("/health", {
                method: "GET",
                handler: async (c) => {
                    try {
                        const healthInfo = {
                            ok: true,
                            timestamp: new Date().toISOString(),
                            server: "weather-mcp-server",
                            version: "1.0.0",
                            status: "healthy",
                            environment: {
                                NODE_ENV: process.env.NODE_ENV || 'development',
                                PORT: process.env.PORT || '8080',
                                HOST: process.env.HOST || '0.0.0.0'
                            },
                            services: {
                                mastra: "running",
                                weatherAgent: "available",
                                mcpServer: "available"
                            }
                        };
                        
                        return c.json(healthInfo, 200);
                    } catch (error) {
                        console.error('Health check error:', error);
                        return c.json({
                            ok: false,
                            timestamp: new Date().toISOString(),
                            server: "weather-mcp-server",
                            status: "unhealthy",
                            error: error instanceof Error ? error.message : String(error)
                        }, 500);
                    }
                }
            }),

            // Root endpoint for basic connectivity
            registerApiRoute("/", {
                method: "GET",
                handler: async (c) => {
                    return c.json({
                        message: "Weather MCP Server is running",
                        timestamp: new Date().toISOString(),
                        endpoints: {
                            health: "/health",
                            mcp: "/mcp"
                        }
                    });
                }
            })
        ]
    }
});