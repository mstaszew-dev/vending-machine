import type { TimeSeriesPoint } from '../src/metrics/line-protocol'
import { MissingRelationError, type TimeSeriesStore } from '../src/metrics/time-series'

export interface StoredPoint {
  readonly database: string
  readonly point: TimeSeriesPoint
}

/** In-memory double for the time-series port: no HTTP, no InfluxDB, real behaviour. */
export class FakeTimeSeriesStore implements TimeSeriesStore {
  readonly written: StoredPoint[] = []
  readonly databases: { name: string; retention: string }[] = []
  readonly queries: { database: string; sql: string }[] = []
  rows: unknown[] = []
  failWrites = false
  failQueries = false
  /** Error text used by failQueries; override to simulate a missing table. */
  queryError = 'influxdb query failed'
  missingTable = false
  reachable = true

  async write(database: string, points: readonly TimeSeriesPoint[]): Promise<void> {
    if (this.failWrites) {
      throw new Error('influxdb is not reachable')
    }
    for (const point of points) {
      this.written.push({ database, point })
    }
  }

  async query<T>(database: string, sql: string): Promise<T[]> {
    this.queries.push({ database, sql })
    if (this.failQueries) {
      if (this.missingTable) throw new MissingRelationError(this.queryError)
      throw new Error(this.queryError)
    }
    return this.rows as T[]
  }

  async ensureDatabase(name: string, retention: string): Promise<void> {
    if (!this.databases.some((database) => database.name === name)) {
      this.databases.push({ name, retention })
    }
  }

  async ping(): Promise<boolean> {
    return this.reachable
  }

  pointsOfType(type: string): TimeSeriesPoint[] {
    return this.written
      .filter((entry) => entry.point.tags?.['type'] === type)
      .map((entry) => entry.point)
  }
}
