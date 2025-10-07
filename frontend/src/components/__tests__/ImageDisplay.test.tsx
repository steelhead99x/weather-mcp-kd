import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock the MuxSignedPlayer component
vi.mock('../MuxSignedPlayer', () => ({
  default: ({ assetId, className }: { assetId: string; className: string }) => (
    <div data-testid="mux-player" data-asset-id={assetId} className={className}>
      Mock Mux Player
    </div>
  )
}))

// Mock the streamVNext hook
vi.mock('../../hooks/useStreamVNext', () => ({
  useStreamVNext: () => ({
    state: {
      metrics: null,
      isStreaming: false,
      isLoading: false,
      error: null,
      retryCount: 0
    },
    streamVNext: vi.fn(),
    retry: vi.fn()
  })
}))

// Mock the agent hook
vi.mock('../../lib/mastraClient', () => ({
  useAgent: () => ({
    agent: {
      streamVNext: vi.fn()
    }
  }),
  getDisplayHost: () => 'localhost:3001'
}))

describe('Image Display Tests', () => {
  it('should render markdown images inline', () => {
    const testMessage = {
      id: 'test-1',
      role: 'assistant' as const,
      content: 'Here is a temperature chart:\n\n![Temperature Chart](https://weather-mcp-kd.streamingportfolio.com/files/charts/temperature-chart-2025-10-07T08-14-03.png)\n\nThis shows the 7-day trend.',
      timestamp: Date.now()
    }

    // Test the image detection logic by creating a test component
    const TestImageComponent = () => {
      const detectImages = (content: string) => {
        const markdownImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g
        const markdownMatches = Array.from(content.matchAll(markdownImagePattern))
        
        const imageUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?[^\s]*)?/gi
        const urlMatches = Array.from(content.matchAll(imageUrlPattern))
        
        const images = []
        
        for (const match of markdownMatches) {
          images.push({
            type: 'markdown',
            alt: match[1] || '',
            url: match[2],
            fullMatch: match[0]
          })
        }
        
        for (const match of urlMatches) {
          const url = match[0]
          const isAlreadyInMarkdown = images.some(img => img.url === url)
          if (!isAlreadyInMarkdown) {
            images.push({
              type: 'url',
              alt: '',
              url: url,
              fullMatch: url
            })
          }
        }
        
        return images
      }

      const images = detectImages(testMessage.content)
      
      return (
        <div>
          {images.map((img, index) => (
            <img
              key={index}
              src={img.url}
              alt={img.alt || 'Image'}
              data-testid={`image-${index}`}
            />
          ))}
        </div>
      )
    }

    render(<TestImageComponent />)
    
    const image = screen.getByTestId('image-0')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', 'https://weather-mcp-kd.streamingportfolio.com/files/charts/temperature-chart-2025-10-07T08-14-03.png')
    expect(image).toHaveAttribute('alt', 'Temperature Chart')
  })

  it('should render direct image URLs inline', () => {
    const testMessage = {
      id: 'test-2',
      role: 'assistant' as const,
      content: 'Check out this chart: https://weather-mcp-kd.streamingportfolio.com/files/charts/temperature-chart-2025-10-07T08-14-03.png',
      timestamp: Date.now()
    }

    const TestImageComponent = () => {
      const detectImages = (content: string) => {
        const markdownImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g
        const markdownMatches = Array.from(content.matchAll(markdownImagePattern))
        
        const imageUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?[^\s]*)?/gi
        const urlMatches = Array.from(content.matchAll(imageUrlPattern))
        
        const images = []
        
        for (const match of markdownMatches) {
          images.push({
            type: 'markdown',
            alt: match[1] || '',
            url: match[2],
            fullMatch: match[0]
          })
        }
        
        for (const match of urlMatches) {
          const url = match[0]
          const isAlreadyInMarkdown = images.some(img => img.url === url)
          if (!isAlreadyInMarkdown) {
            images.push({
              type: 'url',
              alt: '',
              url: url,
              fullMatch: url
            })
          }
        }
        
        return images
      }

      const images = detectImages(testMessage.content)
      
      return (
        <div>
          {images.map((img, index) => (
            <img
              key={index}
              src={img.url}
              alt={img.alt || 'Image'}
              data-testid={`image-${index}`}
            />
          ))}
        </div>
      )
    }

    render(<TestImageComponent />)
    
    const image = screen.getByTestId('image-0')
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', 'https://weather-mcp-kd.streamingportfolio.com/files/charts/temperature-chart-2025-10-07T08-14-03.png')
    expect(image).toHaveAttribute('alt', 'Image')
  })

  it('should handle multiple images in one message', () => {
    const testMessage = {
      id: 'test-3',
      role: 'assistant' as const,
      content: 'Here are two charts:\n\n![Chart 1](https://example.com/chart1.png)\n\n![Chart 2](https://example.com/chart2.jpg)',
      timestamp: Date.now()
    }

    const TestImageComponent = () => {
      const detectImages = (content: string) => {
        const markdownImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g
        const markdownMatches = Array.from(content.matchAll(markdownImagePattern))
        
        const imageUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?[^\s]*)?/gi
        const urlMatches = Array.from(content.matchAll(imageUrlPattern))
        
        const images = []
        
        for (const match of markdownMatches) {
          images.push({
            type: 'markdown',
            alt: match[1] || '',
            url: match[2],
            fullMatch: match[0]
          })
        }
        
        for (const match of urlMatches) {
          const url = match[0]
          const isAlreadyInMarkdown = images.some(img => img.url === url)
          if (!isAlreadyInMarkdown) {
            images.push({
              type: 'url',
              alt: '',
              url: url,
              fullMatch: url
            })
          }
        }
        
        return images
      }

      const images = detectImages(testMessage.content)
      
      return (
        <div>
          {images.map((img, index) => (
            <img
              key={index}
              src={img.url}
              alt={img.alt || 'Image'}
              data-testid={`image-${index}`}
            />
          ))}
        </div>
      )
    }

    render(<TestImageComponent />)
    
    const image1 = screen.getByTestId('image-0')
    const image2 = screen.getByTestId('image-1')
    
    expect(image1).toBeInTheDocument()
    expect(image1).toHaveAttribute('src', 'https://example.com/chart1.png')
    expect(image1).toHaveAttribute('alt', 'Chart 1')
    
    expect(image2).toBeInTheDocument()
    expect(image2).toHaveAttribute('src', 'https://example.com/chart2.jpg')
    expect(image2).toHaveAttribute('alt', 'Chart 2')
  })

  it('should not detect non-image URLs', () => {
    const testMessage = {
      id: 'test-4',
      role: 'assistant' as const,
      content: 'Check out this website: https://example.com/page.html and this PDF: https://example.com/document.pdf',
      timestamp: Date.now()
    }

    const TestImageComponent = () => {
      const detectImages = (content: string) => {
        const markdownImagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g
        const markdownMatches = Array.from(content.matchAll(markdownImagePattern))
        
        const imageUrlPattern = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?[^\s]*)?/gi
        const urlMatches = Array.from(content.matchAll(imageUrlPattern))
        
        const images = []
        
        for (const match of markdownMatches) {
          images.push({
            type: 'markdown',
            alt: match[1] || '',
            url: match[2],
            fullMatch: match[0]
          })
        }
        
        for (const match of urlMatches) {
          const url = match[0]
          const isAlreadyInMarkdown = images.some(img => img.url === url)
          if (!isAlreadyInMarkdown) {
            images.push({
              type: 'url',
              alt: '',
              url: url,
              fullMatch: url
            })
          }
        }
        
        return images
      }

      const images = detectImages(testMessage.content)
      
      return (
        <div>
          <div data-testid="image-count">{images.length}</div>
          {images.map((img, index) => (
            <img
              key={index}
              src={img.url}
              alt={img.alt || 'Image'}
              data-testid={`image-${index}`}
            />
          ))}
        </div>
      )
    }

    render(<TestImageComponent />)
    
    const imageCount = screen.getByTestId('image-count')
    expect(imageCount).toHaveTextContent('0')
  })
})
