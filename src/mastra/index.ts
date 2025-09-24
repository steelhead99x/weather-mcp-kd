import 'dotenv/config';
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { weatherAgent } from "./agents/weather-agent.js";
import { weatherMcpServer } from "./mcp/weather-server.js";

const corsOrigins = [
    'http://localhost:3000',
    'http://localhost:3001', 
    'http://localhost:8080',
    'https://weather-mcp-kd.streamingportfolio.com',
    'https://streamingportfolio.com',
    'https://ai.streamingportfolio.com',
    ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [])
];

console.log('🌐 CORS Origins configured:', corsOrigins);
console.log('🔧 CORS_ORIGIN env var:', process.env.CORS_ORIGIN || 'not set');

export const mastra = new Mastra({
    agents: {
        weatherAgent
    },
    mcpServers: {
        weatherMcpServer
    },
    storage: new InMemoryStore(),
    server: {
        port: parseInt(process.env.PORT || '8080', 10),
        host: process.env.HOST || '0.0.0.0',
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
        }
    }
});