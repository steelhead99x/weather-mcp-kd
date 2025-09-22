// Minimal declaration to satisfy TypeScript when @types/ws is not installed
// This keeps Docker production builds lightweight while allowing compilation.
declare module 'ws';
