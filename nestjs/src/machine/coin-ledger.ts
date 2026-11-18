export interface CoinInsert {
  readonly at: number
  readonly valueCents: number
}

export interface CoinWindowPolicy {
  readonly windowMs: number
  readonly maxInserts: number
  readonly maxCents: number
}

export interface CoinWindowSnapshot {
  readonly inserts: number
  readonly cents: number
}

/**
 * Rolling window of recent coin inserts, kept in memory so an insert never waits for the
 * database. It is the decision maker for the abuse rule; InfluxDB is the durable copy the
 * ledger is warmed from at boot.
 */
export class CoinLedger {
  private entries: CoinInsert[] = []

  constructor(
    private readonly policy: CoinWindowPolicy,
    private readonly clock: () => number = Date.now,
  ) {}

  record(entry: CoinInsert): void {
    this.prune(entry.at)
    this.entries.push(entry)
  }

  seed(history: readonly CoinInsert[]): void {
    this.entries = []
    for (const entry of [...history].sort((left, right) => left.at - right.at)) {
      this.entries.push(entry)
    }
    this.prune(this.clock())
  }

  snapshot(at: number = this.clock()): CoinWindowSnapshot {
    this.prune(at)
    return {
      inserts: this.entries.length,
      cents: this.entries.reduce((sum, entry) => sum + entry.valueCents, 0),
    }
  }

  wouldExceed(at: number, valueCents: number): boolean {
    const current = this.snapshot(at)
    return (
      current.inserts + 1 > this.policy.maxInserts ||
      current.cents + valueCents > this.policy.maxCents
    )
  }

  reset(): void {
    this.entries = []
  }

  private prune(at: number): void {
    const cutoff = at - this.policy.windowMs
    while (this.entries.length > 0 && (this.entries[0]?.at ?? 0) <= cutoff) {
      this.entries.shift()
    }
  }
}
