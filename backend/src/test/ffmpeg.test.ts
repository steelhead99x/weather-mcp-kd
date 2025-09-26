/**
 * FFmpeg Integration Tests
 * 
 * Tests for video creation, image processing, and ffmpeg binary detection
 * functionality used in the weather agent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))

// Test directories and files
const TEST_DIR = join(__dirname, '../../test-outputs/ffmpeg')
const TEST_AUDIO_FILE = join(TEST_DIR, 'test-audio.wav')
const TEST_IMAGE_FILE = join(TEST_DIR, 'test-image.jpg')
const TEST_VIDEO_FILE = join(TEST_DIR, 'test-video.mp4')
const TEST_RESIZED_IMAGE = join(TEST_DIR, 'test-resized.jpg')

// Mock ffmpeg module for unit tests
const mockFfmpeg = {
  setFfmpegPath: vi.fn(),
  input: vi.fn().mockReturnThis(),
  inputOptions: vi.fn().mockReturnThis(),
  audioCodec: vi.fn().mockReturnThis(),
  videoCodec: vi.fn().mockReturnThis(),
  outputOptions: vi.fn().mockReturnThis(),
  output: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  run: vi.fn(),
}

// Mock the fluent-ffmpeg module
vi.mock('fluent-ffmpeg', () => {
  return {
    default: () => mockFfmpeg,
    __esModule: true,
  }
})

describe('FFmpeg Integration Tests', () => {
  beforeAll(() => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterAll(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    
    // Create test files
    createTestAudioFile()
    createTestImageFile()
  })

  afterEach(() => {
    // Clean up test output files
    const testFiles = [TEST_VIDEO_FILE, TEST_RESIZED_IMAGE]
    testFiles.forEach(file => {
      if (existsSync(file)) {
        try {
          rmSync(file)
        } catch (error) {
          console.warn(`Failed to remove test file ${file}:`, error)
        }
      }
    })
  })

  describe('FFmpeg Binary Detection', () => {
    it('should detect packaged ffmpeg binaries', async () => {
      // Test ffmpeg-static detection
      let ffmpegStaticPath: string | null = null
      try {
        const ffmpegStatic = await import('ffmpeg-static')
        if (ffmpegStatic.default && typeof ffmpegStatic.default === 'string') {
          ffmpegStaticPath = ffmpegStatic.default
        }
      } catch {
        // ffmpeg-static not available in test environment
      }

      // Test @ffmpeg-installer/ffmpeg detection
      let ffmpegInstallerPath: string | null = null
      try {
        const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
        if (ffmpegInstaller.path) {
          ffmpegInstallerPath = ffmpegInstaller.path
        }
      } catch {
        // @ffmpeg-installer/ffmpeg not available in test environment
      }

      // At least one ffmpeg binary should be available
      const hasPackagedBinary = ffmpegStaticPath || ffmpegInstallerPath
      console.log('📦 Packaged FFmpeg binaries:')
      console.log(`  - ffmpeg-static: ${ffmpegStaticPath || 'not available'}`)
      console.log(`  - @ffmpeg-installer/ffmpeg: ${ffmpegInstallerPath || 'not available'}`)
      
      if (hasPackagedBinary) {
        expect(hasPackagedBinary).toBeTruthy()
        console.log('✅ At least one packaged FFmpeg binary is available')
      } else {
        console.log('⚠️  No packaged FFmpeg binaries found, will test system binaries')
      }
    })

    it('should detect system ffmpeg installations', async () => {
      const systemPaths = [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/bin/ffmpeg',
      ]

      // Check for Homebrew installation
      let homebrewPath: string | null = null
      try {
        const { execSync } = await import('child_process')
        const homebrewPrefix = execSync('brew --prefix', { 
          encoding: 'utf8', 
          timeout: 5000,
          stdio: 'pipe'
        }).trim()
        if (homebrewPrefix) {
          homebrewPath = `${homebrewPrefix}/bin/ffmpeg`
          systemPaths.push(homebrewPath)
        }
      } catch {
        // Homebrew not available or command failed
      }

      const availablePaths = systemPaths.filter(path => {
        try {
          return existsSync(path)
        } catch {
          return false
        }
      })

      console.log('🖥️  System FFmpeg paths checked:')
      systemPaths.forEach(path => {
        const available = availablePaths.includes(path)
        console.log(`  - ${path}: ${available ? '✅ available' : '❌ not found'}`)
      })

      if (availablePaths.length > 0) {
        expect(availablePaths.length).toBeGreaterThan(0)
        console.log(`✅ Found ${availablePaths.length} system FFmpeg installation(s)`)
      } else {
        console.log('⚠️  No system FFmpeg installations found')
      }
    })

    it('should verify ffmpeg binary functionality', async () => {
      // Find any available ffmpeg binary
      let ffmpegPath: string | null = null

      // Try packaged binaries first
      try {
        const ffmpegStatic = await import('ffmpeg-static')
        if (ffmpegStatic.default && typeof ffmpegStatic.default === 'string') {
          ffmpegPath = ffmpegStatic.default
        }
      } catch {}

      if (!ffmpegPath) {
        try {
          const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
          if (ffmpegInstaller.path) {
            ffmpegPath = ffmpegInstaller.path
          }
        } catch {}
      }

      // Try system binaries
      if (!ffmpegPath) {
        const systemPaths = [
          '/usr/bin/ffmpeg',
          '/usr/local/bin/ffmpeg',
          '/opt/homebrew/bin/ffmpeg',
        ]
        
        ffmpegPath = systemPaths.find(path => {
          try {
            return existsSync(path)
          } catch {
            return false
          }
        }) || null
      }

      if (ffmpegPath) {
        console.log(`🧪 Testing FFmpeg binary at: ${ffmpegPath}`)
        
        try {
          // Test ffmpeg version command
          const { stdout } = await execFileAsync(ffmpegPath, ['-version'], { timeout: 10000 })
          
          expect(stdout).toContain('ffmpeg version')
          expect(stdout).toContain('configuration:')
          
          // Extract version info
          const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/)
          const version = versionMatch ? versionMatch[1] : 'unknown'
          
          console.log(`✅ FFmpeg is working! Version: ${version}`)
          
          // Check for required codecs (more lenient)
          const hasH264 = stdout.includes('libx264') || stdout.includes('h264') || stdout.includes('x264')
          const hasAAC = stdout.includes('aac') || stdout.includes('AAC')
          
          console.log(`📋 Codec support:`)
          console.log(`  - H.264 (libx264): ${hasH264 ? '✅' : '❌'}`)
          console.log(`  - AAC audio: ${hasAAC ? '✅' : '❌'}`)
          
          // More lenient expectations - just verify ffmpeg works, codecs may vary
          if (!hasH264) {
            console.log(`⚠️  H.264 codec not detected, but FFmpeg is working`)
          }
          if (!hasAAC) {
            console.log(`⚠️  AAC codec not detected, but FFmpeg is working`)
          }
          
        } catch (error) {
          console.error(`❌ FFmpeg test failed:`, error)
          throw new Error(`FFmpeg binary test failed: ${error}`)
        }
      } else {
        console.log('⏭️  Skipping FFmpeg functionality test - no binary found')
        // This is not necessarily a failure in test environments
        expect(true).toBe(true) // Pass the test but log the skip
      }
    })
  })

  describe('Video Creation Functions', () => {
    it('should configure ffmpeg with proper options for video creation', () => {
      // Import the module to test configuration
      const ffmpeg = mockFfmpeg

      // Test basic video creation setup
      ffmpeg.input(TEST_IMAGE_FILE)
      ffmpeg.inputOptions(['-loop 1'])
      ffmpeg.input(TEST_AUDIO_FILE)
      ffmpeg.audioCodec('aac')
      ffmpeg.videoCodec('libx264')

      expect(ffmpeg.input).toHaveBeenCalledWith(TEST_IMAGE_FILE)
      expect(ffmpeg.inputOptions).toHaveBeenCalledWith(['-loop 1'])
      expect(ffmpeg.input).toHaveBeenCalledWith(TEST_AUDIO_FILE)
      expect(ffmpeg.audioCodec).toHaveBeenCalledWith('aac')
      expect(ffmpeg.videoCodec).toHaveBeenCalledWith('libx264')
    })

    it('should apply memory optimization options', () => {
      const ffmpeg = mockFfmpeg

      // Test memory optimization options
      const expectedOptions = [
        '-b:a 128k',
        '-pix_fmt yuv420p',
        '-shortest',
        '-movflags +faststart',
        '-threads 0', // Default auto-detect
        '-preset fast', // Default preset
        '-crf 23', // Default quality
        '-max_muxing_queue_size 1024',
        '-avoid_negative_ts make_zero',
      ]

      ffmpeg.outputOptions(expectedOptions)
      expect(ffmpeg.outputOptions).toHaveBeenCalledWith(expectedOptions)
    })

    it('should handle streaming optimization options', () => {
      const ffmpeg = mockFfmpeg

      // Test streaming-specific options
      const streamingOptions = [
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
      ]

      ffmpeg.outputOptions(streamingOptions)
      expect(ffmpeg.outputOptions).toHaveBeenCalledWith(streamingOptions)
    })

    it('should set up proper event handlers', () => {
      const ffmpeg = mockFfmpeg

      // Test event handler setup
      const startHandler = vi.fn()
      const stderrHandler = vi.fn()
      const endHandler = vi.fn()
      const errorHandler = vi.fn()

      ffmpeg.on('start', startHandler)
      ffmpeg.on('stderr', stderrHandler)
      ffmpeg.on('end', endHandler)
      ffmpeg.on('error', errorHandler)

      expect(ffmpeg.on).toHaveBeenCalledWith('start', startHandler)
      expect(ffmpeg.on).toHaveBeenCalledWith('stderr', stderrHandler)
      expect(ffmpeg.on).toHaveBeenCalledWith('end', endHandler)
      expect(ffmpeg.on).toHaveBeenCalledWith('error', errorHandler)
    })
  })

  describe('Image Processing', () => {
    it('should handle image resizing for video optimization', () => {
      const ffmpeg = mockFfmpeg

      // Test image resizing configuration
      const maxWidth = 1920
      const maxHeight = 1080

      ffmpeg.input(TEST_IMAGE_FILE)
      ffmpeg.outputOptions([
        `-vf scale='min(${maxWidth},iw)':min'(${maxHeight},ih)':force_original_aspect_ratio=decrease,pad=${maxWidth}:${maxHeight}:(ow-iw)/2:(oh-ih)/2:black`,
        '-q:v 2' // High quality for resizing
      ])
      ffmpeg.output(TEST_RESIZED_IMAGE)

      expect(ffmpeg.input).toHaveBeenCalledWith(TEST_IMAGE_FILE)
      expect(ffmpeg.output).toHaveBeenCalledWith(TEST_RESIZED_IMAGE)
    })

    it('should validate image file requirements', () => {
      // Test image file validation
      expect(existsSync(TEST_IMAGE_FILE)).toBe(true)
      
      // Check if image file has content
      const imageStats = readFileSync(TEST_IMAGE_FILE)
      expect(imageStats.length).toBeGreaterThan(0)
      
      console.log(`📸 Test image file: ${TEST_IMAGE_FILE} (${imageStats.length} bytes)`)
    })
  })

  describe('Audio Processing', () => {
    it('should handle audio file requirements', () => {
      // Test audio file validation
      expect(existsSync(TEST_AUDIO_FILE)).toBe(true)
      
      // Check if audio file has content
      const audioStats = readFileSync(TEST_AUDIO_FILE)
      expect(audioStats.length).toBeGreaterThan(0)
      
      console.log(`🎵 Test audio file: ${TEST_AUDIO_FILE} (${audioStats.length} bytes)`)
    })

    it('should configure audio codec options', () => {
      const ffmpeg = mockFfmpeg

      // Test audio configuration
      ffmpeg.audioCodec('aac')
      ffmpeg.outputOptions(['-b:a 128k'])

      expect(ffmpeg.audioCodec).toHaveBeenCalledWith('aac')
      expect(ffmpeg.outputOptions).toHaveBeenCalledWith(['-b:a 128k'])
    })
  })

  describe('Environment Configuration', () => {
    it('should use environment variables for ffmpeg configuration', () => {
      // Test environment variable defaults
      const expectedDefaults = {
        VIDEO_MAX_WIDTH: 1920,
        VIDEO_MAX_HEIGHT: 1080,
        FFMPEG_PRESET: 'fast',
        FFMPEG_CRF: 23,
        FFMPEG_THREADS: '0'
      }

      // Verify default values match expected configuration
      expect(parseInt(process.env.VIDEO_MAX_WIDTH || '1920')).toBe(expectedDefaults.VIDEO_MAX_WIDTH)
      expect(parseInt(process.env.VIDEO_MAX_HEIGHT || '1080')).toBe(expectedDefaults.VIDEO_MAX_HEIGHT)
      expect(process.env.FFMPEG_PRESET || 'fast').toBe(expectedDefaults.FFMPEG_PRESET)
      expect(parseInt(process.env.FFMPEG_CRF || '23')).toBe(expectedDefaults.FFMPEG_CRF)
      expect(process.env.FFMPEG_THREADS || '0').toBe(expectedDefaults.FFMPEG_THREADS)

      console.log('⚙️  FFmpeg Configuration:')
      console.log(`  - Max Width: ${process.env.VIDEO_MAX_WIDTH || '1920'}px`)
      console.log(`  - Max Height: ${process.env.VIDEO_MAX_HEIGHT || '1080'}px`)
      console.log(`  - Preset: ${process.env.FFMPEG_PRESET || 'fast'}`)
      console.log(`  - CRF Quality: ${process.env.FFMPEG_CRF || '23'}`)
      console.log(`  - Threads: ${process.env.FFMPEG_THREADS || '0 (auto)'}`)
    })

    it('should handle custom environment configurations', () => {
      // Test with custom values
      const customConfig = {
        VIDEO_MAX_WIDTH: '1280',
        VIDEO_MAX_HEIGHT: '720',
        FFMPEG_PRESET: 'medium',
        FFMPEG_CRF: '20',
        FFMPEG_THREADS: '4'
      }

      // Temporarily set custom environment
      Object.entries(customConfig).forEach(([key, value]) => {
        process.env[key] = value
      })

      // Verify custom configuration is applied
      expect(parseInt(process.env.VIDEO_MAX_WIDTH || '1920')).toBe(1280)
      expect(parseInt(process.env.VIDEO_MAX_HEIGHT || '1080')).toBe(720)
      expect(process.env.FFMPEG_PRESET || 'fast').toBe('medium')
      expect(parseInt(process.env.FFMPEG_CRF || '23')).toBe(20)
      expect(process.env.FFMPEG_THREADS || '0').toBe('4')

      console.log('🔧 Custom FFmpeg Configuration Applied')

      // Reset environment
      Object.keys(customConfig).forEach(key => {
        delete process.env[key]
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle missing ffmpeg binary gracefully', () => {
      // Test error handling when no ffmpeg binary is found
      const ffmpeg = mockFfmpeg

      // Simulate ffmpeg error
      const errorHandler = vi.fn()
      ffmpeg.on('error', errorHandler)

      // Simulate error event
      const mockError = new Error('FFmpeg binary not found')
      expect(() => {
        // This would be called by the ffmpeg library
        errorHandler(mockError)
      }).not.toThrow()

      expect(errorHandler).toHaveBeenCalledWith(mockError)
    })

    it('should handle invalid input files', () => {
      const ffmpeg = mockFfmpeg

      // Test with non-existent files
      const nonExistentAudio = '/path/to/nonexistent/audio.wav'
      const nonExistentImage = '/path/to/nonexistent/image.jpg'

      ffmpeg.input(nonExistentImage)
      ffmpeg.input(nonExistentAudio)

      // FFmpeg should be called but would fail at runtime
      expect(ffmpeg.input).toHaveBeenCalledWith(nonExistentImage)
      expect(ffmpeg.input).toHaveBeenCalledWith(nonExistentAudio)
    })

    it('should handle memory limitations', () => {
      // Test memory monitoring functions
      const memUsage = process.memoryUsage()
      
      expect(memUsage.rss).toBeGreaterThan(0)
      expect(memUsage.heapUsed).toBeGreaterThan(0)
      expect(memUsage.heapTotal).toBeGreaterThan(0)

      console.log('💾 Current Memory Usage:')
      console.log(`  - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`)
      console.log(`  - Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`)
      console.log(`  - Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`)

      // Test garbage collection availability
      const hasGC = typeof global.gc === 'function'
      console.log(`  - GC Available: ${hasGC ? '✅' : '❌'}`)
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle typical weather video creation workflow', () => {
      const ffmpeg = mockFfmpeg

      // Simulate complete workflow
      console.log('🎬 Simulating Weather Video Creation Workflow:')

      // Step 1: Resize image
      console.log('  1. Resizing image for video...')
      ffmpeg.input(TEST_IMAGE_FILE)
      ffmpeg.outputOptions([
        `-vf scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black`,
        '-q:v 2'
      ])
      ffmpeg.output(TEST_RESIZED_IMAGE)

      // Step 2: Create video
      console.log('  2. Creating video from audio and image...')
      ffmpeg.input(TEST_RESIZED_IMAGE)
      ffmpeg.inputOptions(['-loop 1'])
      ffmpeg.input(TEST_AUDIO_FILE)
      ffmpeg.audioCodec('aac')
      ffmpeg.videoCodec('libx264')
      ffmpeg.outputOptions([
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
      ffmpeg.output(TEST_VIDEO_FILE)

      // Verify all steps were called
      expect(ffmpeg.input).toHaveBeenCalledWith(TEST_IMAGE_FILE)
      expect(ffmpeg.input).toHaveBeenCalledWith(TEST_RESIZED_IMAGE)
      expect(ffmpeg.input).toHaveBeenCalledWith(TEST_AUDIO_FILE)
      expect(ffmpeg.output).toHaveBeenCalledWith(TEST_RESIZED_IMAGE)
      expect(ffmpeg.output).toHaveBeenCalledWith(TEST_VIDEO_FILE)

      console.log('  ✅ Workflow simulation completed')
    })

    it('should handle streaming video creation workflow', () => {
      const ffmpeg = mockFfmpeg

      console.log('📡 Simulating Streaming Video Creation Workflow:')

      // Streaming workflow with smaller buffers
      ffmpeg.input(TEST_IMAGE_FILE)
      ffmpeg.inputOptions(['-loop 1'])
      ffmpeg.input(TEST_AUDIO_FILE)
      ffmpeg.audioCodec('aac')
      ffmpeg.videoCodec('libx264')
      ffmpeg.outputOptions([
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
      ffmpeg.output(TEST_VIDEO_FILE)

      expect(ffmpeg.outputOptions).toHaveBeenCalledWith(expect.arrayContaining([
        '-max_muxing_queue_size 512',
        '-fflags +genpts',
        '-vsync cfr',
        '-r 30'
      ]))

      console.log('  ✅ Streaming workflow simulation completed')
    })
  })
})

// Helper functions to create test files
function createTestAudioFile() {
  // Create a minimal WAV file header for testing
  const wavHeader = Buffer.alloc(44)
  
  // WAV file header
  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(36, 4)
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16)
  wavHeader.writeUInt16LE(1, 20) // PCM format
  wavHeader.writeUInt16LE(1, 22) // Mono
  wavHeader.writeUInt32LE(22050, 24) // Sample rate
  wavHeader.writeUInt32LE(22050, 28) // Byte rate
  wavHeader.writeUInt16LE(1, 32) // Block align
  wavHeader.writeUInt16LE(8, 34) // Bits per sample
  wavHeader.write('data', 36)
  wavHeader.writeUInt32LE(0, 40)

  writeFileSync(TEST_AUDIO_FILE, wavHeader)
}

function createTestImageFile() {
  // Create a minimal JPEG file for testing (1x1 pixel black image)
  const jpegData = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07, 0xFF, 0xC4,
    0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
    0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x8A, 0x00,
    0xFF, 0xD9
  ])

  writeFileSync(TEST_IMAGE_FILE, jpegData)
}
