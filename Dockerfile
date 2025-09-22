FROM node:20-alpine

# Install ffmpeg for video processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files explicitly to ensure lockfile is present
COPY package.json package-lock.json ./

# Install dependencies (omit dev deps for production)
RUN npm ci --omit=dev

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

# Start the application with telemetry
CMD ["npm", "run", "start:telemetry"]