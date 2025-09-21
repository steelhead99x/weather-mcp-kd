import 'dotenv/config';
import http from 'node:http';
import url from 'node:url';
import { weatherTool } from './mastra/tools/weather.js';
import { weatherAgent } from './mastra/agents/weather-agent.js';

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize weather agent with greeting
const initializeWeatherAgent = async () => {
    const greeting = "Hello! I'm your personal weather assistant. Please share your 5-digit ZIP code and I'll provide you with current conditions, detailed forecasts, and can even create an audio weather report for you to stream!";

    console.log('[Weather Agent] Initial greeting:', greeting);
    return greeting;
};

function json(res: http.ServerResponse, status: number, body: any) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data).toString(),
    });
    res.end(data);
}

const server = http.createServer(async (req, res) => {
    try {
        if (!req.url) {
            res.statusCode = 400;
            return res.end('Bad Request');
        }

        const parsed = url.parse(req.url, true);
        const pathname = parsed.pathname || '/';

        // Health check endpoint for DigitalOcean
        if (req.method === 'GET' && pathname === '/health') {
            return json(res, 200, { status: 'ok' });
        }

        // Simple root message with agent greeting
        if (req.method === 'GET' && pathname === '/') {
            const greeting = await initializeWeatherAgent();
            return json(res, 200, {
                name: 'weather-agent-kd',
                message: 'Service is running. Try GET /health or /weather?zip=94102',
                agentGreeting: greeting
            });
        }

        // Add a new endpoint for agent chat
        if (req.method === 'GET' && pathname === '/agent/greeting') {
            const greeting = await initializeWeatherAgent();
            return json(res, 200, { greeting });
        }

        // New thread initial messages endpoint (for UI expecting Mastra-style path)
        // GET /api/memory/threads/new/messages?agentId=weatherAgent
        if (req.method === 'GET' && pathname === '/api/memory/threads/new/messages') {
            const agentId = (parsed.query?.agentId as string) || '';
            // Validate agent id: our configured agent key is weatherAgent
            const validAgentIds = new Set(['weatherAgent', 'weather-agent', process.env.AGENT_NAME || '']);
            if (agentId && !validAgentIds.has(agentId)) {
                return json(res, 400, { error: `Unknown agentId: ${agentId}` });
            }

            const greeting = await initializeWeatherAgent();

            // Return a minimal structure that frontends typically expect: a list of UI messages
            // Adjust this shape here if your frontend expects a different key
            const uiMessages = [
                { id: 'm-0', role: 'assistant', type: 'text', content: greeting, createdAt: new Date().toISOString() }
            ];
            return json(res, 200, {
                threadId: 'new',
                agentId: agentId || 'weatherAgent',
                messages: uiMessages,
                uiMessages
            });
        }

        // Weather endpoint: GET /weather?zip=XXXXX
        if (req.method === 'GET' && pathname === '/weather') {
            const zip = (parsed.query?.zip as string) || '';
            if (!/^[0-9]{5}$/.test(zip)) {
                return json(res, 400, { error: 'Missing or invalid zip parameter (expected 5 digits)' });
            }

            try {
                const result = await weatherTool.execute({ context: { zipCode: zip } } as any);
                return json(res, 200, { zip, result });
            } catch (err: any) {
                console.error('Weather endpoint error:', err);
                return json(res, 500, { error: 'Failed to fetch weather', details: String(err?.message || err) });
            }
        }

        // Not found
        json(res, 404, { error: 'Not Found' });
    } catch (e: any) {
        console.error('Unhandled server error:', e);
        json(res, 500, { error: 'Internal Server Error', details: String(e?.message || e) });
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[server] Listening on http://${HOST}:${PORT}`);
    // Initialize agent greeting on startup
    initializeWeatherAgent().then(greeting => {
        console.log('[Weather Agent] Ready with greeting');
    });
});