# Digital Ocean App Platform - Single App Deployment
# This is a single full-stack application with Mastra backend + Vite frontend
FROM node:20-alpine

# Install ffmpeg for video processing (system ffmpeg with musl)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy ONLY the root package.json (ignore .mastra/output/package.json)
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev) for build
RUN npm ci

# Copy source code (excluding .mastra directory via .dockerignore)
COPY . .

# Ensure required directories exist
RUN mkdir -p files/images /tmp/tts

# Build the application (both backend and frontend)
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --omit=dev

EXPOSE 8080

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV TTS_TMP_DIR=/tmp/tts
ENV CORS_ORIGIN=https://weather-mcp-kd.streamingportfolio.com

# Memory optimization for ffmpeg
ENV VIDEO_MAX_WIDTH=1920
ENV VIDEO_MAX_HEIGHT=1080
ENV FFMPEG_PRESET=fast
ENV FFMPEG_CRF=23
ENV FFMPEG_THREADS=0

# Enable garbage collection for memory optimization
ENV NODE_OPTIONS="--expose-gc --max-old-space-size=1024"

# Single entry point - serves both backend API and frontend
CMD ["npm", "run", "start:fullstack"]