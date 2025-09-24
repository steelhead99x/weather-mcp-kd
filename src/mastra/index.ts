import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { weatherAgent } from "./agents/weather-agent.js";
import { weatherMcpServer } from "./mcp/weather-server.js";

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
            origin: process.env.CORS_ORIGIN ? 
                [process.env.CORS_ORIGIN, 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080'] :
                [
                    'http://localhost:3000',
                    'http://localhost:3001', 
                    'http://localhost:8080',
                    'https://weather-mcp-kd.streamingportfolio.com',
                    'https://streamingportfolio.com',
                    'https://ai.streamingportfolio.com'
                ],
            allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowHeaders: [
                'Content-Type', 
                'Authorization', 
                'x-mastra-client-type',
                'Accept',
                'Origin',
                'X-Requested-With',
                'Cache-Control',
                'Accept-Encoding',
                'Accept-Language',
                'text/event-stream',
                'Cache-Control',
                'Connection'
            ],
            exposeHeaders: ['Content-Length', 'X-Requested-With', 'Content-Type', 'Transfer-Encoding'],
            credentials: true
        },
        middleware: [
            async (c, next) => {
                // Custom CORS middleware for streamVNext endpoint
                const origin = c.req.header('Origin');
                const allowedOrigins = [
                    'http://localhost:3000',
                    'http://localhost:3001', 
                    'http://localhost:8080',
                    'https://weather-mcp-kd.streamingportfolio.com',
                    'https://streamingportfolio.com',
                    'https://ai.streamingportfolio.com'
                ];
                
                if (origin && allowedOrigins.includes(origin)) {
                    c.header('Access-Control-Allow-Origin', origin);
                    c.header('Access-Control-Allow-Credentials', 'true');
                    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
                    c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-mastra-client-type,Accept,Origin,X-Requested-With,Cache-Control,Accept-Encoding,Accept-Language,text/event-stream,Connection');
                    c.header('Access-Control-Expose-Headers', 'Content-Length,X-Requested-With,Content-Type,Transfer-Encoding');
                }
                
                // Handle preflight OPTIONS requests
                if (c.req.method === 'OPTIONS') {
                    return new Response(null, { 
                        status: 204,
                        headers: {
                            'Access-Control-Allow-Origin': origin && allowedOrigins.includes(origin) ? origin : '*',
                            'Access-Control-Allow-Credentials': 'true',
                            'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-mastra-client-type,Accept,Origin,X-Requested-With,Cache-Control,Accept-Encoding,Accept-Language,text/event-stream,Connection',
                            'Access-Control-Max-Age': '86400'
                        }
                    });
                }
                
                await next();
            }
        ]
    }
});