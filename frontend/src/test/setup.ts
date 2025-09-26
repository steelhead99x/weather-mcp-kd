import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Silence console.warn from mastraClient about missing env during tests
vi.spyOn(console, 'warn').mockImplementation(() => {})
