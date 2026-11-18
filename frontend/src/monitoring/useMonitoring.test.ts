import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import * as api from './api'
import { useMonitoring } from './useMonitoring'
import type {
  MonitoringCapabilities,
  MonitoringSummary,
  SeriesResponse,
} from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    probeCapabilities: vi.fn(),
    getSummary: vi.fn(),
    getSeries: vi.fn(),
    getEvents: vi.fn(),
    simulateFlood: vi.fn(),
    simulateExcursion: vi.fn(),
  }
})

const TSDB = {
  reachable: true,
  bytes: 1_024,
  maxBytes: 67_108_864,
  level: 'ok' as const,
  queuedPoints: 0,
  droppedPoints: 0,
}

const CAPABILITIES: MonitoringCapabilities = {
  backend: 'nestjs',
  signals: ['temperature', 'coin_rate', 'events'],
  databases: { vitals: { retention: '1h' }, events: { retention: '7d' } },
  simulation: { enabled: true, intervalMs: 2_000 },
  tsdb: TSDB,
}

const SUMMARY: MonitoringSummary = {
  temperature: {
    temperatureC: 5.4,
    setpointC: 6,
    humidityPct: 41.2,
    at: '2026-11-18T10:00:00.000Z',
  },
  coins: {
    insertsLastMinute: 1,
    valueLastMinute: 0.5,
    hopperInserted: 0.5,
    hopperCapacity: 50,
  },
  machine: { credit: 0.5, totalRevenue: 0, unitsSold: 0 },
  alert: null,
  tsdb: TSDB,
  streamSubscribers: 1,
}

const TEMPERATURE: SeriesResponse = {
  signal: 'temperature',
  rangeSeconds: 900,
  points: [{ at: 1_700_000_000_000, value: 5.4 }],
}

const COINS: SeriesResponse = {
  signal: 'coin_rate',
  rangeSeconds: 900,
  points: [{ at: 1_700_000_000_000, value: 1 }],
}

function stubApi() {
  vi.mocked(api.probeCapabilities).mockResolvedValue(CAPABILITIES)
  vi.mocked(api.getSummary).mockResolvedValue(SUMMARY)
  vi.mocked(api.getSeries).mockImplementation(async (signal) =>
    signal === 'temperature' ? TEMPERATURE : COINS,
  )
  vi.mocked(api.getEvents).mockResolvedValue({ events: [] })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubApi()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMonitoring', () => {
  it('loads every document for the monitoring tab', async () => {
    const { result } = renderHook(() => useMonitoring())

    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.data?.summary.temperature?.temperatureC).toBe(5.4)
    expect(result.current.data?.temperature.points).toHaveLength(1)
    expect(api.getSeries).toHaveBeenCalledWith('temperature', '15m')
    expect(api.getSeries).toHaveBeenCalledWith('coin_rate', '15m')
  })

  it('reports an unsupported backend when the capability probe answers 404', async () => {
    vi.mocked(api.probeCapabilities).mockResolvedValue(null)

    const { result } = renderHook(() => useMonitoring())

    await waitFor(() => expect(result.current.status).toBe('unsupported'))
    expect(result.current.data).toBeNull()
    expect(api.getSummary).not.toHaveBeenCalled()
  })

  it('keeps a probe failure as an error state', async () => {
    vi.mocked(api.probeCapabilities).mockRejectedValue(
      new ApiError('database down', 503, 'TSDB_UNAVAILABLE'),
    )

    const { result } = renderHook(() => useMonitoring())

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('database down')
  })

  it('runs the coin flood demo with its default count and refreshes', async () => {
    vi.mocked(api.simulateFlood).mockResolvedValue({
      attempted: 25,
      accepted: 20,
      rejected: 5,
      code: 'COIN_RATE_EXCEEDED',
    })

    const { result } = renderHook(() => useMonitoring())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.flood()
    })

    expect(api.simulateFlood).toHaveBeenCalledWith(25)
    expect(api.getSummary).toHaveBeenCalledTimes(2)
  })

  it('runs the excursion demo with its default duration', async () => {
    vi.mocked(api.simulateExcursion).mockResolvedValue({
      seconds: 30,
      until: '2026-11-18T10:00:30.000Z',
    })

    const { result } = renderHook(() => useMonitoring())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.excursion()
    })

    expect(api.simulateExcursion).toHaveBeenCalledWith(30)
  })

  it('keeps a demo failure visible without dropping the tab', async () => {
    vi.mocked(api.simulateFlood).mockRejectedValue(
      new ApiError('The coin box is full', 409, 'HOPPER_FULL'),
    )

    const { result } = renderHook(() => useMonitoring())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.flood()
    })

    expect(result.current.actionError).toBe('The coin box is full')
    expect(result.current.status).toBe('ready')
    expect(result.current.busy).toBe(false)
  })

  it('marks the tab as polling when the browser has no EventSource', async () => {
    const { result } = renderHook(() => useMonitoring())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.live).toBe(false)
  })

  it('re-runs the capability probe when the operator retries', async () => {
    vi.mocked(api.probeCapabilities)
      .mockRejectedValueOnce(new ApiError('database down', 503, 'TSDB_UNAVAILABLE'))
      .mockResolvedValueOnce(CAPABILITIES)

    const { result } = renderHook(() => useMonitoring())
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.error).toBeNull()
  })
})

class FakeEventSource {
  static readonly instances: FakeEventSource[] = []
  readonly listeners = new Map<string, Set<(event: Event) => void>>()
  readonly url: string
  closed = false

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const bucket = this.listeners.get(type) ?? new Set()
    bucket.add(listener)
    this.listeners.set(type, bucket)
  }

  close(): void {
    this.closed = true
  }

  emit(type: string, data: unknown): void {
    const event = { data: JSON.stringify(data) } as MessageEvent
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }

  emitRaw(type: string, data: string): void {
    const event = { data } as MessageEvent
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

describe('useMonitoring over server-sent events', () => {
  beforeEach(() => {
    FakeEventSource.instances.length = 0
    vi.stubGlobal('EventSource', FakeEventSource)
  })

  it('applies temperature samples and machine events as they stream in', async () => {
    const { result } = renderHook(() => useMonitoring())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const source = FakeEventSource.instances[0]
    expect(source?.url).toBe('/api/monitoring/stream')

    act(() => source?.emit('open', {}))
    expect(result.current.live).toBe(true)

    act(() =>
      source?.emit('vitals', {
        at: 1_700_000_005_000,
        temperatureC: 4.2,
        humidityPct: 39,
        setpointC: 6,
      }),
    )
    expect(result.current.data?.summary.temperature?.temperatureC).toBe(4.2)
    expect(result.current.data?.temperature.points).toHaveLength(2)

    act(() =>
      source?.emit('machine_event', {
        at: '2026-11-18T10:00:05.000Z',
        type: 'coin_inserted',
        value: 0.5,
        quantity: 1,
      }),
    )
    expect(result.current.data?.events[0]?.type).toBe('coin_inserted')
    expect(result.current.data?.summary.coins.hopperInserted).toBe(1)
  })

  it('raises the alert from the stream', async () => {
    const { result } = renderHook(() => useMonitoring())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() =>
      FakeEventSource.instances[0]?.emit('alert', {
        code: 'TEMP_HIGH',
        at: 1_700_000_000_000,
        message: 'Too warm',
        temperatureC: 9.5,
      }),
    )

    expect(result.current.data?.summary.alert?.code).toBe('TEMP_HIGH')
    expect(result.current.data?.summary.alert?.temperatureC).toBe(9.5)
  })

  it('stops polling when the event stream reconnects', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMonitoring())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.status).toBe('ready')

      const source = FakeEventSource.instances[0]
      const beforeError = vi.mocked(api.getSummary).mock.calls.length

      act(() => source?.emit('error', {}))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      const whilePolling = vi.mocked(api.getSummary).mock.calls.length
      expect(whilePolling).toBeGreaterThan(beforeError)

      act(() => source?.emit('open', {}))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000)
      })
      expect(vi.mocked(api.getSummary).mock.calls.length).toBe(whilePolling)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores malformed stream payloads and falls back to polling on error', async () => {
    const { result, unmount } = renderHook(() => useMonitoring())
    await waitFor(() => expect(result.current.status).toBe('ready'))

    const source = FakeEventSource.instances[0]
    act(() => source?.emitRaw('vitals', 'not json'))
    act(() => source?.emit('vitals', { at: 1_700_000_000_000 }))
    expect(result.current.data?.temperature.points).toHaveLength(1)

    act(() => source?.emit('error', {}))
    expect(result.current.live).toBe(false)

    unmount()
    expect(source?.closed).toBe(true)
  })
})
