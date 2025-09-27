import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { MuxAnalyticsProvider } from '../contexts/MuxAnalyticsContext'

// Silence console.warn from mastraClient about missing env during tests
vi.spyOn(console, 'warn').mockImplementation(() => {})

// Custom render function that includes MuxAnalyticsProvider
const customRender = (ui: React.ReactElement, options = {}) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(MuxAnalyticsProvider, { children }, children)
  }
  
  return render(ui, {
    wrapper: Wrapper,
    ...options,
  })
}

// Export everything from testing-library
export * from '@testing-library/react'
export { customRender as render }