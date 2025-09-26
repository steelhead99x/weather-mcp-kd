# Digital Ocean App Platform - Full Stack Deployment
# Serves both Mastra backend API and Vite frontend
FROM node:20-alpine

# Install ffmpeg for video processing (system ffmpeg with musl)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install root dependencies (including dev) for build
RUN npm install

# Copy source code
COPY . .

# Ensure background images directory exists
RUN mkdir -p files/images

# Build both backend and frontend
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --omit=dev

# Create runtime temp directory
RUN mkdir -p /tmp/tts

EXPOSE 8080

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

# Use the fullstack production server that serves both backend and frontend
CMD ["npm", "run", "start:fullstack"]