import { encodeLines, type TimeSeriesPoint } from './line-protocol'
import type { TimeSeriesStore } from './time-series'
import type { CircuitBreaker } from './circuit-breaker'

export interface MetricsWriterOptions {
  readonly maxQueue: number
  readonly batchSize: number
  readonly flushIntervalMs: number
}

export interface WriterStats {
  readonly queued: number
  readonly writtenPoints: number
  readonly failedBatches: number
  readonly droppedPoints: number
  readonly skippedFlushes: number
}

interface QueuedPoint {
  readonly database: string
  readonly point: TimeSeriesPoint
}

/**
 * Bounded, asynchronous write buffer. Telemetry is evidence, not money: when the buffer is
 * full the oldest point is dropped and counted instead of blocking a purchase.
 */
export class MetricsWriter {
  private queue: QueuedPoint[] = []
  private writtenPoints = 0
  private failedBatches = 0
  private droppedPoints = 0
  private skippedFlushes = 0
  private timer: NodeJS.Timeout | null = null
  private inFlight: Promise<void> | null = null

  constructor(
    private readonly store: TimeSeriesStore,
    private readonly breaker: CircuitBreaker,
    private readonly options: MetricsWriterOptions,
  ) {}

  record(database: string, point: TimeSeriesPoint): void {
    if (this.queue.length >= this.options.maxQueue) {
      this.queue.shift()
      this.droppedPoints += 1
    }
    this.queue.push({ database, point })
  }

  start(): void {
    if (this.timer !== null) return
    this.timer = setInterval(() => {
      void this.flush()
    }, this.options.flushIntervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async flush(): Promise<void> {
    // The interval, demo actions and shutdown can all ask for a flush at once. Share one
    // drain so writes never overlap and shutdown really awaits the batch in progress.
    if (this.inFlight !== null) return this.inFlight
    const run = this.drain()
    this.inFlight = run
    try {
      await run
    } finally {
      this.inFlight = null
    }
  }

  private async drain(): Promise<void> {
    if (this.queue.length === 0) return
    if (!this.breaker.allow()) {
      this.skippedFlushes += 1
      return
    }

    // drain in bounded slices: one HTTP request never carries the whole queue, and a
    // failing store stops the loop as soon as the breaker opens
    while (this.queue.length > 0 && this.breaker.allow()) {
      await this.flushSlice()
    }
    if (this.queue.length > 0) {
      this.skippedFlushes += 1
    }
  }

  private async flushSlice(): Promise<void> {
    const batch = this.queue.splice(0, this.options.batchSize)
    const byDatabase = new Map<string, TimeSeriesPoint[]>()
    for (const entry of batch) {
      const points = byDatabase.get(entry.database) ?? []
      points.push(entry.point)
      byDatabase.set(entry.database, points)
    }

    for (const [database, points] of byDatabase) {
      try {
        // encode first: an invalid point must not break the whole flush silently
        encodeLines(points)
        await this.store.write(database, points)
        this.writtenPoints += points.length
        this.breaker.recordSuccess()
      } catch {
        // dropped on purpose: the alternative is an unbounded retry loop in a vending machine
        this.failedBatches += 1
        this.breaker.recordFailure()
      }
    }
  }

  stats(): WriterStats {
    return {
      queued: this.queue.length,
      writtenPoints: this.writtenPoints,
      failedBatches: this.failedBatches,
      droppedPoints: this.droppedPoints,
      skippedFlushes: this.skippedFlushes,
    }
  }
}
