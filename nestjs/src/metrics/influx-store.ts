import { encodeLines, type TimeSeriesPoint } from './line-protocol'
import {
  isMissingRelationDetail,
  MissingRelationError,
  type TimeSeriesStore,
} from './time-series'

export interface InfluxStoreOptions {
  readonly url: string
  readonly timeoutMs: number
  readonly token?: string
}

/**
 * InfluxDB 3 Core over HTTP. Writes use the v3 line-protocol endpoint with `no_sync=true`
 * (telemetry does not need an fsync per point); reads use v3 SQL. Everything is behind
 * `TimeSeriesStore`, so a change in the HTTP surface is a one-file change.
 */
export class InfluxTimeSeriesStore implements TimeSeriesStore {
  private readonly baseUrl: string

  constructor(private readonly options: InfluxStoreOptions) {
    this.baseUrl = options.url.replace(/\/+$/, '')
  }

  async write(database: string, points: readonly TimeSeriesPoint[]): Promise<void> {
    if (points.length === 0) return
    const response = await this.request(
      `/api/v3/write_lp?db=${encodeURIComponent(database)}&precision=millisecond&no_sync=true`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: encodeLines(points),
      },
    )
    if (!response.ok) {
      throw new Error(
        `InfluxDB write failed with ${response.status}: ${await this.excerpt(response)}`,
      )
    }
  }

  async query<T>(database: string, sql: string): Promise<T[]> {
    const response = await this.request('/api/v3/query_sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db: database, q: sql, format: 'json' }),
    })
    if (!response.ok) {
      const detail = await this.excerpt(response)
      const message = `InfluxDB query failed on ${database} with ${response.status}: ${detail}`
      // Classify by the body, not the status: a missing measurement is a 400, a missing
      // database is a 404, and a wrong endpoint is also a 404 but is a real outage.
      if (isMissingRelationDetail(detail)) {
        throw new MissingRelationError(message)
      }
      throw new Error(message)
    }
    return (await response.json()) as T[]
  }

  async ensureDatabase(database: string, retention: string): Promise<void> {
    const response = await this.request('/api/v3/configure/database', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db: database, retention_period: retention }),
    })
    if (response.ok) return

    const body = await this.excerpt(response)
    if (response.status === 409 || /exists/i.test(body)) {
      return
    }
    throw new Error(`InfluxDB refused database ${database} with ${response.status}: ${body}`)
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.request('/health', { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.options.token !== undefined && this.options.token !== '') {
      headers.set('Authorization', `Bearer ${this.options.token}`)
    }
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.options.timeoutMs),
    })
  }

  private async excerpt(response: Response): Promise<string> {
    const body = await response.text().catch(() => '')
    return body.slice(0, 300)
  }
}
