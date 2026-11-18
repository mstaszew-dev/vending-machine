import { FakeTimeSeriesStore } from '../../test/fake-time-series-store'
import type { InfluxConfig } from '../config/app-config'
import { MachineError } from './machine-error'
import { MachineService } from './machine.service'
import { CircuitBreaker } from '../metrics/circuit-breaker'
import { MetricsService } from '../metrics/metrics-service'
import { MetricsWriter } from '../metrics/metrics-writer'
import { MonitoringStream } from '../monitoring/monitoring-stream'
import { DEFAULT_MACHINE_OPTIONS, VendingMachine } from './vending-machine'

const T0 = 1_700_000_000_000

const INFLUX: InfluxConfig = {
  url: 'http://127.0.0.1:8181',
  token: '',
  timeoutMs: 2_000,
  dataDir: '.data/influxdb3',
  vitals: { database: 'vitals', retention: '1h' },
  events: { database: 'events', retention: '7d' },
}

function setup() {
  const store = new FakeTimeSeriesStore()
  const writer = new MetricsWriter(
    store,
    new CircuitBreaker({ failureThreshold: 3, openMs: 1_000 }),
    { maxQueue: 1_000, batchSize: 100, flushIntervalMs: 1_000 },
  )
  const clock = () => T0
  const metrics = new MetricsService(store, writer, INFLUX, clock)
  const stream = new MonitoringStream()
  const seen: string[] = []
  stream.subscribe((event) => seen.push(event.kind))
  const machine = new VendingMachine(DEFAULT_MACHINE_OPTIONS, clock)
  const service = new MachineService(machine, metrics, stream, clock)
  return { store, writer, stream, seen, machine, service }
}

function codeOf(action: () => unknown): string {
  try {
    action()
  } catch (error) {
    if (error instanceof MachineError) return error.code
    throw error
  }
  throw new Error('expected a MachineError')
}

describe('MachineService', () => {
  it('returns the machine view', () => {
    const { service } = setup()

    expect(service.view().products).toHaveLength(8)
  })

  it('records an accepted coin and pushes it to the stream', async () => {
    const { store, writer, seen, service } = setup()

    const view = service.insertCredit(0.5)
    await writer.flush()

    expect(view.credit).toBe(0.5)
    expect(store.pointsOfType('coin_inserted')[0]?.fields).toMatchObject({
      value_cents: 50,
      credit_cents: 50,
    })
    expect(seen).toContain('machine_event')
  })

  it('records a rejected coin with its code', async () => {
    const { store, writer, service } = setup()

    expect(codeOf(() => service.insertCredit(0.03))).toBe('INVALID_COIN')
    await writer.flush()

    expect(store.pointsOfType('insert_rejected')[0]?.tags).toMatchObject({ code: 'INVALID_COIN' })
  })

  it('raises an alert when the rate guard rejects an insert', async () => {
    const { store, writer, seen, service } = setup()

    for (let index = 0; index < 20; index += 1) {
      service.insertCredit(0.05)
    }
    expect(codeOf(() => service.insertCredit(0.05))).toBe('COIN_RATE_EXCEEDED')
    await writer.flush()

    expect(seen).toContain('alert')
    expect(store.pointsOfType('alert')[0]?.tags).toMatchObject({ code: 'COIN_RATE_EXCEEDED' })
  })

  it('records a returned credit as an event', async () => {
    const { store, writer, service } = setup()
    service.insertCredit(1)
    service.insertCredit(0.5)

    expect(service.returnCredit()).toEqual({ returned: 1.5 })
    await writer.flush()

    expect(store.pointsOfType('credit_returned')[0]?.fields).toMatchObject({ value_cents: 150 })
  })

  it('records a purchase with units and revenue', async () => {
    const { store, writer, service } = setup()
    service.insertCredit(2)

    const receipt = service.purchase([{ productId: 1, quantity: 2 }])
    await writer.flush()

    expect(receipt.total).toBe(1.1)
    expect(store.pointsOfType('purchase')[0]?.fields).toMatchObject({
      value_cents: 110,
      quantity: 2,
      revenue_cents: 110,
    })
  })

  it('does not record a purchase that the domain rejects', async () => {
    const { store, writer, service } = setup()

    expect(codeOf(() => service.purchase([{ productId: 1, quantity: 1 }]))).toBe(
      'INSUFFICIENT_CREDIT',
    )
    await writer.flush()

    expect(store.pointsOfType('purchase')).toHaveLength(0)
  })

  it('records one refill event per position', async () => {
    const { store, writer, service } = setup()

    service.refill([{ productId: 1, quantity: 2 }])
    await writer.flush()

    expect(store.pointsOfType('refill')).toHaveLength(1)
  })

  it('collects the hopper and tells the stream about it', async () => {
    const { store, writer, seen, service } = setup()
    service.insertCredit(2)

    const view = service.collect()
    await writer.flush()

    expect(view.hopper.inserted).toBe(0)
    expect(seen).toContain('machine_event')
    expect(store.pointsOfType('hopper_collected')[0]?.fields).toMatchObject({
      value_cents: 200,
    })
  })
})
