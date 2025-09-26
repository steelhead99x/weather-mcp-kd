# Multi-stage build for production
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install production dependencies for all workspaces using a single lockfile
RUN npm ci --workspaces --omit=dev

# Build the application
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install all dependencies for all workspaces (including dev)
RUN npm ci --workspaces --include=dev

# Copy source code
COPY . .

# Build shared package first
RUN cd shared && npm run build

# Build the application
RUN npm run build

# Build Mastra output for production runtime
RUN cd backend && npx mastra build

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 weatheruser

# Copy built application
COPY --from=builder --chown=weatheruser:nodejs /app/backend/dist ./backend/dist
COPY --from=builder --chown=weatheruser:nodejs /app/frontend/dist ./frontend/dist
COPY --from=builder --chown=weatheruser:nodejs /app/shared/dist ./shared/dist
COPY --from=builder --chown=weatheruser:nodejs /app/backend/files ./backend/files

# Copy Mastra production output
COPY --from=builder --chown=weatheruser:nodejs /app/backend/.mastra ./backend/.mastra

# Copy production dependencies (hoisted workspaces install)
COPY --from=deps --chown=weatheruser:nodejs /app/node_modules ./node_modules

# Copy package files
COPY --chown=weatheruser:nodejs package*.json ./
COPY --chown=weatheruser:nodejs backend/package*.json ./backend/

USER weatheruser

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app/backend

# Run Mastra production server directly
CMD ["node", "--import=./.mastra/output/instrumentation.mjs", ".mastra/output/index.mjs"]