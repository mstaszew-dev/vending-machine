import { FakeTimeSeriesStore } from '../../test/fake-time-series-store'
import type { InfluxConfig } from '../config/app-config'
import { CircuitBreaker } from './circuit-breaker'
import { MetricsService } from './metrics-service'
import { MetricsWriter } from './metrics-writer'
import { MonitoringStream } from '../monitoring/monitoring-stream'
import { mulberry32, TemperatureSimulator } from './temperature-simulator'
import { VitalsMonitor } from './vitals-monitor'
import { TemperatureService } from './temperature-service'

const T0 = 1_700_000_000_000

const INFLUX: InfluxConfig = {
  url: 'http://127.0.0.1:8181',
  token: '',
  timeoutMs: 2_000,
  dataDir: '.data/influxdb3',
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

function setup(now = { value: T0 }) {
  const store = new FakeTimeSeriesStore()
  const writer = new MetricsWriter(
    store,
    new CircuitBreaker({ failureThreshold: 3, openMs: 1_000 }),
    { maxQueue: 100, batchSize: 50, flushIntervalMs: 1_000 },
  )
  const clock = () => now.value
  const metrics = new MetricsService(store, writer, INFLUX, clock)
  const stream = new MonitoringStream()
  const seen: string[] = []
  const alerts: string[] = []
  stream.subscribe((event) => {
    seen.push(event.kind)
    if (event.kind === 'alert') alerts.push(event.data.code)
  })
  const service = new TemperatureService(
    new TemperatureSimulator(TEMPERATURE, mulberry32(1)),
    new VitalsMonitor({ minC: 4, maxC: 8, consecutiveSamples: 3 }),
    metrics,
    stream,
    { enabled: true, intervalMs: 2_000 },
    clock,
  )
  return { store, writer, seen, alerts, now, service }
}

describe('TemperatureService', () => {
  it('records and streams one sample per tick', async () => {
    const { store, writer, seen, service } = setup()

    const sample = service.tick()
    await writer.flush()

    expect(sample.temperatureC).toBeGreaterThanOrEqual(4)
    expect(sample.temperatureC).toBeLessThanOrEqual(8)
    expect(store.written[0]?.database).toBe('vitals')
    expect(seen).toContain('vitals')
  })

  it('raises one alert after three consecutive excursion samples', async () => {
    const { store, writer, alerts, service } = setup()
    service.beginExcursion(30)

    service.tick()
    service.tick()
    service.tick()
    await writer.flush()

    expect(alerts).toEqual(['TEMP_HIGH'])
    expect(store.pointsOfType('alert')).toHaveLength(1)
  })

  it('does not repeat the alert while the excursion continues', async () => {
    const { writer, alerts, service } = setup()
    service.beginExcursion(60)

    for (let index = 0; index < 10; index += 1) {
      service.tick()
    }
    await writer.flush()

    expect(alerts).toEqual(['TEMP_HIGH'])
  })

  it('samples on its interval once started and stops on stop', async () => {
    jest.useFakeTimers()
    try {
      const { store, writer, service } = setup()
      service.start()

      await jest.advanceTimersByTimeAsync(2_000)
      await writer.flush()

      expect(store.written.filter((entry) => entry.database === 'vitals')).toHaveLength(1)

      service.stop()
      await jest.advanceTimersByTimeAsync(10_000)
      await writer.flush()

      expect(store.written.filter((entry) => entry.database === 'vitals')).toHaveLength(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('does not sample when the simulation is disabled', async () => {
    jest.useFakeTimers()
    try {
      const { store, service } = setup()
      const disabled = new TemperatureService(
        new TemperatureSimulator(TEMPERATURE, mulberry32(1)),
        new VitalsMonitor({ minC: 4, maxC: 8, consecutiveSamples: 3 }),
        {} as MetricsService,
        new MonitoringStream(),
        { enabled: false, intervalMs: 2_000 },
        () => T0,
      )
      disabled.start()
      await jest.advanceTimersByTimeAsync(10_000)

      expect(store.written).toHaveLength(0)
      expect(disabled.running()).toBe(false)
      service.stop()
    } finally {
      jest.useRealTimers()
    }
  })

  it('turns an excursion request into a bounded window', () => {
    const { now, service } = setup()

    expect(service.beginExcursion(30)).toEqual({
      seconds: 30,
      until: new Date(now.value + 30_000).toISOString(),
    })
  })
})
