import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MonitoringView } from './MonitoringView'
import type {
  MonitoringCapabilities,
  MonitoringEvent,
  MonitoringSummary,
  SeriesResponse,
} from './types'

const noop = () => undefined

const TSDB = {
  reachable: true,
  bytes: 4_096,
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
    insertsLastMinute: 3,
    valueLastMinute: 6,
    hopperInserted: 12.5,
    hopperCapacity: 50,
  },
  machine: { credit: 6, totalRevenue: 3.3, unitsSold: 6 },
  alert: null,
  tsdb: TSDB,
  streamSubscribers: 1,
}

const TEMPERATURE: SeriesResponse = {
  signal: 'temperature',
  rangeSeconds: 900,
  points: [
    { at: 1_700_000_000_000, value: 5.2 },
    { at: 1_700_000_060_000, value: 5.4 },
  ],
}

const COIN_RATE: SeriesResponse = {
  signal: 'coin_rate',
  rangeSeconds: 900,
  points: [{ at: 1_700_000_000_000, value: 3 }],
}

const EVENTS: MonitoringEvent[] = [
  {
    at: '2026-11-18T10:00:00.000Z',
    type: 'coin_inserted',
    value: 0.5,
    quantity: 1,
  },
  {
    at: '2026-11-18T09:59:59.000Z',
    type: 'insert_rejected',
    value: 0.05,
    quantity: 1,
    code: 'COIN_RATE_EXCEEDED',
  },
]

function renderView(overrides: Partial<Parameters<typeof MonitoringView>[0]> = {}) {
  return render(
    <MonitoringView
      capabilities={CAPABILITIES}
      summary={SUMMARY}
      temperature={TEMPERATURE}
      coinRate={COIN_RATE}
      events={EVENTS}
      live
      busy={false}
      error={null}
      onFlood={noop}
      onExcursion={noop}
      onRefresh={noop}
      {...overrides}
    />,
  )
}

describe('MonitoringView', () => {
  it('shows the latest temperature and the coin box fill level', () => {
    renderView()

    expect(screen.getAllByText('5,4 °C').length).toBeGreaterThan(0)
    expect(screen.getByText(/12,50 € of 50,00 €/)).toBeInTheDocument()
  })

  it('draws one chart per signal', () => {
    renderView()

    expect(screen.getByRole('img', { name: /temperature/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /coin rate/i })).toBeInTheDocument()
  })

  it('shows the storage budget and the live indicator', () => {
    renderView()

    const health = screen.getByRole('region', { name: 'Telemetry health' })
    expect(within(health).getByText(/4 KB/)).toBeInTheDocument()
    expect(within(health).getByText('live')).toBeInTheDocument()
  })

  it('falls back to polling when the stream is down', () => {
    renderView({ live: false })

    expect(screen.getByText(/polling every 5 s/)).toBeInTheDocument()
  })

  it('raises the alert pill when the machine reported one', () => {
    renderView({
      summary: {
        ...SUMMARY,
        alert: { code: 'TEMP_HIGH', at: 1_700_000_000_000, message: 'Too warm', temperatureC: 9.5 },
      },
    })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('TEMP_HIGH')
    expect(alert).toHaveTextContent('Too warm')
  })

  it('shows a placeholder before the first temperature sample arrives', () => {
    renderView({
      summary: { ...SUMMARY, temperature: null },
      temperature: { signal: 'temperature', rangeSeconds: 900, points: [] },
    })

    expect(screen.getByText(/waiting for the first sample/i)).toBeInTheDocument()
  })

  it('runs both demo actions with their defaults', async () => {
    const user = userEvent.setup()
    const onFlood = vi.fn()
    const onExcursion = vi.fn()

    renderView({ onFlood, onExcursion })
    await user.click(screen.getByRole('button', { name: /coin flood/i }))
    await user.click(screen.getByRole('button', { name: /temperature excursion/i }))

    expect(onFlood).toHaveBeenCalledTimes(1)
    expect(onExcursion).toHaveBeenCalledTimes(1)
  })

  it('disables the demo actions while a request runs', () => {
    renderView({ busy: true })

    expect(screen.getByRole('button', { name: /coin flood/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /temperature excursion/i })).toBeDisabled()
  })

  it('lists the recent machine events', () => {
    renderView()

    const list = screen.getByRole('list', { name: 'Recent machine events' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('coin_inserted')
    expect(rows[1]).toHaveTextContent('COIN_RATE_EXCEEDED')
  })

  it('keeps the action error visible', () => {
    renderView({ error: 'The coin box is full' })

    expect(screen.getByText('The coin box is full')).toBeInTheDocument()
  })
})
