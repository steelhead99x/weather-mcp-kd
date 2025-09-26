import React, { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // In production, you might want to send this to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: sendErrorToService(error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="card p-6 text-center">
          <div className="text-2xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--fg)' }}>
            Something went wrong
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--fg-subtle)' }}>
            We encountered an unexpected error. Please refresh the page to try again.
          </p>
          <button
            className="btn"
            onClick={() => window.location.reload()}
            aria-label="Refresh page to retry"
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm" style={{ color: 'var(--fg-subtle)' }}>
                Error Details (Development)
              </summary>
              <pre className="mt-2 text-xs p-2 rounded border" style={{ background: 'var(--overlay)', borderColor: 'var(--border)' }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
