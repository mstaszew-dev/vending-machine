export type BreakerState = 'closed' | 'open' | 'half-open'

export interface BreakerOptions {
  readonly failureThreshold: number
  readonly openMs: number
}

/**
 * Small circuit breaker for telemetry writes: a broken observability stack must not turn
 * every purchase into a failed InfluxDB round trip.
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt: number | null = null

  constructor(
    private readonly options: BreakerOptions,
    private readonly clock: () => number = Date.now,
  ) {}

  allow(): boolean {
    if (this.openedAt === null) return true
    return this.clock() - this.openedAt >= this.options.openMs
  }

  state(): BreakerState {
    if (this.openedAt === null) return 'closed'
    return this.allow() ? 'half-open' : 'open'
  }

  recordSuccess(): void {
    this.failures = 0
    this.openedAt = null
  }

  recordFailure(): void {
    this.failures += 1
    if (this.openedAt !== null) {
      this.openedAt = this.clock()
      return
    }
    if (this.failures >= this.options.failureThreshold) {
      this.openedAt = this.clock()
    }
  }
}
