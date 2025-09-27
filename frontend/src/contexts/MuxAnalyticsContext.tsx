import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface MuxAnalyticsData {
  assetId: string
  playbackId: string
  videoDuration?: number
  currentTime?: number
  playbackRate?: number
  volume?: number
  quality?: string
  bufferingEvents: number
  seekingEvents: number
  playEvents: number
  pauseEvents: number
  errorEvents: number
  loadTime?: number
  firstFrameTime?: number
  lastEventTime?: Date
  totalWatchTime: number
  completionRate: number
}

export interface MuxAnalyticsContextType {
  analyticsData: Map<string, MuxAnalyticsData>
  updateAnalytics: (assetId: string, data: Partial<MuxAnalyticsData>) => void
  getAnalyticsForAsset: (assetId: string) => MuxAnalyticsData | undefined
  getAllAnalytics: () => MuxAnalyticsData[]
  resetAnalytics: (assetId?: string) => void
}

const MuxAnalyticsContext = createContext<MuxAnalyticsContextType | undefined>(undefined)

export function MuxAnalyticsProvider({ children }: { children: ReactNode }) {
  const [analyticsData, setAnalyticsData] = useState<Map<string, MuxAnalyticsData>>(new Map())

  const updateAnalytics = useCallback((assetId: string, data: Partial<MuxAnalyticsData>) => {
    setAnalyticsData(prev => {
      const newMap = new Map(prev)
      const existing = newMap.get(assetId) || {
        assetId,
        playbackId: '',
        bufferingEvents: 0,
        seekingEvents: 0,
        playEvents: 0,
        pauseEvents: 0,
        errorEvents: 0,
        totalWatchTime: 0,
        completionRate: 0
      }
      
      // Handle incremental updates for counters
      const updatedData = { ...existing }
      
      if (data.playEvents !== undefined) {
        updatedData.playEvents = existing.playEvents + data.playEvents
      }
      if (data.pauseEvents !== undefined) {
        updatedData.pauseEvents = existing.pauseEvents + data.pauseEvents
      }
      if (data.seekingEvents !== undefined) {
        updatedData.seekingEvents = existing.seekingEvents + data.seekingEvents
      }
      if (data.bufferingEvents !== undefined) {
        updatedData.bufferingEvents = existing.bufferingEvents + data.bufferingEvents
      }
      if (data.errorEvents !== undefined) {
        updatedData.errorEvents = existing.errorEvents + data.errorEvents
      }
      
      // Handle direct updates for other fields
      Object.keys(data).forEach(key => {
        if (!['playEvents', 'pauseEvents', 'seekingEvents', 'bufferingEvents', 'errorEvents'].includes(key)) {
          (updatedData as any)[key] = (data as any)[key]
        }
      })
      
      // Calculate completion rate
      if (updatedData.videoDuration && updatedData.totalWatchTime) {
        updatedData.completionRate = Math.min((updatedData.totalWatchTime / updatedData.videoDuration) * 100, 100)
      }
      
      newMap.set(assetId, {
        ...updatedData,
        lastEventTime: new Date()
      })
      
      return newMap
    })
  }, [])

  const getAnalyticsForAsset = useCallback((assetId: string) => {
    return analyticsData.get(assetId)
  }, [analyticsData])

  const getAllAnalytics = useCallback(() => {
    return Array.from(analyticsData.values())
  }, [analyticsData])

  const resetAnalytics = useCallback((assetId?: string) => {
    if (assetId) {
      setAnalyticsData(prev => {
        const newMap = new Map(prev)
        newMap.delete(assetId)
        return newMap
      })
    } else {
      setAnalyticsData(new Map())
    }
  }, [])

  return (
    <MuxAnalyticsContext.Provider value={{
      analyticsData,
      updateAnalytics,
      getAnalyticsForAsset,
      getAllAnalytics,
      resetAnalytics
    }}>
      {children}
    </MuxAnalyticsContext.Provider>
  )
}

export function useMuxAnalytics() {
  const context = useContext(MuxAnalyticsContext)
  if (context === undefined) {
    throw new Error('useMuxAnalytics must be used within a MuxAnalyticsProvider')
  }
  return context
}
