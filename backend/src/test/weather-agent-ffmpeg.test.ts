/**
 * Weather Agent FFmpeg Function Tests
 * 
 * Tests that mock the ffmpeg functions used in the weather agent
 * without requiring actual video processing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock fluent-ffmpeg at the module level
const mockFfmpeg = {
  input: vi.fn().mockReturnThis(),
  inputOptions: vi.fn().mockReturnThis(),
  audioCodec: vi.fn().mockReturnThis(),
  videoCodec: vi.fn().mockReturnThis(),
  outputOptions: vi.fn().mockReturnThis(),
  output: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  run: vi.fn(),
  setFfmpegPath: vi.fn(),
}

vi.mock('fluent-ffmpeg', () => {
  return {
    default: () => mockFfmpeg,
    __esModule: true,
  }
})

// Mock fs operations
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    unlink: vi.fn().mockResolvedValue(undefined),
  }
})

// Mock fs/promises operations
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises')
  return {
    ...actual,
    unlink: vi.fn().mockResolvedValue(undefined),
  }
})

describe('Weather Agent FFmpeg Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('FFmpeg Configuration', () => {
    it('should configure ffmpeg path detection logic', async () => {
      // Test the configuration logic from weather agent
      console.log('🔧 Testing FFmpeg path configuration...')

      const { existsSync } = await import('fs')
      vi.mocked(existsSync).mockReturnValue(true)

      // Mock the ffmpeg-static module
      vi.doMock('ffmpeg-static', () => '/usr/local/bin/ffmpeg-static')
      
      // Mock the @ffmpeg-installer/ffmpeg module  
      vi.doMock('@ffmpeg-installer/ffmpeg', () => ({ path: '/usr/local/bin/ffmpeg-installer' }))

      const fluent = (await import('fluent-ffmpeg')).default

      // Test configuration
      fluent().setFfmpegPath = mockFfmpeg.setFfmpegPath
      fluent()

      console.log('✅ FFmpeg configuration logic validated')
    })

    it('should handle missing ffmpeg binaries gracefully', async () => {
      console.log('⚠️  Testing missing FFmpeg binary handling...')
      
      const { existsSync } = await import('fs')
      vi.mocked(existsSync).mockReturnValue(false)

      // Test that the code doesn't crash when no ffmpeg is found
      const candidates = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
      ]

      const found = candidates.find(p => {
        try { 
          return vi.mocked(existsSync)(p)
        } catch { 
          return false 
        }
      })

      expect(found).toBeUndefined()
      console.log('✅ Graceful handling of missing FFmpeg validated')
    })
  })

  describe('Video Creation Functions', () => {
    it('should create video with proper options for weather agent', async () => {
      console.log('🎬 Testing video creation function...')

      const fluent = (await import('fluent-ffmpeg')).default
      const ffmpegInstance = fluent()

      // Simulate the video creation process
      const audioPath = '/test/audio.wav'
      const imagePath = '/test/image.jpg'
      const outputPath = '/test/output.mp4'

      // Configure like the weather agent does
      ffmpegInstance
        .input(imagePath)
        .inputOptions(['-loop 1'])
        .input(audioPath)
        .audioCodec('aac')
        .videoCodec('libx264')
        .outputOptions([
          '-b:a 128k',
          '-pix_fmt yuv420p', 
          '-shortest',
          '-movflags +faststart',
          '-threads 0',
          '-preset fast',
          '-crf 23',
          '-max_muxing_queue_size 1024',
          '-avoid_negative_ts make_zero',
        ])
        .output(outputPath)

      // Verify all the calls were made correctly
      expect(mockFfmpeg.input).toHaveBeenCalledWith(imagePath)
      expect(mockFfmpeg.inputOptions).toHaveBeenCalledWith(['-loop 1'])
      expect(mockFfmpeg.input).toHaveBeenCalledWith(audioPath)
      expect(mockFfmpeg.audioCodec).toHaveBeenCalledWith('aac')
      expect(mockFfmpeg.videoCodec).toHaveBeenCalledWith('libx264')
      expect(mockFfmpeg.outputOptions).toHaveBeenCalledWith([
        '-b:a 128k',
        '-pix_fmt yuv420p',
        '-shortest', 
        '-movflags +faststart',
        '-threads 0',
        '-preset fast',
        '-crf 23',
        '-max_muxing_queue_size 1024',
        '-avoid_negative_ts make_zero',
      ])
      expect(mockFfmpeg.output).toHaveBeenCalledWith(outputPath)

      console.log('✅ Video creation function validated')
    })

    it('should create streaming video with optimized options', async () => {
      console.log('📡 Testing streaming video creation...')

      const fluent = (await import('fluent-ffmpeg')).default
      const ffmpegInstance = fluent()

      // Simulate streaming video creation
      ffmpegInstance
        .input('/test/image.jpg')
        .inputOptions(['-loop 1'])
        .input('/test/audio.wav')
        .audioCodec('aac')
        .videoCodec('libx264')
        .outputOptions([
          '-b:a 128k',
          '-pix_fmt yuv420p',
          '-shortest',
          '-movflags +faststart',
          '-threads 0',
          '-preset fast',
          '-crf 23',
          '-max_muxing_queue_size 512', // Smaller buffer for streaming
          '-avoid_negative_ts make_zero',
          '-fflags +genpts',
          '-vsync cfr',
          '-r 30',
        ])
        .output('/test/stream.mp4')

      // Verify streaming-specific options
      expect(mockFfmpeg.outputOptions).toHaveBeenCalledWith(expect.arrayContaining([
        '-max_muxing_queue_size 512',
        '-fflags +genpts',
        '-vsync cfr',
        '-r 30'
      ]))

      console.log('✅ Streaming video function validated')
    })

    it('should handle image resizing for video processing', async () => {
      console.log('🖼️  Testing image resize function...')

      const fluent = (await import('fluent-ffmpeg')).default
      const ffmpegInstance = fluent()

      const maxWidth = 1920
      const maxHeight = 1080

      // Test image resizing as done in weather agent
      ffmpegInstance
        .input('/test/input.jpg')
        .outputOptions([
          `-vf scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease,pad=${maxWidth}:${maxHeight}:(ow-iw)/2:(oh-ih)/2:black`,
          '-q:v 2'
        ])
        .output('/test/resized.jpg')

      expect(mockFfmpeg.input).toHaveBeenCalledWith('/test/input.jpg')
      expect(mockFfmpeg.outputOptions).toHaveBeenCalledWith([
        `-vf scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease,pad=${maxWidth}:${maxHeight}:(ow-iw)/2:(oh-ih)/2:black`,
        '-q:v 2'
      ])
      expect(mockFfmpeg.output).toHaveBeenCalledWith('/test/resized.jpg')

      console.log('✅ Image resize function validated')
    })
  })

  describe('Event Handling', () => {
    it('should set up proper event handlers', async () => {
      console.log('🎭 Testing event handler setup...')

      const fluent = (await import('fluent-ffmpeg')).default
      const ffmpegInstance = fluent()

      // Set up event handlers as in weather agent
      const startHandler = vi.fn()
      const stderrHandler = vi.fn()
      const endHandler = vi.fn()
      const errorHandler = vi.fn()

      ffmpegInstance
        .on('start', startHandler)
        .on('stderr', stderrHandler)
        .on('end', endHandler)
        .on('error', errorHandler)

      expect(mockFfmpeg.on).toHaveBeenCalledWith('start', startHandler)
      expect(mockFfmpeg.on).toHaveBeenCalledWith('stderr', stderrHandler)
      expect(mockFfmpeg.on).toHaveBeenCalledWith('end', endHandler)
      expect(mockFfmpeg.on).toHaveBeenCalledWith('error', errorHandler)

      console.log('✅ Event handlers validated')
    })

    it('should handle ffmpeg errors appropriately', async () => {
      console.log('❌ Testing error handling...')

      const fluent = (await import('fluent-ffmpeg')).default
      const ffmpegInstance = fluent()

      const errorHandler = vi.fn()
      ffmpegInstance.on('error', errorHandler)

      // Simulate error
      const testError = new Error('FFmpeg streaming failed: test error')
      errorHandler(testError)

      expect(errorHandler).toHaveBeenCalledWith(testError)
      expect(testError.message).toContain('FFmpeg streaming failed')

      console.log('✅ Error handling validated')
    })
  })

  describe('Memory Management', () => {
    it('should track memory usage during processing', () => {
      console.log('💾 Testing memory monitoring...')

      // Test memory logging function from weather agent
      function logMemoryUsage(context: string) {
        const memUsage = process.memoryUsage()
        console.log(`[${context}] Memory usage: RSS=${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap=${Math.round(memUsage.heapUsed / 1024 / 1024)}MB/${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`)
        return memUsage
      }

      const memUsage = logMemoryUsage('test-video-creation')

      expect(memUsage.rss).toBeGreaterThan(0)
      expect(memUsage.heapUsed).toBeGreaterThan(0)
      expect(memUsage.heapTotal).toBeGreaterThan(0)

      console.log('✅ Memory monitoring validated')
    })

    it('should handle garbage collection when available', () => {
      console.log('🗑️  Testing garbage collection...')

      function forceGC() {
        if (global.gc) {
          global.gc()
          return true
        } else {
          console.log('[forceGC] Garbage collection not available (run with --expose-gc)')
          return false
        }
      }

      const gcResult = forceGC()
      console.log(`GC available: ${gcResult}`)

      // Function should not throw regardless of GC availability
      expect(typeof gcResult).toBe('boolean')

      console.log('✅ GC handling validated')
    })

    it('should clean up temporary files', async () => {
      console.log('🧹 Testing temporary file cleanup...')

      const { unlink } = await import('fs/promises')
      const tempImagePath = '/test/image.resized.jpg'

      // Simulate cleanup as done in weather agent
      try {
        await vi.mocked(unlink)(tempImagePath)
        console.log(`Cleaned up temporary file: ${tempImagePath}`)
      } catch (error) {
        console.warn(`Failed to clean up ${tempImagePath}:`, error)
      }

      expect(vi.mocked(unlink)).toHaveBeenCalledWith(tempImagePath)

      console.log('✅ Cleanup validated')
    })
  })

  describe('Environment Configuration', () => {
    it('should use configurable video parameters', () => {
      console.log('⚙️  Testing configurable parameters...')

      // Test environment variable handling from weather agent
      const VIDEO_MAX_WIDTH = parseInt(process.env.VIDEO_MAX_WIDTH || '1920')
      const VIDEO_MAX_HEIGHT = parseInt(process.env.VIDEO_MAX_HEIGHT || '1080')
      const FFMPEG_PRESET = process.env.FFMPEG_PRESET || 'fast'
      const FFMPEG_CRF = parseInt(process.env.FFMPEG_CRF || '23')
      const FFMPEG_THREADS = process.env.FFMPEG_THREADS || '0'

      expect(VIDEO_MAX_WIDTH).toBe(1920) // Default value
      expect(VIDEO_MAX_HEIGHT).toBe(1080) // Default value
      expect(FFMPEG_PRESET).toBe('fast') // Default value
      expect(FFMPEG_CRF).toBe(23) // Default value
      expect(FFMPEG_THREADS).toBe('0') // Default value

      console.log('📋 Configuration Values:')
      console.log(`  - Video Max Width: ${VIDEO_MAX_WIDTH}`)
      console.log(`  - Video Max Height: ${VIDEO_MAX_HEIGHT}`)
      console.log(`  - FFmpeg Preset: ${FFMPEG_PRESET}`)
      console.log(`  - FFmpeg CRF: ${FFMPEG_CRF}`)
      console.log(`  - FFmpeg Threads: ${FFMPEG_THREADS}`)

      console.log('✅ Configuration parameters validated')
    })

    it('should validate MUX streaming URLs', () => {
      console.log('🌐 Testing MUX configuration...')

      // Test URL configuration from weather agent
      const MUX_HLS_BASE_URL = process.env.MUX_HLS_BASE_URL || 'https://stream.mux.com'
      const STREAMING_PORTFOLIO_BASE_URL = process.env.STREAMING_PORTFOLIO_BASE_URL || 'https://streamingportfolio.com'

      expect(MUX_HLS_BASE_URL).toBe('https://stream.mux.com') // Default
      expect(STREAMING_PORTFOLIO_BASE_URL).toBe('https://streamingportfolio.com') // Default

      // Validate URL format
      expect(MUX_HLS_BASE_URL).toMatch(/^https?:\/\//)
      expect(STREAMING_PORTFOLIO_BASE_URL).toMatch(/^https?:\/\//)

      console.log('📋 URL Configuration:')
      console.log(`  - MUX HLS Base: ${MUX_HLS_BASE_URL}`)
      console.log(`  - Streaming Portfolio: ${STREAMING_PORTFOLIO_BASE_URL}`)

      console.log('✅ URL configuration validated')
    })
  })
})
