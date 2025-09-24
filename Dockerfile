FROM node:20-alpine

# Install ffmpeg for video processing (system ffmpeg with musl)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files (lockfile optional)
COPY package*.json ./

# Install all dependencies (including dev) for build
RUN npm install

# Copy source code
COPY . .

# Ensure background images directory exists. Do NOT create an empty fallback image; the app
# will generate a valid tiny PNG at runtime if none is provided.
RUN mkdir -p files/images

# Build the application
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --omit=dev

# Create runtime temp directory
RUN mkdir -p /tmp/tts

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
# Ensure temp dir is configurable
ENV TTS_TMP_DIR=/tmp/tts

CMD ["npm", "run", "start:telemetry"]