# Multi-stage build for production
FROM node:20.18-alpine AS base

# Install system dependencies needed for native modules (canvas, etc.)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

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
FROM base AS builder-deps
WORKDIR /app

# Ensure Python is available for node-gyp
RUN ln -sf python3 /usr/bin/python

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared/package*.json ./shared/

# Install all dependencies for all workspaces (including dev)
RUN npm ci --workspaces --include=dev

# Build shared package
FROM builder-deps AS build-shared
WORKDIR /app
COPY shared ./shared
RUN npm --workspace shared run build

# Build backend (depends on shared sources for TS paths)
FROM builder-deps AS build-backend
WORKDIR /app
COPY backend ./backend
COPY shared ./shared
RUN npm --workspace backend run build

# Build frontend (depends on shared sources for TS paths)
FROM builder-deps AS build-frontend
WORKDIR /app
COPY frontend ./frontend
COPY shared ./shared
RUN npm --workspace frontend run build

# (Optional) Mastra CLI build is skipped in CI to avoid failures; runtime can use dist

# Production image
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 weatheruser

# Install runtime dependencies (ffmpeg + canvas runtime libs)
RUN apk add --no-cache \
    ffmpeg \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype

# Copy built application
COPY --from=build-backend --chown=weatheruser:nodejs /app/backend/dist ./backend/dist
COPY --from=build-frontend --chown=weatheruser:nodejs /app/frontend/dist ./frontend/dist
COPY --from=build-shared --chown=weatheruser:nodejs /app/shared/dist ./shared/dist
COPY --from=build-backend --chown=weatheruser:nodejs /app/backend/files ./backend/files

# Copy frontend dist to backend directory for easier access
COPY --from=build-frontend --chown=weatheruser:nodejs /app/frontend/dist ./backend/frontend/dist

# Fix the dist structure - move the nested files to the correct location
RUN mkdir -p /app/backend/dist && \
    if [ -d /app/backend/dist/backend/src ]; then \
        cp -r /app/backend/dist/backend/src/* /app/backend/dist/ && \
        rm -rf /app/backend/dist/backend; \
    fi

# Create charts directory with proper permissions
RUN mkdir -p /app/backend/files/charts && chown -R weatheruser:nodejs /app/backend/files

# (No Mastra CLI output copied)

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

CMD ["npm", "run", "start:production"]