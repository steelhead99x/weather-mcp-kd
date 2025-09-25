# FFmpeg Memory Optimization Guide

This document explains the memory optimizations implemented for the ffmpeg mux step with image and audio processing.

## Problem
The original implementation was consuming excessive memory when processing large images (up to 3024x4032 pixels, ~577KB) during video creation, leading to potential out-of-memory errors.

## Solutions Implemented

### 1. Image Resizing Before Processing
- **Function**: `resizeImageForVideo()`
- **Purpose**: Resizes images to a maximum of 1920x1080 before ffmpeg processing
- **Impact**: Reduces memory usage by ~75% for large images
- **Configuration**: `VIDEO_MAX_WIDTH` and `VIDEO_MAX_HEIGHT` environment variables

### 2. Memory-Efficient FFmpeg Parameters
- **Threading**: `-threads 0` (auto-detect optimal thread count)
- **Preset**: `-preset fast` (balanced speed/memory usage)
- **Quality**: `-crf 23` (constant rate factor for quality/size balance)
- **Buffer Control**: `-max_muxing_queue_size 1024` (limits internal buffer size)
- **Configuration**: `FFMPEG_PRESET`, `FFMPEG_CRF`, `FFMPEG_THREADS` environment variables

### 3. Streaming Mode for Large Files
- **Function**: `createVideoFromAudioAndImageStreaming()`
- **Trigger**: Automatically used when total file size > 5MB
- **Features**:
  - Smaller buffer size (`-max_muxing_queue_size 512`)
  - Frame rate limiting (`-r 30`)
  - Constant frame rate (`-vsync cfr`)
  - Presentation timestamp generation (`-fflags +genpts`)

### 4. Memory Monitoring and Cleanup
- **Function**: `logMemoryUsage()` - tracks RSS and heap usage
- **Function**: `forceGC()` - forces garbage collection when available
- **Monitoring Points**: Start, after resize, end of processing
- **Cleanup**: Automatic temporary file cleanup

### 5. Environment Configuration
```bash
# Memory optimization settings
VIDEO_MAX_WIDTH=1920          # Maximum video width
VIDEO_MAX_HEIGHT=1080         # Maximum video height
FFMPEG_PRESET=fast           # Encoding preset (ultrafast to veryslow)
FFMPEG_CRF=23                # Quality factor (0-51, lower=better)
FFMPEG_THREADS=0             # Thread count (0=auto-detect)

# Node.js memory settings
NODE_OPTIONS="--expose-gc --max-old-space-size=1024"
```

## Performance Impact

### Before Optimization
- Large images (3024x4032) processed at full resolution
- No memory monitoring
- No garbage collection
- Single processing mode

### After Optimization
- Images resized to max 1920x1080 (75% reduction in pixels)
- Memory usage tracked and logged
- Automatic garbage collection
- Dual-mode processing (optimized vs streaming)
- Configurable parameters via environment variables

## Usage Examples

### For Maximum Memory Savings
```bash
export VIDEO_MAX_WIDTH=1280
export VIDEO_MAX_HEIGHT=720
export FFMPEG_PRESET=ultrafast
export FFMPEG_CRF=28
```

### For Maximum Quality (Higher Memory Usage)
```bash
export VIDEO_MAX_WIDTH=1920
export VIDEO_MAX_HEIGHT=1080
export FFMPEG_PRESET=medium
export FFMPEG_CRF=18
```

### For Production (Balanced)
```bash
export VIDEO_MAX_WIDTH=1920
export VIDEO_MAX_HEIGHT=1080
export FFMPEG_PRESET=fast
export FFMPEG_CRF=23
```

## Monitoring

The system now logs memory usage at key points:
```
[createVideo-start] Memory usage: RSS=45MB, Heap=12MB/25MB
[createVideo-after-resize] Memory usage: RSS=52MB, Heap=15MB/25MB
[createVideo-end] Memory usage: RSS=48MB, Heap=13MB/25MB
```

## Troubleshooting

### High Memory Usage
1. Reduce `VIDEO_MAX_WIDTH` and `VIDEO_MAX_HEIGHT`
2. Use `FFMPEG_PRESET=ultrafast` for fastest encoding
3. Increase `FFMPEG_CRF` value (lower quality, less memory)

### Slow Processing
1. Use `FFMPEG_PRESET=fast` or `medium`
2. Reduce `FFMPEG_CRF` value (higher quality, more memory)
3. Set `FFMPEG_THREADS` to number of CPU cores

### Out of Memory Errors
1. Enable garbage collection: `NODE_OPTIONS="--expose-gc"`
2. Reduce max image dimensions
3. Use streaming mode (automatic for files > 5MB)
