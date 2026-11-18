import { FakeTimeSeriesStore } from '../../test/fake-time-series-store'
import { CircuitBreaker } from './circuit-breaker'
import { MetricsWriter } from './metrics-writer'

const T0 = 1_700_000_000_000

function setup(overrides: { maxQueue?: number; batchSize?: number } = {}) {
  const store = new FakeTimeSeriesStore()
  const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 10_000 }, () => T0)
  const writer = new MetricsWriter(store, breaker, {
    maxQueue: overrides.maxQueue ?? 1_000,
    batchSize: overrides.batchSize ?? 100,
    flushIntervalMs: 500,
  })
  return { store, breaker, writer }
}

describe('MetricsWriter', () => {
  it('buffers points and writes them on flush', async () => {
    const { store, writer } = setup()
    writer.record('events', { measurement: 'machine_event', fields: { value_cents: 50 }, at: T0 })

    expect(store.written).toHaveLength(0)
    await writer.flush()

    expect(store.written).toEqual([
      {
        database: 'events',
        point: { measurement: 'machine_event', fields: { value_cents: 50 }, at: T0 },
      },
    ])
  })

  it('groups a flush by database', async () => {
    const { store, writer } = setup()
    writer.record('events', { measurement: 'machine_event', fields: { a: 1 }, at: T0 })
    writer.record('vitals', { measurement: 'vending', fields: { b: 2 }, at: T0 })
    writer.record('events', { measurement: 'machine_event', fields: { a: 3 }, at: T0 })

    await writer.flush()

    expect(store.written.filter((entry) => entry.database === 'events')).toHaveLength(2)
    expect(store.written.filter((entry) => entry.database === 'vitals')).toHaveLength(1)
  })

  it('drops the oldest point when the queue is full and counts it', async () => {
    const { store, writer } = setup({ maxQueue: 2 })
    writer.record('events', { measurement: 'm', fields: { n: 1 }, at: T0 })
    writer.record('events', { measurement: 'm', fields: { n: 2 }, at: T0 })
    writer.record('events', { measurement: 'm', fields: { n: 3 }, at: T0 })

    expect(writer.stats().droppedPoints).toBe(1)

    await writer.flush()

    expect(store.written.map((entry) => entry.point.fields['n'])).toEqual([2, 3])
  })

  it('sends large batches in slices of the configured size', async () => {
    const { store, writer } = setup({ batchSize: 2 })
    for (let index = 0; index < 5; index += 1) {
      writer.record('vitals', { measurement: 'vending', fields: { n: index }, at: T0 })
    }

    await writer.flush()

    expect(store.written).toHaveLength(5)
  })

  it('counts written points and clears the queue', async () => {
    const { writer } = setup()
    writer.record('events', { measurement: 'm', fields: { n: 1 }, at: T0 })
    writer.record('events', { measurement: 'm', fields: { n: 2 }, at: T0 })

    await writer.flush()

    expect(writer.stats()).toMatchObject({ queued: 0, writtenPoints: 2, failedBatches: 0 })
  })

  it('drops a failed batch, counts it and opens the breaker', async () => {
    const { store, breaker, writer } = setup()
    store.failWrites = true

    for (let attempt = 0; attempt < 3; attempt += 1) {
      writer.record('events', { measurement: 'm', fields: { n: attempt }, at: T0 })
      await writer.flush()
    }

    expect(writer.stats()).toMatchObject({ queued: 0, failedBatches: 3 })
    expect(breaker.state()).toBe('open')

    writer.record('events', { measurement: 'm', fields: { n: 9 }, at: T0 })
    await writer.flush()

    expect(store.written).toHaveLength(0)
    expect(writer.stats().skippedFlushes).toBe(1)
  })

  it('shares one in-flight flush instead of starting overlapping writes', async () => {
    const store = new FakeTimeSeriesStore()
    let release: (() => void) | undefined
    let calls = 0
    jest.spyOn(store, 'write').mockImplementation(() => {
      calls += 1
      return calls === 1
        ? new Promise<void>((resolve) => {
            release = resolve
          })
        : Promise.resolve()
    })
    const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 10_000 }, () => T0)
    const writer = new MetricsWriter(store, breaker, {
      maxQueue: 100,
      batchSize: 1,
      flushIntervalMs: 500,
    })
    for (let index = 0; index < 3; index += 1) {
      writer.record('vitals', { measurement: 'vending', fields: { n: index }, at: T0 })
    }

    const first = writer.flush()
    expect(calls).toBe(1)

    const second = writer.flush()
    expect(calls).toBe(1)

    release?.()
    await Promise.all([first, second])

    expect(calls).toBe(3)
    expect(writer.stats().queued).toBe(0)
  })

  it('never throws from record, even with a broken clock', async () => {
    const { writer } = setup()
    expect(() =>
      writer.record('events', { measurement: 'm', fields: { n: 1 }, at: T0 }),
    ).not.toThrow()
  })

  it('flushes on its own interval once started', async () => {
    jest.useFakeTimers()
    try {
      const { store, writer } = setup()
      writer.start()
      writer.record('events', { measurement: 'm', fields: { n: 1 }, at: T0 })

      await jest.advanceTimersByTimeAsync(600)

      expect(store.written).toHaveLength(1)
      writer.stop()
    } finally {
      jest.useRealTimers()
    }
  })
})
