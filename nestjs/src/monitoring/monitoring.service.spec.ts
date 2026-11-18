import { FakeTimeSeriesStore } from '../../test/fake-time-series-store'
import type { AppConfig, InfluxConfig } from '../config/app-config'
import { CircuitBreaker } from '../metrics/circuit-breaker'
import { MetricsService } from '../metrics/metrics-service'
import { MetricsWriter } from '../metrics/metrics-writer'
import { SizeGuard } from '../metrics/size-guard'
import { TemperatureService } from '../metrics/temperature-service'
import { mulberry32, TemperatureSimulator } from '../metrics/temperature-simulator'
import { VitalsMonitor } from '../metrics/vitals-monitor'
import { MachineService } from '../machine/machine.service'
import { DEFAULT_MACHINE_OPTIONS, VendingMachine } from '../machine/vending-machine'
import { MonitoringStream } from './monitoring-stream'
import { MonitoringService } from './monitoring.service'
import { RequestError } from '../machine/problem-details'

const T0 = 1_700_000_000_000

const INFLUX: InfluxConfig = {
  url: 'http://127.0.0.1:8181',
  token: '',
  timeoutMs: 2_000,
  dataDir: '/definitely/not/here',
  vitals: { database: 'vitals', retention: '1h' },
  events: { database: 'events', retention: '7d' },
}

const TEMPERATURE = {
  minC: 4,
  maxC: 8,
  setpointC: 6,
  stepC: 0.4,
  humidityBase: 40,
  excursionC: 3,
}

function setup() {
  const store = new FakeTimeSeriesStore()
  const writer = new MetricsWriter(
    store,
    new CircuitBreaker({ failureThreshold: 3, openMs: 1_000 }),
    { maxQueue: 100, batchSize: 50, flushIntervalMs: 1_000 },
  )
  const stream = new MonitoringStream()
  const clock = () => T0
  const metrics = new MetricsService(store, writer, INFLUX, clock)
  const machine = new VendingMachine(DEFAULT_MACHINE_OPTIONS, clock)
  const machineService = new MachineService(machine, metrics, stream, clock)
  const temperature = new TemperatureService(
    new TemperatureSimulator(TEMPERATURE, mulberry32(1)),
    new VitalsMonitor({ minC: 4, maxC: 8, consecutiveSamples: 3 }),
    metrics,
    stream,
    { enabled: false, intervalMs: 2_000 },
    clock,
  )
  const config = {
    port: 8081,
    machine: DEFAULT_MACHINE_OPTIONS,
    influx: INFLUX,
    tsdb: { maxBytes: 1_000 },
    simulation: { enabled: false, intervalMs: 2_000 },
    temperature: TEMPERATURE,
  } satisfies AppConfig
  const service = new MonitoringService(
    metrics,
    machineService,
    temperature,
    store,
    new SizeGuard(INFLUX.dataDir, config.tsdb.maxBytes),
    writer,
    stream,
    config,
    clock,
  )
  return { store, writer, stream, machineService, service }
}

describe('MonitoringService', () => {
  it('describes available signals, retention and database health', async () => {
    const { service } = setup()

    await expect(service.capabilities()).resolves.toMatchObject({
      backend: 'nestjs',
      signals: ['temperature', 'coin_rate', 'events'],
      databases: {
        vitals: { retention: '1h' },
        events: { retention: '7d' },
      },
      tsdb: { reachable: true, level: 'ok' },
    })
  })

  it('reports an unreachable database without failing the capability probe', async () => {
    const { store, service } = setup()
    store.reachable = false

    await expect(service.capabilities()).resolves.toMatchObject({
      tsdb: { reachable: false },
    })
  })

  it('combines live machine state with stored telemetry', async () => {
    const { store, machineService, service } = setup()
    machineService.insertCredit(2)
    store.rows = [{ temperature_c: 5.4, setpoint_c: 6, humidity_pct: 41.2, time: '2026-11-18T10:00:00Z' }]

    const summary = await service.summary()

    expect(summary).toMatchObject({
      temperature: { temperatureC: 5.4, setpointC: 6 },
      coins: { hopperInserted: 2, hopperCapacity: 50 },
      machine: { totalRevenue: 0 },
      tsdb: { reachable: true },
    })
  })

  it('answers 503 TSDB_UNAVAILABLE when the summary query fails', async () => {
    const { store, service } = setup()
    store.failQueries = true

    const error = await service.summary().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(RequestError)
    expect((error as RequestError).code).toBe('TSDB_UNAVAILABLE')
    expect((error as RequestError).status).toBe(503)
  })

  it('treats a missing event table on a fresh database as an empty coin window', async () => {
    const { store, service } = setup()
    store.failQueries = true
    store.missingTable = true
    store.queryError = "InfluxDB query failed on events: table 'machine_event' does not exist"

    const summary = await service.summary()

    expect(summary.coins).toMatchObject({
      insertsLastMinute: 0,
      valueLastMinute: 0,
    })
  })

  it('treats a missing measurement as empty series and events', async () => {
    const { store, service } = setup()
    store.failQueries = true
    store.missingTable = true
    store.queryError = "Error during planning: table 'public.iox.vending' not found"

    await expect(service.series('temperature', 60_000)).resolves.toMatchObject({ points: [] })
    await expect(service.events(50)).resolves.toEqual({ events: [] })
  })

  it('returns a temperature series for a range', async () => {
    const { store, service } = setup()
    store.rows = [{ time: '2026-11-18T10:00:00Z', temperature_c: 5.5 }]

    const series = await service.series('temperature', 15 * 60 * 1_000)

    expect(series).toEqual({
      signal: 'temperature',
      rangeSeconds: 900,
      points: [{ at: Date.parse('2026-11-18T10:00:00Z'), value: 5.5 }],
    })
  })

  it('returns a coin rate series and rejects an unknown signal', async () => {
    const { store, service } = setup()
    store.rows = [{ bucket: '2026-11-18T10:00:10Z', inserts: 4 }]

    await expect(service.series('coin_rate', 60_000)).resolves.toMatchObject({
      signal: 'coin_rate',
      points: [{ value: 4 }],
    })

    const error = await service.series('bogus', 60_000).catch((caught: unknown) => caught)
    expect((error as RequestError).code).toBe('VALIDATION_ERROR')
  })

  it('rejects a range that is not a positive number of milliseconds', async () => {
    const { service } = setup()

    for (const range of [0, -1, Number.NaN]) {
      const error = await service.series('temperature', range).catch((caught: unknown) => caught)
      expect((error as RequestError).code).toBe('VALIDATION_ERROR')
    }
  })

  it('returns recent events with a bounded limit', async () => {
    const { store, service } = setup()
    store.rows = []

    await service.events(1_000)

    expect(store.queries[0]?.sql).toContain('ORDER BY time DESC LIMIT 500')
  })

  it('reports the last alert seen on the stream', async () => {
    const { stream, service } = setup()
    stream.publish({ kind: 'alert', data: { code: 'TEMP_HIGH', at: T0, message: 'hot' } })

    expect(service.lastAlert()).toMatchObject({ code: 'TEMP_HIGH' })
  })

  it('turns a flood request into guarded inserts and reports the outcome', async () => {
    const { service } = setup()

    const result = await service.simulateFlood(30)

    expect(result.accepted).toBe(20)
    expect(result.rejected).toBe(10)
    expect(result.code).toBe('COIN_RATE_EXCEEDED')
  })

  it('gives every flood insert a distinct timestamp so Influx keeps all of them', async () => {
    const { store, writer, service } = setup()

    await service.simulateFlood(25)
    await writer.flush()

    const stamps = store.pointsOfType('coin_inserted').map((point) => point.at)
    expect(stamps).toHaveLength(20)
    // InfluxDB deduplicates on measurement + tag set + timestamp, so a burst inside one
    // millisecond would collapse twenty inserts into one stored event.
    expect(new Set(stamps).size).toBe(20)
  })

  it('caps the flood size', async () => {
    const { service } = setup()

    const result = await service.simulateFlood(10_000)

    expect(result.attempted).toBe(200)
  })

  it('delegates an excursion request to the temperature service', () => {
    const { service } = setup()

    expect(service.simulateExcursion(30)).toEqual({
      seconds: 30,
      until: new Date(T0 + 30_000).toISOString(),
    })
  })
})
