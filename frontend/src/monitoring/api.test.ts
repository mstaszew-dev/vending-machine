import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import {
  getEvents,
  getSeries,
  getSummary,
  probeCapabilities,
  simulateExcursion,
  simulateFlood,
} from './api'

const mockFetch = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const TSDB = {
  reachable: true,
  bytes: 1024,
  maxBytes: 67_108_864,
  level: 'ok',
  queuedPoints: 0,
  droppedPoints: 0,
}

const CAPABILITIES = {
  backend: 'nestjs',
  signals: ['temperature', 'coin_rate', 'events'],
  databases: { vitals: { retention: '1h' }, events: { retention: '7d' } },
  simulation: { enabled: true, intervalMs: 2_000 },
  tsdb: TSDB,
}

const SUMMARY = {
  temperature: null,
  coins: {
    insertsLastMinute: 0,
    valueLastMinute: 0,
    hopperInserted: 0,
    hopperCapacity: 50,
  },
  machine: { credit: 0, totalRevenue: 0, unitsSold: 0 },
  alert: null,
  tsdb: TSDB,
  streamSubscribers: 0,
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('monitoring API client', () => {
  it('probes the capability document', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(CAPABILITIES))

    await expect(probeCapabilities()).resolves.toMatchObject({ backend: 'nestjs' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monitoring/capabilities',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    )
  })

  it('returns null when the backend has no monitoring endpoints', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }))

    await expect(probeCapabilities()).resolves.toBeNull()
  })

  it('keeps a non-404 probe failure as a problem', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: 'database down', code: 'TSDB_UNAVAILABLE' }, 503),
    )

    await expect(probeCapabilities()).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'TSDB_UNAVAILABLE',
      message: 'database down',
    })
  })

  it('loads the monitoring summary', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(SUMMARY))

    await expect(getSummary()).resolves.toMatchObject({
      coins: { hopperCapacity: 50 },
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monitoring/summary',
      expect.any(Object),
    )
  })

  it('builds the series query with the requested range', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ signal: 'temperature', rangeSeconds: 900, points: [] }),
    )

    await getSeries('temperature', '15m')

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monitoring/series?signal=temperature&range=15m',
      expect.any(Object),
    )
  })

  it('loads recent events with a limit', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ events: [] }))

    await getEvents(25)

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monitoring/events?limit=25',
      expect.any(Object),
    )
  })

  it('posts the flood count and parses the outcome', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ attempted: 25, accepted: 20, rejected: 5, code: 'COIN_RATE_EXCEEDED' }),
    )

    await expect(simulateFlood(25)).resolves.toMatchObject({
      accepted: 20,
      code: 'COIN_RATE_EXCEEDED',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monitoring/simulate/flood',
      expect.objectContaining({ method: 'POST', body: '{"count":25}' }),
    )
  })

  it('posts the excursion duration', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ seconds: 30, until: '2026-11-18T10:00:30.000Z' }),
    )

    await expect(simulateExcursion(30)).resolves.toEqual({
      seconds: 30,
      until: '2026-11-18T10:00:30.000Z',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/monitoring/simulate/excursion',
      expect.objectContaining({ method: 'POST', body: '{"seconds":30}' }),
    )
  })

  it('converts an invalid successful response into an ApiError', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ backend: 'nestjs' }))

    await expect(probeCapabilities()).rejects.toMatchObject({
      name: 'ApiError',
      message: expect.stringContaining('Unexpected response from the backend:'),
    })
  })

  it('reports the HTTP status when an error body is not JSON', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 502 }))

    await expect(getSummary()).rejects.toBeInstanceOf(ApiError)
  })

  it('turns a hung request into a 504 after the timeout', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('The operation timed out', 'TimeoutError'),
    )

    await expect(getSummary()).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining('did not answer'),
    })
  })
})
