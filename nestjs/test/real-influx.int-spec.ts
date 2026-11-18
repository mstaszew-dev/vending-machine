import { InfluxTimeSeriesStore } from '../src/metrics/influx-store'

/**
 * Pins the real InfluxDB 3 Core HTTP surface. Skipped unless `INFLUX_URL` is set, so the
 * normal suite stays hermetic; `npm run influx:start && INFLUX_URL=http://127.0.0.1:8181
 * npx jest test/real-influx` is the one command that proves the adapter against the real
 * product instead of the fake.
 */
const url = process.env['INFLUX_URL']
const describeReal = url === undefined || url === '' ? describe.skip : describe

describeReal('real InfluxDB 3 Core', () => {
  const database = `dm_test_${process.pid}_${Date.now()}`
  const store = new InfluxTimeSeriesStore({ url: url ?? '', timeoutMs: 5_000 })

  beforeAll(async () => {
    await store.ensureDatabase(database, '1h')
  }, 30_000)

  afterAll(async () => {
    if (url === undefined) return
    await fetch(`${url}/api/v3/configure/database?db=${database}`, { method: 'DELETE' }).catch(
      () => undefined,
    )
  })

  it('answers a health probe', async () => {
    await expect(store.ping()).resolves.toBe(true)
  })

  it('writes line protocol and reads it back through the SQL endpoint', async () => {
    const at = Date.now()

    await store.write(database, [
      {
        measurement: 'vending',
        tags: { sensor: 'cabinet' },
        fields: { temperature_c: 5.4, humidity_pct: 41.2, setpoint_c: 6, compressor_on: false },
        at,
      },
    ])

    let rows: { temperature_c: number }[] = []
    for (let attempt = 0; attempt < 20; attempt += 1) {
      rows = await store.query<{ temperature_c: number }>(
        database,
        "SELECT temperature_c FROM vending WHERE sensor = 'cabinet' ORDER BY time DESC LIMIT 1",
      )
      if (rows.length > 0) break
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    expect(rows[0]?.temperature_c).toBeCloseTo(5.4, 3)
  }, 30_000)

  it('accepts the database creation twice', async () => {
    await expect(store.ensureDatabase(database, '1h')).resolves.toBeUndefined()
  })
})
