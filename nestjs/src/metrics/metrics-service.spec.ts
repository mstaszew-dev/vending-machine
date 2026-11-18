import { FakeTimeSeriesStore } from '../../test/fake-time-series-store'
import type { InfluxConfig } from '../config/app-config'
import { MetricsService } from './metrics-service'
import { MetricsWriter } from './metrics-writer'
import { CircuitBreaker } from './circuit-breaker'
import { mulberry32, TemperatureSimulator } from './temperature-simulator'

const T0 = 1_700_000_000_000

const INFLUX: InfluxConfig = {
  url: 'http://127.0.0.1:8181',
  token: '',
  timeoutMs: 2_000,
  dataDir: '.data/influxdb3',
  vitals: { database: 'vitals', retention: '1h' },
  events: { database: 'events', retention: '7d' },
}

function setup(coinWindowMs?: number) {
  const store = new FakeTimeSeriesStore()
  const writer = new MetricsWriter(
    store,
    new CircuitBreaker({ failureThreshold: 3, openMs: 1_000 }),
    { maxQueue: 100, batchSize: 50, flushIntervalMs: 1_000 },
  )
  const metrics = new MetricsService(store, writer, INFLUX, () => T0, coinWindowMs)
  return { store, writer, metrics }
}

describe('MetricsService', () => {
  it('uses the configured coin window for the summary and warm-up queries', async () => {
    const { store, metrics } = setup(120_000)

    await metrics.coinWindowStats()
    await metrics.coinInsertHistory()

    expect(store.queries).toHaveLength(2)
    for (const query of store.queries) {
      expect(query.sql).toContain("INTERVAL '120 seconds'")
    }
  })

  it('records a coin insert as a durable event', async () => {
    const { store, writer, metrics } = setup()

    metrics.recordCoinInserted({ valueCents: 50, creditCents: 150, at: T0 })
    await writer.flush()

    expect(store.written[0]).toEqual({
      database: 'events',
      point: {
        measurement: 'machine_event',
        tags: { type: 'coin_inserted' },
        fields: { credit_cents: 150, quantity: 1, revenue_cents: 0, value_cents: 50 },
        at: T0,
      },
    })
  })

  it('records a rejected insert with its code', async () => {
    const { store, writer, metrics } = setup()

    metrics.recordRejected('COIN_RATE_EXCEEDED', { valueCents: 50, at: T0 })
    await writer.flush()

    expect(store.written[0]?.point.tags).toEqual({
      type: 'insert_rejected',
      code: 'COIN_RATE_EXCEEDED',
    })
    expect(store.written[0]?.point.fields).toMatchObject({ value_cents: 50 })
  })

  it('records a purchase with units and revenue', async () => {
    const { store, writer, metrics } = setup()

    metrics.recordPurchase({ totalCents: 110, units: 2, revenueCents: 110, creditCents: 0, at: T0 })
    await writer.flush()

    expect(store.written[0]?.point).toMatchObject({
      tags: { type: 'purchase' },
      fields: { value_cents: 110, quantity: 2, revenue_cents: 110, credit_cents: 0 },
    })
  })

  it('records one refill point per product position', async () => {
    const { store, writer, metrics } = setup()

    metrics.recordRefill(
      [
        { productId: 1, quantity: 2 },
        { productId: 8, quantity: 1 },
      ],
      T0,
    )
    await writer.flush()

    expect(store.written.map((entry) => entry.point.tags)).toEqual([
      { type: 'refill', product_id: '1' },
      { type: 'refill', product_id: '8' },
    ])
  })

  it('records credit returns and hopper collections', async () => {
    const { store, writer, metrics } = setup()

    metrics.recordCreditReturned({ valueCents: 150, at: T0 })
    metrics.recordHopperCollected({ valueCents: 300, at: T0 })
    await writer.flush()

    expect(store.written.map((entry) => entry.point.tags?.['type'])).toEqual([
      'credit_returned',
      'hopper_collected',
    ])
  })

  it('records an alert as an event', async () => {
    const { store, writer, metrics } = setup()

    metrics.recordAlert('TEMP_HIGH', T0, 11.4)
    await writer.flush()

    expect(store.written[0]?.point).toMatchObject({
      tags: { type: 'alert', code: 'TEMP_HIGH' },
      fields: { value_cents: 0 },
    })
  })

  it('records a temperature sample in the vitals database', async () => {
    const { store, writer, metrics } = setup()
    const simulator = new TemperatureSimulator(
      {
        minC: 4,
        maxC: 8,
        setpointC: 6,
        stepC: 0.4,
        humidityBase: 40,
        excursionC: 3,
      },
      mulberry32(1),
    )

    metrics.recordTemperature(simulator.next(T0))
    await writer.flush()

    expect(store.written[0]?.database).toBe('vitals')
    expect(store.written[0]?.point).toMatchObject({
      measurement: 'vending',
      tags: { sensor: 'cabinet' },
    })
    expect(store.written[0]?.point.fields).toHaveProperty('temperature_c')
  })

  it('reads the rolling coin window from the events database', async () => {
    const { store, metrics } = setup()
    store.rows = [{ inserts: 3, cents: 150 }]

    await expect(metrics.coinWindowStats()).resolves.toEqual({ inserts: 3, cents: 150 })
    expect(store.queries[0]?.database).toBe('events')
    expect(store.queries[0]?.sql).toContain("type = 'coin_inserted'")
    expect(store.queries[0]?.sql).toContain("INTERVAL '60 seconds'")
  })

  it('treats an empty aggregate row as zero', async () => {
    const { store, metrics } = setup()
    store.rows = [{ inserts: null, cents: null }]

    await expect(metrics.coinWindowStats()).resolves.toEqual({ inserts: 0, cents: 0 })
  })

  it('reads the latest temperature and maps its timestamp', async () => {
    const { store, metrics } = setup()
    store.rows = [
      { temperature_c: 5.4, setpoint_c: 6, humidity_pct: 41.2, time: '2026-11-18T10:00:00Z' },
    ]

    const latest = await metrics.latestTemperature()

    expect(latest).toEqual({
      temperatureC: 5.4,
      setpointC: 6,
      humidityPct: 41.2,
      at: '2026-11-18T10:00:00.000Z',
    })
    expect(store.queries[0]?.database).toBe('vitals')
  })

  it('reads Influx timestamps without a zone as UTC, not as local time', async () => {
    const { store, metrics } = setup()
    store.rows = [{ temperature_c: 5.4, setpoint_c: 6, humidity_pct: 40, time: '2026-11-18T10:00:00' }]

    const latest = await metrics.latestTemperature()

    expect(latest?.at).toBe('2026-11-18T10:00:00.000Z')
  })

  it('returns null when no temperature has been stored', async () => {
    const { metrics } = setup()

    await expect(metrics.latestTemperature()).resolves.toBeNull()
  })

  it('maps a temperature series to points', async () => {
    const { store, metrics } = setup()
    store.rows = [
      { time: '2026-11-18T10:00:00Z', temperature_c: 5.4 },
      { time: '2026-11-18T10:00:02Z', temperature_c: 5.6 },
    ]

    const series = await metrics.temperatureSeries(15 * 60 * 1_000)

    expect(series).toEqual([
      { at: Date.parse('2026-11-18T10:00:00Z'), value: 5.4 },
      { at: Date.parse('2026-11-18T10:00:02Z'), value: 5.6 },
    ])
    expect(store.queries[0]?.sql).toContain("INTERVAL '900 seconds'")
  })

  it('reads recent events newest first', async () => {
    const { store, metrics } = setup()
    store.rows = [
      {
        time: '2026-11-18T10:00:00Z',
        type: 'purchase',
        code: null,
        product_id: null,
        value_cents: 110,
        quantity: 2,
        credit_cents: 0,
        revenue_cents: 110,
      },
    ]

    const events = await metrics.recentEvents(50)

    expect(events).toEqual([
      {
        at: '2026-11-18T10:00:00.000Z',
        type: 'purchase',
        value: 1.1,
        quantity: 2,
        code: undefined,
        productId: undefined,
      },
    ])
    expect(store.queries[0]?.sql).toContain('ORDER BY time DESC LIMIT 50')
  })

  it('reads the boot history of coin inserts', async () => {
    const { store, metrics } = setup()
    store.rows = [{ time: '2026-11-18T10:00:00Z', value_cents: 50 }]

    const history = await metrics.coinInsertHistory()

    expect(history).toEqual([{ at: Date.parse('2026-11-18T10:00:00Z'), valueCents: 50 }])
  })

  it('propagates query failures so the controller can answer 503', async () => {
    const { store, metrics } = setup()
    store.failQueries = true

    await expect(metrics.latestTemperature()).rejects.toThrow('query failed')
  })
})
