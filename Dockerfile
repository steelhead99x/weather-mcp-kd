FROM node:20-bookworm-slim

# Install ffmpeg for video processing (Debian provides H.264/AAC support)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files (lockfile optional)
COPY package*.json ./

# Install dependencies
# - Use npm ci when package-lock.json is present for reproducible installs
# - Fallback to npm install when lockfile is absent (e.g., in certain CI/CD contexts)
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create directories for file uploads
RUN mkdir -p files/uploads/tts files/uploads/images

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# Start the application with telemetry
CMD ["npm", "run", "start:telemetry"]