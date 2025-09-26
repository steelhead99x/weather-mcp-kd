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

# Install dependencies
RUN npm ci --omit=dev

# Build the application
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Build shared package first
RUN cd shared && npm run build

# Build the application
RUN npm run build

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

# Copy production dependencies
COPY --from=deps --chown=weatheruser:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=weatheruser:nodejs /app/backend/node_modules ./backend/node_modules
COPY --from=deps --chown=weatheruser:nodejs /app/frontend/node_modules ./frontend/node_modules
COPY --from=deps --chown=weatheruser:nodejs /app/shared/node_modules ./shared/node_modules

# Copy package files
COPY --chown=weatheruser:nodejs package*.json ./
COPY --chown=weatheruser:nodejs backend/package*.json ./backend/

USER weatheruser

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app/backend

CMD ["npm", "run", "start:production"]