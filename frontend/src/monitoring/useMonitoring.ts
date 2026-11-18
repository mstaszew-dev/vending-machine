import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from '../api'
import * as api from './api'
import type {
  MonitoringCapabilities,
  MonitoringEvent,
  MonitoringSummary,
  SeriesResponse,
} from './types'

/**
 * Owns the monitoring tab's data. The capability probe decides between the NestJS backend
 * (everything works) and the Java backend (no monitoring routes, the tab explains why).
 * When an event stream is available the tab is live; otherwise it polls every five seconds,
 * so the page never silently stops updating.
 */

const POLL_MS = 5_000
const EVENT_LIMIT = 50
const MAX_EVENTS = 200
const MAX_POINTS = 2_000

export type MonitoringStatus = 'probing' | 'unsupported' | 'error' | 'ready'

export interface MonitoringData {
  readonly capabilities: MonitoringCapabilities
  readonly summary: MonitoringSummary
  readonly temperature: SeriesResponse
  readonly coinRate: SeriesResponse
  readonly events: readonly MonitoringEvent[]
}

interface LoadedDocuments {
  readonly summary: MonitoringSummary
  readonly temperature: SeriesResponse
  readonly coinRate: SeriesResponse
  readonly events: MonitoringEvent[]
}

async function loadDocuments(): Promise<LoadedDocuments> {
  const [summary, temperature, coinRate, events] = await Promise.all([
    api.getSummary(),
    api.getSeries('temperature', '15m'),
    api.getSeries('coin_rate', '15m'),
    api.getEvents(EVENT_LIMIT),
  ])
  return { summary, temperature, coinRate, events: events.events }
}

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

/** SSE payloads are untrusted JSON, so each handler narrows what it needs. */
function readMessage(message: Event): unknown {
  const data = (message as MessageEvent).data
  if (typeof data !== 'string') {
    return null
  }
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

function cents(amount: number): number {
  return Math.round(amount * 100)
}

export function useMonitoring() {
  const [status, setStatus] = useState<MonitoringStatus>('probing')
  const [data, setData] = useState<MonitoringData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    const documents = await loadDocuments()
    if (!mounted.current) {
      return
    }
    setData((current) =>
      current === null ? current : { ...documents, capabilities: current.capabilities },
    )
  }, [])

  useEffect(() => {
    mounted.current = true
    let source: EventSource | null = null
    let polling: ReturnType<typeof setInterval> | null = null
    let disposed = false

    const startPolling = () => {
      if (polling !== null || disposed) {
        return
      }
      polling = setInterval(() => {
        refresh().catch(() => {
          // a failed poll keeps the last good document; the next tick retries
        })
      }, POLL_MS)
    }

    const stopPolling = () => {
      if (polling !== null) {
        clearInterval(polling)
        polling = null
      }
    }

    // A reconnect makes the fallback redundant; keeping both would race full refreshes
    // against the incremental stream updates below.
    const markLive = () => {
      setLive(true)
      stopPolling()
    }

    const applyVitals = (sample: {
      at: number
      temperatureC: number
      humidityPct: number
      setpointC: number
    }) => {
      setData((current) => {
        if (current === null) {
          return current
        }
        const point = { at: sample.at, value: sample.temperatureC }
        const points = [...current.temperature.points, point].slice(-MAX_POINTS)
        return {
          ...current,
          summary: {
            ...current.summary,
            temperature: {
              temperatureC: sample.temperatureC,
              setpointC: sample.setpointC,
              humidityPct: sample.humidityPct,
              at: new Date(sample.at).toISOString(),
            },
          },
          temperature: { ...current.temperature, points },
        }
      })
    }

    const applyEvent = (event: MonitoringEvent) => {
      setData((current) => {
        if (current === null) {
          return current
        }
        const inserted = event.type === 'coin_inserted'
        const value = inserted ? cents(event.value) : 0
        return {
          ...current,
          events: [event, ...current.events].slice(0, MAX_EVENTS),
          summary: inserted
            ? {
                ...current.summary,
                coins: {
                  ...current.summary.coins,
                  insertsLastMinute: current.summary.coins.insertsLastMinute + 1,
                  valueLastMinute:
                    (cents(current.summary.coins.valueLastMinute) + value) / 100,
                  hopperInserted:
                    (cents(current.summary.coins.hopperInserted) + value) / 100,
                },
              }
            : current.summary,
        }
      })
    }

    const connect = () => {
      if (typeof EventSource === 'undefined') {
        setLive(false)
        startPolling()
        return
      }
      const stream = new EventSource('/api/monitoring/stream')
      source = stream

      stream.addEventListener('open', markLive)
      stream.addEventListener('error', () => {
        // EventSource reconnects on its own; polling covers the gap meanwhile
        setLive(false)
        startPolling()
      })
      stream.addEventListener('vitals', (message) => {
        const payload = record(readMessage(message))
        if (
          payload === null ||
          typeof payload['at'] !== 'number' ||
          typeof payload['temperatureC'] !== 'number' ||
          typeof payload['humidityPct'] !== 'number' ||
          typeof payload['setpointC'] !== 'number'
        ) {
          return
        }
        markLive()
        applyVitals({
          at: payload['at'],
          temperatureC: payload['temperatureC'],
          humidityPct: payload['humidityPct'],
          setpointC: payload['setpointC'],
        })
      })
      stream.addEventListener('machine_event', (message) => {
        const payload = record(readMessage(message))
        if (
          payload === null ||
          typeof payload['at'] !== 'string' ||
          typeof payload['type'] !== 'string' ||
          typeof payload['value'] !== 'number' ||
          typeof payload['quantity'] !== 'number'
        ) {
          return
        }
        markLive()
        applyEvent({
          at: payload['at'],
          type: payload['type'],
          value: payload['value'],
          quantity: payload['quantity'],
          ...(typeof payload['code'] === 'string' ? { code: payload['code'] } : {}),
          ...(typeof payload['productId'] === 'string'
            ? { productId: payload['productId'] }
            : {}),
        })
      })
      stream.addEventListener('alert', (message) => {
        const payload = record(readMessage(message))
        if (
          payload === null ||
          typeof payload['code'] !== 'string' ||
          typeof payload['at'] !== 'number' ||
          typeof payload['message'] !== 'string'
        ) {
          return
        }
        markLive()
        setData((current) =>
          current === null
            ? current
            : {
                ...current,
                summary: {
                  ...current.summary,
                  alert: {
                    code: payload['code'] as string,
                    at: payload['at'] as number,
                    message: payload['message'] as string,
                    ...(typeof payload['temperatureC'] === 'number'
                      ? { temperatureC: payload['temperatureC'] }
                      : {}),
                  },
                },
              },
        )
      })
    }

    const boot = async () => {
      try {
        const capabilities = await api.probeCapabilities()
        if (disposed) {
          return
        }
        if (capabilities === null) {
          setStatus('unsupported')
          return
        }
        const documents = await loadDocuments()
        if (disposed) {
          return
        }
        setData({ ...documents, capabilities })
        setStatus('ready')
        connect()
      } catch (caught) {
        if (disposed) {
          return
        }
        setError(describeError(caught))
        setStatus('error')
      }
    }

    void boot()

    return () => {
      disposed = true
      mounted.current = false
      source?.close()
      stopPolling()
    }
  }, [refresh, attempt])

  /** A failed capability probe is retryable: run the whole boot again. */
  const retry = useCallback(() => {
    setStatus('probing')
    setError(null)
    setAttempt((current) => current + 1)
  }, [])

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true)
      setActionError(null)
      try {
        await action()
        await refresh()
      } catch (caught) {
        setActionError(describeError(caught))
      } finally {
        if (mounted.current) {
          setBusy(false)
        }
      }
    },
    [refresh],
  )

  const flood = useCallback(
    (count = 25) => run(() => api.simulateFlood(count)),
    [run],
  )
  const excursion = useCallback(
    (seconds = 30) => run(() => api.simulateExcursion(seconds)),
    [run],
  )

  return {
    status,
    data,
    error,
    actionError,
    busy,
    live,
    refresh,
    retry,
    flood,
    excursion,
  }
}
