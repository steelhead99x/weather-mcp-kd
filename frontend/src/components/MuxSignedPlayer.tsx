import { useEffect, useMemo, useState, Suspense, lazy, useRef } from 'react'

// Lazy load MuxPlayer to reduce initial bundle size
const MuxPlayer = lazy(() => import('@mux/mux-player-react').then(module => ({ default: module.default })))

// Error handler for WritableStream issues
const handleStreamError = (error: ErrorEvent) => {
  if (error.message && error.message.includes('WritableStream')) {
    console.warn('[MuxPlayer] WritableStream error caught and suppressed:', error.message)
    return true // Prevent default error handling
  }
  return false
}

/**
 * A lightweight wrapper that fetches a signed playback token for a Mux asset
 * and renders Mux Player once ready.
 */
export default function MuxSignedPlayer({
  assetId: assetIdProp,
  assetID,
  assetid,
  type = 'video',
  className,
}: {
  assetId?: string
  assetID?: string
  assetid?: string
  type?: 'video'
  className?: string
}) {
  const DEFAULT_ASSET_ID = '00ixOU3x6YI02DXIzeQ00wEzTwAHyUojsiewp7fC4FNeNw'

  // Allow URL query param override (?assetid=..., ?assetId=..., or ?assetID=...)
  const assetIdFromQuery = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    try {
      const sp = new URLSearchParams(window.location.search)
      const raw = sp.get('assetId') || sp.get('assetID') || sp.get('assetid')
      const val = raw?.trim()
      return val ? val : undefined
    } catch {
      return undefined
    }
  }, [])

  const assetId = assetIdProp || assetID || assetid || assetIdFromQuery || import.meta.env.VITE_MUX_ASSET_ID || DEFAULT_ASSET_ID
  const keyServerUrl = 'https://streamingportfolio.com/streamingportfolio-mux-keyserver/api/tokens'

  const [state, setState] = useState<
    | { status: 'idle' | 'loading' }
    | { status: 'ready'; playbackId: string; token: string; thumbnailToken?: string; width?: number; height?: number }
    | { status: 'error'; message: string }
  >({ status: 'idle' })

  const body = useMemo(() => ({ assetId, type }), [assetId, type])
  const playerRef = useRef<any>(null)

  // Setup global error handler for WritableStream errors
  useEffect(() => {
    const originalHandler = window.onerror
    
    window.onerror = (message, source, lineno, colno, error) => {
      // Check if this is a WritableStream error
      if (typeof message === 'string' && message.includes('WritableStream')) {
        console.warn('[MuxPlayer] WritableStream error suppressed:', message)
        return true // Prevent default error handling
      }
      
      // Call original handler for other errors
      if (originalHandler) {
        return originalHandler(message, source, lineno, colno, error)
      }
      return false
    }

    // Also handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason && typeof event.reason === 'object' && 
          event.reason.message && event.reason.message.includes('WritableStream')) {
        console.warn('[MuxPlayer] WritableStream promise rejection suppressed:', event.reason.message)
        event.preventDefault()
      }
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.onerror = originalHandler
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        console.log('[MuxSignedPlayer] Starting token fetch for assetId:', assetId)
        console.log('[MuxSignedPlayer] Keyserver URL:', keyServerUrl)
        console.log('[MuxSignedPlayer] Request body:', JSON.stringify(body, null, 2))
        
        setState({ status: 'loading' })
        
        const res = await fetch(keyServerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        
        console.log('[MuxSignedPlayer] Response status:', res.status)
        console.log('[MuxSignedPlayer] Response headers:', Object.fromEntries(res.headers.entries()))
        
        if (!res.ok) {
          const errorText = await res.text()
          console.error('[MuxSignedPlayer] Keyserver error response:', errorText)
          const message = `Keyserver error ${res.status}: ${errorText}`
          if (!cancelled) setState({ status: 'error', message })
          return
        }
        
        const data: any = await res.json()
        console.log('[MuxSignedPlayer] Keyserver response data:', JSON.stringify(data, null, 2))

        // Try to be flexible with field names returned by the keyserver.
        const playbackId: string | undefined = data.playbackId || data.playback_id || data.playbackID
        const token: string | undefined = data.token || data.playbackToken || data.playback_token
        const thumbnailToken: string | undefined = data.thumbnailToken || data.thumbnail_token || data.thumbnail
        const width: number | undefined = data.width || data.videoWidth || data.w
        const height: number | undefined = data.height || data.videoHeight || data.h

        console.log('[MuxSignedPlayer] Extracted values:', {
          playbackId: playbackId ? `${playbackId.substring(0, 8)}...` : 'undefined',
          token: token ? `${token.substring(0, 8)}...` : 'undefined',
          thumbnailToken: thumbnailToken ? `${thumbnailToken.substring(0, 8)}...` : 'undefined',
          width,
          height
        })

        if (!playbackId) {
          console.error('[MuxSignedPlayer] Missing playbackId in response')
          if (!cancelled) setState({ status: 'error', message: 'Missing playbackId in token response' })
          return
        }
        if (!token) {
          console.error('[MuxSignedPlayer] Missing token in response')
          if (!cancelled) setState({ status: 'error', message: 'Missing token in token response' })
          return
        }
        if (cancelled) return
        
        console.log('[MuxSignedPlayer] Successfully obtained tokens, setting ready state')
        setState({ status: 'ready', playbackId, token, thumbnailToken, width, height })
      } catch (e: any) {
        console.error('[MuxSignedPlayer] Error during token fetch:', e)
        console.error('[MuxSignedPlayer] Error stack:', e?.stack)
        if (cancelled) return
        setState({ status: 'error', message: e?.message || 'Failed to fetch playback token' })
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [keyServerUrl, body])

  if (!assetId) {
    return (
      <div className={className}>
        <div className="text-sm" style={{ color: 'var(--fg-subtle)' }}>No Mux assetId configured.</div>
      </div>
    )
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className={className}>
        <div className="w-full aspect-video rounded-xl border grid place-items-center text-sm" style={{ background: 'var(--overlay)', borderColor: 'var(--border)', color: 'var(--fg-muted)' }}>
          <div className="flex items-center gap-2">
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
            <span>Loading video…</span>
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className={className}>
        <div className="w-full aspect-video rounded-xl border grid place-items-center text-sm" style={{ background: 'var(--overlay)', borderColor: 'var(--error)', color: 'var(--error)' }}>
          {state.message}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <Suspense fallback={
        <div className="w-full aspect-video rounded-xl border grid place-items-center text-sm" style={{ background: 'var(--overlay)', borderColor: 'var(--border)', color: 'var(--fg-muted)' }}>
          <div className="flex items-center gap-2">
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
            <span>Loading player...</span>
          </div>
        </div>
      }>
        <MuxPlayer
          ref={playerRef}
          playbackId={state.status === 'ready' ? state.playbackId : ''}
          tokens={{ 
            playback: state.status === 'ready' ? state.token : '',
            ...(state.status === 'ready' && state.thumbnailToken && { thumbnail: state.thumbnailToken })
          }}
          streamType="on-demand"
          autoPlay={false}
          onError={(error: any) => {
            // Handle MuxPlayer errors gracefully
            if (error && typeof error === 'object' && error.message) {
              if (error.message.includes('WritableStream')) {
                console.warn('[MuxPlayer] WritableStream error in player, suppressed:', error.message)
                return // Don't propagate WritableStream errors
              }
            }
            console.error('[MuxPlayer] Player error:', error)
          }}
          style={{
            width: '100%',
            height: 'auto',
            aspectRatio: state.status === 'ready' && state.width && state.height ? `${state.width} / ${state.height}` : '16 / 9',
            borderRadius: 12,
          }}
        />
      </Suspense>
    </div>
  )
}
