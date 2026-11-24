import { MetricsWriter } from '../src/metrics/metrics-writer'
import { MonitoringStream } from '../src/monitoring/monitoring-stream'
import { createTestApp, type TestApp } from './create-test-app'

function alertCodes(context: TestApp): string[] {
  return context.app
    .get(MonitoringStream)
    .recent(50)
    .flatMap((event) => (event.kind === 'alert' ? [event.data.code] : []))
}

describe('bootstrap', () => {
  it('creates both databases with their immutable retention', async () => {
    const context = await createTestApp()

    try {
      expect(context.store.databases).toEqual(
        expect.arrayContaining([
          { name: 'vitals', retention: '1h' },
          { name: 'events', retention: '7d' },
        ]),
      )
    } finally {
      await context.close()
    }
  })

  it('warms the coin window from the durable event log', async () => {
    const context = await createTestApp({}, (store) => {
      store.rows = [
        { time: new Date(Date.now() - 5_000).toISOString(), value_cents: 50 },
        { time: new Date(Date.now() - 4_000).toISOString(), value_cents: 100 },
        { time: new Date(Date.now() - 3_000).toISOString(), value_cents: 200 },
      ]
    })

    try {
      const response = await context.http().get('/api/machine').expect(200)

      expect(response.body).toMatchObject({
        coinWindow: { inserts: 3, value: 3.5 },
      })
    } finally {
      await context.close()
    }
  })

  it('raises a streamed and durable TSDB_UNAVAILABLE alert when boot warm-up fails', async () => {
    const context = await createTestApp({}, (store) => {
      store.failQueries = true
      store.reachable = false
    })

    try {
      const alerts = context.app
        .get(MonitoringStream)
        .recent(50)
        .flatMap((event) => (event.kind === 'alert' ? [event.data] : []))

      expect(alerts).toEqual([
        expect.objectContaining({
          code: 'TSDB_UNAVAILABLE',
          at: expect.any(Number) as number,
        }),
      ])

      await context.app.get(MetricsWriter).flush()
      expect(context.store.pointsOfType('alert').map((point) => point.tags?.['code'])).toEqual([
        'TSDB_UNAVAILABLE',
      ])

      // telemetry is fail-open: a sale still completes while the database is down
      await context.http().post('/api/machine/credit').send({ amount: 1 }).expect(200)
    } finally {
      await context.close()
    }
  })

  it('does not alert when a brand-new database has no event table', async () => {
    const context = await createTestApp({}, (store) => {
      store.failQueries = true
      store.missingTable = true
      store.queryError = "InfluxDB query failed on events: table 'machine_event' does not exist"
    })

    try {
      await context.app.get(MetricsWriter).flush()
      const alerts = context.app
        .get(MonitoringStream)
        .recent(50)
        .flatMap((event) => (event.kind === 'alert' ? [event.data] : []))

      expect(alerts).toEqual([])
      expect(context.store.pointsOfType('alert')).toEqual([])
    } finally {
      await context.close()
    }
  })

  it('treats a boot outage, a failed query and the next healthy query as one outage', async () => {
    const context = await createTestApp({}, (store) => {
      store.failQueries = true
    })

    try {
      expect(alertCodes(context)).toEqual(['TSDB_UNAVAILABLE'])

      const failed = await context.http().get('/api/monitoring/summary').expect(503)
      expect(failed.body).toMatchObject({ code: 'TSDB_UNAVAILABLE' })
      expect(alertCodes(context)).toEqual(['TSDB_UNAVAILABLE'])

      context.store.failQueries = false
      context.store.rows = []
      await context.http().get('/api/monitoring/summary').expect(200)

      expect(alertCodes(context)).toEqual(['TSDB_UNAVAILABLE', 'TSDB_RECOVERED'])
    } finally {
      await context.close()
    }
  })

  it('recovers once when a missing relation follows a boot outage', async () => {
    const context = await createTestApp({}, (store) => {
      store.failQueries = true
    })

    try {
      expect(alertCodes(context)).toEqual(['TSDB_UNAVAILABLE'])

      context.store.missingTable = true
      context.store.queryError = "InfluxDB query failed on events: table 'machine_event' does not exist"
      await context.http().get('/api/monitoring/summary').expect(200)
      await context.http().get('/api/monitoring/events?limit=5').expect(200)

      expect(alertCodes(context)).toEqual(['TSDB_UNAVAILABLE', 'TSDB_RECOVERED'])
    } finally {
      await context.close()
    }
  })

  it('boots even when the database cannot answer', async () => {
    const context = await createTestApp({}, (store) => {
      store.failQueries = true
      store.reachable = false
    })

    try {
      const machine = await context.http().get('/api/machine').expect(200)
      expect(machine.body).toMatchObject({ credit: 0 })

      const capabilities = await context.http().get('/api/monitoring/capabilities').expect(200)
      expect(capabilities.body).toMatchObject({ tsdb: { reachable: false } })
    } finally {
      await context.close()
    }
  })
})
