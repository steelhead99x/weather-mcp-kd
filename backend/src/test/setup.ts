import { config } from 'dotenv';
import { resolve as resolvePath } from 'path';
import { existsSync } from 'fs';

// Load environment variables - try multiple locations for tests
const rootEnvPath = resolvePath(process.cwd(), '../.env');
const localEnvPath = resolvePath(process.cwd(), '.env');
const backendEnvPath = resolvePath(process.cwd(), 'backend/.env');

if (existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else if (existsSync(localEnvPath)) {
  config({ path: localEnvPath });
} else if (existsSync(backendEnvPath)) {
  config({ path: backendEnvPath });
} else {
  config(); // Load from default location
}

// Mock external services for tests
process.env.NODE_ENV = 'test';

// Set test-specific environment variables
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = 'test-key-anthropic';
}

if (!process.env.DEEPGRAM_API_KEY) {
  process.env.DEEPGRAM_API_KEY = 'test-key-deepgram';
}

if (!process.env.MUX_TOKEN_ID) {
  process.env.MUX_TOKEN_ID = 'test-mux-id';
}

if (!process.env.MUX_TOKEN_SECRET) {
  process.env.MUX_TOKEN_SECRET = 'test-mux-secret';
}

// Suppress console output during tests unless debug is enabled
if (!process.env.DEBUG_TESTS) {
  const originalConsole = console;
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  
  // Keep error logging for debugging failed tests
  console.error = originalConsole.error;
}
