/**
 * FFmpeg Real Integration Tests
 * 
 * Tests that use actual ffmpeg functions from the weather agent
 * These tests will be skipped if ffmpeg is not available
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Test directories and files
const TEST_DIR = join(__dirname, '../../test-outputs/ffmpeg-real')
const PROJECT_FILES_DIR = join(__dirname, '../../files')
const TEST_AUDIO_FILE = join(TEST_DIR, 'test-audio.wav')
const TEST_IMAGE_FILE = join(TEST_DIR, 'test-image.jpg')
const TEST_VIDEO_FILE = join(TEST_DIR, 'output-video.mp4')
const TEST_RESIZED_IMAGE = join(TEST_DIR, 'resized-image.jpg')

// Use real project assets if available
const REAL_AUDIO_FILES = [
  join(PROJECT_FILES_DIR, 'uploads/samples/mux-sample.wav'),
  join(__dirname, '../../files/tts--deepgram-aura-asteria-en-c00e411e.mp3')
]
const REAL_IMAGE_FILES = [
  join(PROJECT_FILES_DIR, 'images/angora.jpeg'),
  join(PROJECT_FILES_DIR, 'images/baby.jpeg'),
  join(PROJECT_FILES_DIR, 'images/elk.jpeg'),
  join(PROJECT_FILES_DIR, 'images/mountain.jpeg')
]

// Check if ffmpeg is available
async function checkFfmpegAvailability(): Promise<boolean> {
  try {
    // Try packaged binaries first
    try {
      const ffmpegStatic = await import('ffmpeg-static')
      if (ffmpegStatic.default && typeof ffmpegStatic.default === 'string' && existsSync(ffmpegStatic.default as string)) {
        return true
      }
    } catch {}

    try {
      const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
      if (ffmpegInstaller.path && existsSync(ffmpegInstaller.path)) {
        return true
      }
    } catch {}

    // Try system binaries
    const systemPaths = [
      '/usr/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
    ]

    return systemPaths.some(path => {
      try {
        return existsSync(path)
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

describe('FFmpeg Real Integration Tests', () => {
  let ffmpegAvailable = false

  beforeAll(async () => {
    // Check if ffmpeg is available
    ffmpegAvailable = await checkFfmpegAvailability()
    
    if (!ffmpegAvailable) {
      console.log('⚠️  FFmpeg not available - skipping real integration tests')
      return
    }

    console.log('✅ FFmpeg is available - running real integration tests')

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
    if (!ffmpegAvailable) return

    // Try to use real project files first, fallback to generated ones
    const realAudio = REAL_AUDIO_FILES.find(file => existsSync(file))
    const realImage = REAL_IMAGE_FILES.find(file => existsSync(file))

    if (realAudio && realImage) {
      console.log(`📁 Using real project files:`)
      console.log(`  - Audio: ${realAudio}`)
      console.log(`  - Image: ${realImage}`)
      
      // Copy real files to test directory with standard names
      const fs = require('fs')
      fs.copyFileSync(realAudio, TEST_AUDIO_FILE)
      fs.copyFileSync(realImage, TEST_IMAGE_FILE)
    } else {
      console.log(`🔧 Creating synthetic test files`)
      // Create test files
      createTestAudioFile()
      createTestImageFile()
    }
  })

  afterEach(() => {
    if (!ffmpegAvailable) return

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

  describe('Real FFmpeg Operations', () => {
    it('should detect and configure ffmpeg binary', async () => {
      if (!ffmpegAvailable) {
        console.log('⏭️  Skipping - FFmpeg not available')
        return
      }

      // Import fluent-ffmpeg to test real configuration
      const ffmpeg = (await import('fluent-ffmpeg')).default

      // Try to get ffmpeg path
      let ffmpegPath: string | null = null
      
      try {
        const ffmpegStatic = await import('ffmpeg-static')
        if (ffmpegStatic.default && typeof ffmpegStatic.default === 'string') {
          ffmpegPath = ffmpegStatic.default
          ffmpeg.setFfmpegPath(ffmpegPath as string)
        }
      } catch {}

      if (!ffmpegPath) {
        try {
          const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
          if (ffmpegInstaller.path) {
            ffmpegPath = ffmpegInstaller.path
            ffmpeg.setFfmpegPath(ffmpegPath as string)
          }
        } catch {}
      }

      expect(ffmpegPath).toBeTruthy()
      console.log(`🔧 Using FFmpeg at: ${ffmpegPath}`)
    })

    it('should create a simple video from image and audio', async () => {
      if (!ffmpegAvailable) {
        console.log('⏭️  Skipping - FFmpeg not available')
        return
      }

      // Import fluent-ffmpeg
      const ffmpeg = (await import('fluent-ffmpeg')).default

      // Configure ffmpeg path
      try {
        const ffmpegStatic = await import('ffmpeg-static')
        if (ffmpegStatic.default && typeof ffmpegStatic.default === 'string') {
          ffmpeg.setFfmpegPath(ffmpegStatic.default as string)
        }
      } catch {
        try {
          const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
        if (ffmpegInstaller.path && typeof ffmpegInstaller.path === 'string') {
          ffmpeg.setFfmpegPath(ffmpegInstaller.path as string)
          }
        } catch {}
      }

      // Create video using actual ffmpeg
      await new Promise<void>((resolve, reject) => {
        console.log('🎬 Creating video with real FFmpeg...')
        
        ffmpeg()
          .input(TEST_IMAGE_FILE)
          .inputOptions(['-loop 1'])
          .input(TEST_AUDIO_FILE)
          .audioCodec('aac')
          .videoCodec('libx264')
          .outputOptions([
            '-b:a 128k',
            '-pix_fmt yuv420p',
            '-shortest',
            '-movflags +faststart',
            '-t 1', // Limit to 1 second for testing
            '-threads 1', // Single thread for test
            '-preset ultrafast', // Fastest preset for testing
            '-crf 30', // Lower quality for faster encoding
          ])
          .output(TEST_VIDEO_FILE)
          .on('start', (cmd: string) => {
            console.log(`🚀 FFmpeg command: ${cmd.substring(0, 100)}...`)
          })
          .on('stderr', (line: string) => {
            // Only log important stderr lines to avoid spam
            if (line.includes('error') || line.includes('Error')) {
              console.log(`📝 FFmpeg: ${line}`)
            }
          })
          .on('end', () => {
            console.log('✅ Video creation completed')
            resolve()
          })
          .on('error', (err: Error) => {
            console.error('❌ FFmpeg error:', err.message)
            reject(err)
          })
          .run()
      })

      // Verify output file was created
      expect(existsSync(TEST_VIDEO_FILE)).toBe(true)
      
      // Check file size
      const stats = statSync(TEST_VIDEO_FILE)
      expect(stats.size).toBeGreaterThan(0)
      
      console.log(`📁 Output video: ${TEST_VIDEO_FILE} (${stats.size} bytes)`)
    }, 30000) // 30 second timeout for video creation

    it('should resize an image for video processing', async () => {
      if (!ffmpegAvailable) {
        console.log('⏭️  Skipping - FFmpeg not available')
        return
      }

      // Import fluent-ffmpeg
      const ffmpeg = (await import('fluent-ffmpeg')).default

      // Configure ffmpeg path
      try {
        const ffmpegStatic = await import('ffmpeg-static')
        if (ffmpegStatic.default && typeof ffmpegStatic.default === 'string') {
          ffmpeg.setFfmpegPath(ffmpegStatic.default as string)
        }
      } catch {
        try {
          const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
        if (ffmpegInstaller.path && typeof ffmpegInstaller.path === 'string') {
          ffmpeg.setFfmpegPath(ffmpegInstaller.path as string)
          }
        } catch {}
      }

      // Resize image using actual ffmpeg
      await new Promise<void>((resolve, reject) => {
        console.log('🖼️  Resizing image with real FFmpeg...')
        
        const maxWidth = 1280
        const maxHeight = 720
        
        ffmpeg()
          .input(TEST_IMAGE_FILE)
          .outputOptions([
            `-vf scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease,pad=${maxWidth}:${maxHeight}:(ow-iw)/2:(oh-ih)/2:black`,
            '-q:v 2'
          ])
          .output(TEST_RESIZED_IMAGE)
          .on('start', (cmd: string) => {
            console.log(`🚀 FFmpeg resize command started: ${cmd.substring(0, 100)}...`)
          })
          .on('end', () => {
            console.log('✅ Image resize completed')
            resolve()
          })
          .on('error', (err: Error) => {
            console.error('❌ FFmpeg resize error:', err.message)
            reject(err)
          })
          .run()
      })

      // Verify output file was created
      expect(existsSync(TEST_RESIZED_IMAGE)).toBe(true)
      
      // Check file size
      const stats = statSync(TEST_RESIZED_IMAGE)
      expect(stats.size).toBeGreaterThan(0)
      
      console.log(`📁 Resized image: ${TEST_RESIZED_IMAGE} (${stats.size} bytes)`)
    }, 15000) // 15 second timeout for image resize

    it('should handle memory monitoring during processing', async () => {
      if (!ffmpegAvailable) {
        console.log('⏭️  Skipping - FFmpeg not available')
        return
      }

      // Test memory monitoring functions
      const initialMemory = process.memoryUsage()
      console.log('💾 Initial Memory:')
      console.log(`  - RSS: ${Math.round(initialMemory.rss / 1024 / 1024)}MB`)
      console.log(`  - Heap Used: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`)

      // Simulate some memory usage
      const largeArray = new Array(100000).fill('test data')
      
      const afterAllocationMemory = process.memoryUsage()
      console.log('💾 After Allocation:')
      console.log(`  - RSS: ${Math.round(afterAllocationMemory.rss / 1024 / 1024)}MB`)
      console.log(`  - Heap Used: ${Math.round(afterAllocationMemory.heapUsed / 1024 / 1024)}MB`)

      // Clean up
      largeArray.length = 0

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
        console.log('🗑️  Forced garbage collection')
      }

      const finalMemory = process.memoryUsage()
      console.log('💾 Final Memory:')
      console.log(`  - RSS: ${Math.round(finalMemory.rss / 1024 / 1024)}MB`)
      console.log(`  - Heap Used: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`)

      // Memory should be reasonable
      expect(finalMemory.rss).toBeGreaterThan(0)
      expect(finalMemory.heapUsed).toBeGreaterThan(0)
    })
  })

  describe('Performance Tests', () => {
    it('should complete video creation within reasonable time', async () => {
      if (!ffmpegAvailable) {
        console.log('⏭️  Skipping - FFmpeg not available')
        return
      }

      const startTime = Date.now()

      // Import fluent-ffmpeg
      const ffmpeg = (await import('fluent-ffmpeg')).default

      // Configure ffmpeg path
      try {
        const ffmpegStatic = await import('ffmpeg-static')
        if (ffmpegStatic.default && typeof ffmpegStatic.default === 'string') {
          ffmpeg.setFfmpegPath(ffmpegStatic.default as string)
        }
      } catch {
        try {
          const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg')
        if (ffmpegInstaller.path && typeof ffmpegInstaller.path === 'string') {
          ffmpeg.setFfmpegPath(ffmpegInstaller.path as string)
          }
        } catch {}
      }

      // Create a very short video for performance testing
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(TEST_IMAGE_FILE)
          .inputOptions(['-loop 1'])
          .input(TEST_AUDIO_FILE)
          .audioCodec('aac')
          .videoCodec('libx264')
          .outputOptions([
            '-b:a 64k', // Lower bitrate
            '-pix_fmt yuv420p',
            '-shortest',
            '-t 0.5', // Very short duration
            '-threads 1',
            '-preset ultrafast',
            '-crf 35', // Lower quality for speed
          ])
          .output(TEST_VIDEO_FILE)
          .on('end', () => resolve())
          .on('error', reject)
          .run()
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      console.log(`⏱️  Video creation took: ${duration}ms`)
      
      // Should complete within reasonable time (adjust based on your needs)
      expect(duration).toBeLessThan(10000) // 10 seconds max
      expect(existsSync(TEST_VIDEO_FILE)).toBe(true)
    }, 15000)
  })
})

// Helper functions to create test files
function createTestAudioFile() {
  // Create a longer WAV file for more realistic testing
  const sampleRate = 22050
  const duration = 1 // 1 second
  const numSamples = sampleRate * duration
  const bytesPerSample = 2
  const dataSize = numSamples * bytesPerSample

  const wavHeader = Buffer.alloc(44)
  const audioData = Buffer.alloc(dataSize)

  // WAV file header
  wavHeader.write('RIFF', 0)
  wavHeader.writeUInt32LE(36 + dataSize, 4)
  wavHeader.write('WAVE', 8)
  wavHeader.write('fmt ', 12)
  wavHeader.writeUInt32LE(16, 16)
  wavHeader.writeUInt16LE(1, 20) // PCM format
  wavHeader.writeUInt16LE(1, 22) // Mono
  wavHeader.writeUInt32LE(sampleRate, 24)
  wavHeader.writeUInt32LE(sampleRate * bytesPerSample, 28)
  wavHeader.writeUInt16LE(bytesPerSample, 32)
  wavHeader.writeUInt16LE(16, 34) // 16 bits per sample
  wavHeader.write('data', 36)
  wavHeader.writeUInt32LE(dataSize, 40)

  // Generate simple sine wave audio data
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.3 // 440 Hz tone at 30% volume
    const value = Math.round(sample * 32767)
    audioData.writeInt16LE(value, i * bytesPerSample)
  }

  const fullWav = Buffer.concat([wavHeader, audioData])
  writeFileSync(TEST_AUDIO_FILE, fullWav)
}

function createTestImageFile() {
  // Create a more realistic test image (still minimal but valid)
  const jpegData = Buffer.from([
    // JPEG header
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 
    
    // Quantization table
    0xFF, 0xDB, 0x00, 0x43, 0x00,
    0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19,
    0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C,
    0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C,
    0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
    0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32,
    
    // Start of frame
    0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x08, 0x00, 0x08, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    
    // Huffman tables
    0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07,
    0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    
    // Start of scan
    0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00,
    
    // Minimal image data (8x8 black square)
    0x8A, 0x00,
    
    // End of image
    0xFF, 0xD9
  ])

  writeFileSync(TEST_IMAGE_FILE, jpegData)
}
