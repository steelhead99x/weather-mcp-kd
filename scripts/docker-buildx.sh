#!/usr/bin/env bash
set -euo pipefail

# IMAGE and CACHE_IMAGE should be set by caller, e.g.:
#   IMAGE=ghcr.io/your-org/weather-mcp-kd:latest \
#   CACHE_IMAGE=ghcr.io/your-org/weather-mcp-kd:buildcache \
#   bash scripts/docker-buildx.sh

: "${IMAGE:=weather-mcp-kd:latest}"
: "${CACHE_IMAGE:=weather-mcp-kd:buildcache}"
: "${PLATFORM:=linux/amd64}"

# Ensure BuildKit is enabled
export DOCKER_BUILDKIT=1

# Build with registry-backed cache for faster CI/CD rebuilds
exec docker buildx build \
  --platform "${PLATFORM}" \
  --cache-from=type=registry,ref="${CACHE_IMAGE}" \
  --cache-to=type=registry,ref="${CACHE_IMAGE}",mode=max \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -t "${IMAGE}" \
  .
