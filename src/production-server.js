#!/usr/bin/env node

/**
 * Production server that serves both Mastra backend API and Vite frontend
 * This is used for Digital Ocean App Platform deployment
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createProxyMiddleware } from 'http-proxy-middleware'
import cors from 'cors'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 8080
const HOST = process.env.HOST || '0.0.0.0'
const MASTRA_PORT = 3000

// Enable CORS for production
const corsOrigin = process.env.CORS_ORIGIN || 'https://weather-mcp-kd.streamingportfolio.com'
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))

// Serve static files from Vite build
const frontendDistPath = join(__dirname, '..', 'src', 'my-mastra-vite', 'dist')
app.use(express.static(frontendDistPath))

// Start Mastra backend server
console.log('🚀 Starting Mastra backend server...')
const mastraProcess = spawn('node', [
  '--import=./.mastra/output/instrumentation.mjs',
  '.mastra/output/index.mjs'
], {
  env: {
    ...process.env,
    PORT: MASTRA_PORT,
    HOST: '0.0.0.0',
    NODE_ENV: 'production'
  },
  stdio: ['inherit', 'inherit', 'inherit']
})

mastraProcess.on('error', (err) => {
  console.error('Failed to start Mastra server:', err)
})

mastraProcess.on('exit', (code) => {
  console.log(`Mastra server exited with code ${code}`)
})

// Wait for Mastra server to start
let mastraReady = false
const checkMastraHealth = async () => {
  try {
    const response = await fetch(`http://localhost:${MASTRA_PORT}/health`)
    if (response.ok) {
      mastraReady = true
      console.log('✅ Mastra backend server is ready')
    }
  } catch (error) {
    // Server not ready yet, try again
    setTimeout(checkMastraHealth, 1000)
  }
}

// Start checking for Mastra health after a short delay
setTimeout(checkMastraHealth, 2000)

// Proxy API requests to Mastra backend
app.use('/api', createProxyMiddleware({
  target: `http://localhost:${MASTRA_PORT}`,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api'
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message)
    if (!mastraReady) {
      res.status(503).json({ error: 'Backend service starting up...' })
    } else {
      res.status(500).json({ error: 'Backend service unavailable' })
    }
  }
}))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'weather-mcp-kd',
    version: '1.0.0',
    mastraReady: mastraReady
  })
})

// Serve frontend for all other routes (SPA routing)
app.use((req, res) => {
  res.sendFile(join(frontendDistPath, 'index.html'))
})

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Production server running on ${HOST}:${PORT}`)
  console.log(`📁 Serving frontend from: ${frontendDistPath}`)
  console.log(`🔗 Proxying API to: http://localhost:${MASTRA_PORT}`)
  console.log(`🌐 CORS origin: ${corsOrigin}`)
})

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...')
  mastraProcess.kill('SIGTERM')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
