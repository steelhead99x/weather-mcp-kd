import React, { Suspense, lazy } from 'react'
import WeatherChat from './components/WeatherChat'
import ThemeToggle from './components/ThemeToggle'
import MCPDebugPanel from './components/MCPDebugPanel'

// Lazy load components to reduce initial bundle size
const MuxSignedPlayer = lazy(() => import('./components/MuxSignedPlayer'))
const ErrorBoundary = lazy(() => import('./components/ErrorBoundary'))

export default function App() {
  return (
    <div className="min-h-screen">
      <div className="absolute inset-0 pointer-events-none">
        {/* Soft background textures using tokens for theme compatibility */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%)' }} />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=80&w=2070&auto=format&fit=crop')", backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <svg className="absolute inset-x-0 bottom-0 w-full h-[55vh]" viewBox="0 0 1440 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2e5d3d" />
              <stop offset="100%" stopColor="#1f3d2b" />
            </linearGradient>
          </defs>
          <path d="M0 380 L160 260 L300 340 L460 220 L600 360 L760 240 L900 360 L1040 280 L1200 360 L1360 300 L1440 360 L1440 600 L0 600 Z" fill="url(#g1)" opacity="0.25" />
          <path d="M0 440 L140 320 L260 420 L420 320 L560 440 L720 340 L860 440 L1000 360 L1180 440 L1320 400 L1440 440 L1440 600 L0 600 Z" fill="var(--overlay)" />
          <path d="M0 500 L120 380 L240 480 L380 400 L520 500 L680 420 L820 500 L980 440 L1140 500 L1300 460 L1440 500 L1440 600 L0 600 Z" fill="var(--overlay-strong)" />
        </svg>
      </div>

      <header className="relative z-10 max-w-5xl mx-auto px-6 pt-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center shadow-card border" style={{ background: 'var(--overlay)', borderColor: 'var(--border)' }}>
              <span className="text-xl" style={{ color: 'var(--warn)' }}>☀️</span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--fg)' }}>WeatherAgent for Farmers</h1>
              <p className="text-sm" style={{ color: 'var(--fg-subtle)' }}>Farmer-friendly, solar-powered forecasts and seasonal crop advice.</p>
            </div>
          </div>
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl md:max-w-5xl mx-auto p-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Video (1/3 on md+) */}
          <div className="md:col-span-1 order-2 md:order-1">
            <div className="card p-4 md:p-6">
              <Suspense fallback={
                <div className="w-full aspect-video rounded-xl border grid place-items-center text-sm" style={{ background: 'var(--overlay)', borderColor: 'var(--border)', color: 'var(--fg-muted)' }}>
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
                    <span>Loading video...</span>
                  </div>
                </div>
              }>
                <ErrorBoundary>
                  <MuxSignedPlayer className="w-full mx-auto" />
                </ErrorBoundary>
              </Suspense>
            </div>
          </div>

          {/* Chat (2/3 on md+) */}
          <div className="md:col-span-2 order-1 md:order-2">
            <div className="card p-6 md:p-8">
              <Suspense fallback={
                <div className="flex flex-col gap-4">
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                  <div className="h-64 bg-gray-100 rounded-xl"></div>
                </div>
              }>
                <ErrorBoundary>
                  <WeatherChat />
                </ErrorBoundary>
              </Suspense>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 max-w-5xl mx-auto px-6 pb-10" style={{ color: 'var(--fg-muted)' }}>
        <p className="text-xs">Solar-powered WeatherAgent for Agriculture • Mastra Agents • Tailwind CSS • Vite + React</p>
      </footer>

      {/* Debug Panel */}
      <MCPDebugPanel />
    </div>
  )
}
