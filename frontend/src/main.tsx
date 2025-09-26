import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Initialize theme before React renders to minimize flash
;(function initTheme() {
  try {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const theme = stored || (prefersDark ? 'dark' : 'light')
    if (theme === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  } catch {}
})()

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
