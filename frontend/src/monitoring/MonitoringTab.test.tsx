import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import * as api from './api'
import { MonitoringTab } from './MonitoringTab'
import type { MonitoringCapabilities, MonitoringSummary, SeriesResponse } from './types'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    probeCapabilities: vi.fn(),
    getSummary: vi.fn(),
    getSeries: vi.fn(),
    getEvents: vi.fn(),
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

const SERIES: SeriesResponse = {
  signal: 'temperature',
  rangeSeconds: 900,
  points: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.probeCapabilities).mockResolvedValue(CAPABILITIES)
  vi.mocked(api.getSummary).mockResolvedValue(SUMMARY)
  vi.mocked(api.getSeries).mockResolvedValue(SERIES)
  vi.mocked(api.getEvents).mockResolvedValue({ events: [] })
})

describe('MonitoringTab', () => {
  it('explains the missing routes on the Java backend', async () => {
    vi.mocked(api.probeCapabilities).mockResolvedValue(null)

    render(<MonitoringTab />)

    expect(
      await screen.findByRole('heading', { name: /needs the NestJS backend/i }),
    ).toBeInTheDocument()
    expect(api.getSummary).not.toHaveBeenCalled()
  })

  it('renders the monitoring view once the documents arrive', async () => {
    render(<MonitoringTab />)

    expect(
      await screen.findByRole('region', { name: 'Telemetry health' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('5,4 °C').length).toBeGreaterThan(0)
  })

  it('shows the probe error and offers a retry', async () => {
    vi.mocked(api.probeCapabilities).mockRejectedValue(
      new ApiError('database down', 503, 'TSDB_UNAVAILABLE'),
    )

    render(<MonitoringTab />)

    expect(await screen.findByText('database down')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows a probing state while the capability probe is in flight', async () => {
    vi.mocked(api.probeCapabilities).mockReturnValue(new Promise(() => undefined))

    render(<MonitoringTab />)

    expect(screen.getByText(/checking telemetry support/i)).toBeInTheDocument()
  })

  it('recovers when the retry probe succeeds', async () => {
    const user = userEvent.setup()
    vi.mocked(api.probeCapabilities)
      .mockRejectedValueOnce(new ApiError('database down', 503, 'TSDB_UNAVAILABLE'))
      .mockResolvedValueOnce(CAPABILITIES)

    render(<MonitoringTab />)
    await screen.findByText('database down')

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(
      await screen.findByRole('region', { name: 'Telemetry health' }),
    ).toBeInTheDocument()
  })
})
