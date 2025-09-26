import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors({
  origin: ['https://ai.streamingportfolio.com', 'https://stage-ai.streamingportfolio.com', 'http://localhost:3333', 'http://localhost:3334', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-mastra-client-type']
}));

// Proxy configuration
const proxyOptions = {
  target: 'https://stage-weather-mcp-kd.streamingportfolio.com',
  changeOrigin: true,
  secure: true,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[CORS-Proxy] ${new Date().toISOString()} - Proxying ${req.method} ${req.url} to ${proxyOptions.target}${req.url}`);
    console.log(`[CORS-Proxy] Request headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[CORS-Proxy] Request body length:`, req.headers['content-length'] || 'unknown');
    
    // Log request body for debugging (be careful with sensitive data)
    if (req.method === 'POST' || req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsedBody = JSON.parse(body);
          console.log(`[CORS-Proxy] Request body:`, JSON.stringify(parsedBody, null, 2));
        } catch (e) {
          console.log(`[CORS-Proxy] Request body (raw):`, body.substring(0, 500));
        }
      });
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[CORS-Proxy] ${new Date().toISOString()} - Response received: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
    console.log(`[CORS-Proxy] Response headers:`, Object.keys(proxyRes.headers));
    
    // Ensure CORS headers are present
    proxyRes.headers['Access-Control-Allow-Origin'] = req.headers.origin || '*';
    proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, x-mastra-client-type';
    
    // Log response body for debugging
    let responseBody = '';
    proxyRes.on('data', chunk => {
      responseBody += chunk.toString();
    });
    proxyRes.on('end', () => {
      try {
        const parsedResponse = JSON.parse(responseBody);
        console.log(`[CORS-Proxy] Response body:`, JSON.stringify(parsedResponse, null, 2));
      } catch (e) {
        console.log(`[CORS-Proxy] Response body (raw):`, responseBody.substring(0, 1000));
      }
    });
  },
  onError: (err, req, res) => {
    console.error(`[CORS-Proxy] ${new Date().toISOString()} - Proxy error:`, err);
    console.error(`[CORS-Proxy] Error details:`, {
      message: err.message,
      code: err.code,
      errno: err.errno,
      syscall: err.syscall,
      hostname: err.hostname,
      port: err.port
    });
    res.status(500).json({ 
      error: 'Proxy error', 
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Apply proxy to all /api routes
app.use('/api', createProxyMiddleware(proxyOptions));

// Handle OPTIONS requests for CORS preflight
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-mastra-client-type');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(200).end();
  } else {
    next();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`CORS proxy server running on port ${PORT}`);
  console.log(`Proxying requests to: https://stage-weather-mcp-kd.streamingportfolio.com`);
  console.log(`Access the proxy at: http://localhost:${PORT}/api/agents/weatherAgent/stream/vnext`);
});
