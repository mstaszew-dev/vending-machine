import { createTestApp } from './create-test-app'

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
