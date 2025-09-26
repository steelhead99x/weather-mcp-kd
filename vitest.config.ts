import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['src/my-mastra-vite/src/test/setup.ts'],
    globals: true,
    root: 'src/my-mastra-vite',
  },
})
