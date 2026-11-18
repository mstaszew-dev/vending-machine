import { TemperatureService } from '../src/metrics/temperature-service'
import { MonitoringController } from '../src/monitoring/monitoring.controller'
import { createTestApp, type TestApp } from './create-test-app'

let context: TestApp

beforeEach(async () => {
  context = await createTestApp()
})

afterEach(async () => {
  await context.close()
})

describe('monitoring API', () => {
  it('advertises the signals and retention of the NestJS backend', async () => {
    const response = await context.http().get('/api/monitoring/capabilities').expect(200)

    expect(response.body).toMatchObject({
      backend: 'nestjs',
      signals: ['temperature', 'coin_rate', 'events'],
      databases: {
        vitals: { retention: '1h' },
        events: { retention: '7d' },
      },
      simulation: { enabled: false, intervalMs: 2_000 },
      tsdb: { reachable: true, level: 'ok' },
    })
  })

  it('reports the database as unreachable without failing the probe', async () => {
    context.store.reachable = false

    const response = await context.http().get('/api/monitoring/capabilities').expect(200)

    expect(response.body).toMatchObject({ tsdb: { reachable: false } })
  })

  it('summarises temperature, coins and machine state', async () => {
    context.store.rows = [
      { temperature_c: 5.4, setpoint_c: 6, humidity_pct: 41.2, time: '2026-11-18T10:00:00Z' },
    ]
    await context.http().post('/api/machine/credit').send({ amount: 2 }).expect(200)

    const response = await context.http().get('/api/monitoring/summary').expect(200)

    expect(response.body).toMatchObject({
      temperature: {
        temperatureC: 5.4,
        setpointC: 6,
        humidityPct: 41.2,
        at: '2026-11-18T10:00:00.000Z',
      },
      coins: { hopperInserted: 2, hopperCapacity: 50 },
      machine: { credit: 2, totalRevenue: 0 },
      tsdb: { reachable: true },
    })
  })

  it('answers 503 TSDB_UNAVAILABLE when the database cannot answer', async () => {
    context.store.failQueries = true

    const response = await context.http().get('/api/monitoring/summary').expect(503)

    expect(response.body).toMatchObject({ status: 503, code: 'TSDB_UNAVAILABLE' })
  })

  it('serves a temperature series', async () => {
    context.store.rows = [
      { time: '2026-11-18T10:00:00Z', temperature_c: 5.5 },
      { time: '2026-11-18T10:00:02Z', temperature_c: 5.7 },
    ]

    const response = await context
      .http()
      .get('/api/monitoring/series?signal=temperature&range=15m')
      .expect(200)

    expect(response.body).toMatchObject({
      signal: 'temperature',
      rangeSeconds: 900,
      points: [
        { at: Date.parse('2026-11-18T10:00:00Z'), value: 5.5 },
        { at: Date.parse('2026-11-18T10:00:02Z'), value: 5.7 },
      ],
    })
  })

  it('rejects an unknown signal and a malformed range', async () => {
    const signal = await context
      .http()
      .get('/api/monitoring/series?signal=bogus&range=15m')
      .expect(400)
    expect(signal.body).toMatchObject({ code: 'VALIDATION_ERROR' })

    const range = await context
      .http()
      .get('/api/monitoring/series?signal=temperature&range=nope')
      .expect(400)
    expect(range.body).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('serves recent events with a limit', async () => {
    context.store.rows = []

    const response = await context.http().get('/api/monitoring/events?limit=5').expect(200)

    expect(response.body).toEqual({ events: [] })
    expect(context.store.queries.some((query) => query.sql.includes('LIMIT 5'))).toBe(true)
  })

  it('rejects a non-positive event limit', async () => {
    const response = await context.http().get('/api/monitoring/events?limit=0').expect(400)

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('drives a coin flood through the real guard', async () => {
    const response = await context
      .http()
      .post('/api/monitoring/simulate/flood')
      .send({ count: 25 })
      .expect(200)

    expect(response.body).toEqual({
      attempted: 25,
      accepted: 20,
      rejected: 5,
      code: 'COIN_RATE_EXCEEDED',
    })

    const machine = await context.http().get('/api/machine').expect(200)
    expect(machine.body).toMatchObject({ coinWindow: { inserts: 20, value: 1 } })
  })

  it('rejects a flood count that is not a number', async () => {
    const response = await context
      .http()
      .post('/api/monitoring/simulate/flood')
      .send({ count: 'lots' })
      .expect(400)

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('starts a temperature excursion', async () => {
    const response = await context
      .http()
      .post('/api/monitoring/simulate/excursion')
      .send({ seconds: 30 })
      .expect(200)

    expect(response.body).toEqual({
      seconds: 30,
      until: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown as string,
    })
  })

  it('rejects an excursion with a non-positive duration', async () => {
    const response = await context
      .http()
      .post('/api/monitoring/simulate/excursion')
      .send({ seconds: 0 })
      .expect(400)

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('rejects a simulate call without a body', async () => {
    const response = await context.http().post('/api/monitoring/simulate/flood').expect(400)

    expect(response.body).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('streams vitals as server-sent messages with a replay buffer', async () => {
    context.app.get(TemperatureService).tick()

    const stream = context.app.get(MonitoringController).stream()
    const messages: { type?: string; data: unknown }[] = []
    const subscription = stream.subscribe((message) => messages.push(message as { type?: string; data: unknown }))

    try {
      expect(messages.some((message) => message.type === 'vitals')).toBe(true)
      const vitals = messages.find((message) => message.type === 'vitals')
      expect(vitals?.data).toMatchObject({ temperatureC: expect.any(Number) as number })
    } finally {
      subscription.unsubscribe()
    }
  })
})