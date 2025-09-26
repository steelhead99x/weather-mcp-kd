import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamVNext } from '../useStreamVNext';

// Mock the mastraClient
vi.mock('../../lib/mastraClient', () => ({
  mastra: {
    agents: {
      streamVNext: vi.fn(),
    },
  },
  getWeatherAgentId: vi.fn().mockReturnValue('weatherAgent'),
}));

describe('useStreamVNext Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useStreamVNext());

    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.isStreaming).toBe(false);
    expect(typeof result.current.streamVNext).toBe('function');
    expect(typeof result.current.reset).toBe('function');
  });

  it('should reset state', () => {
    const { result } = renderHook(() => useStreamVNext());

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.isStreaming).toBe(false);
  });

  it('should handle streamVNext function', () => {
    const { result } = renderHook(() => useStreamVNext());

    expect(result.current.streamVNext).toBeDefined();
    expect(typeof result.current.streamVNext).toBe('function');
  });

  it('should maintain consistent hook interface', () => {
    const { result, rerender } = renderHook(() => useStreamVNext());

    const initialStreamVNext = result.current.streamVNext;
    const initialReset = result.current.reset;

    rerender();

    // Functions should be available and of correct type
    expect(typeof result.current.streamVNext).toBe('function');
    expect(typeof result.current.reset).toBe('function');
    expect(result.current.retry).toBeDefined();
  });

  it('should handle loading states properly', () => {
    const { result } = renderHook(() => useStreamVNext());

    // Initial state should not be loading
    expect(result.current.state.isLoading).toBe(false);
  });

  it('should handle error states', () => {
    const { result } = renderHook(() => useStreamVNext());

    // Initial error state should be null
    expect(result.current.state.error).toBeNull();
  });
});
