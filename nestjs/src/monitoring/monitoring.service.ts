import type { AppConfig } from '../config/app-config'
import type { MachineService } from '../machine/machine.service'
import { RequestError } from '../machine/problem-details'
import type { CoinWindowStats, MetricsService, SeriesPoint } from '../metrics/metrics-service'
import type { MetricsWriter } from '../metrics/metrics-writer'
import type { SizeGuard, SizeStatus } from '../metrics/size-guard'
import type { TemperatureService } from '../metrics/temperature-service'
import { isMissingRelation, type TimeSeriesStore } from '../metrics/time-series'
import type { MonitoringStream, StreamAlert, StreamEvent } from './monitoring-stream'

export type MonitoringSignal = 'temperature' | 'coin_rate'

export interface TsdbStatus {
  readonly reachable: boolean
  readonly bytes: number
  readonly maxBytes: number
  readonly level: SizeStatus['level']
  readonly queuedPoints: number
  readonly droppedPoints: number
}

export interface Capabilities {
  readonly backend: 'nestjs'
  readonly signals: readonly ['temperature', 'coin_rate', 'events']
  readonly databases: {
    readonly vitals: { readonly retention: string }
    readonly events: { readonly retention: string }
  }
  readonly simulation: { readonly enabled: boolean; readonly intervalMs: number }
  readonly tsdb: TsdbStatus
}

export interface Summary {
  readonly temperature: Awaited<ReturnType<MetricsService['latestTemperature']>>
  readonly coins: {
    readonly insertsLastMinute: number
    readonly valueLastMinute: number
    readonly hopperInserted: number
    readonly hopperCapacity: number
  }
  readonly machine: {
    readonly credit: number
    readonly totalRevenue: number
    readonly unitsSold: number
  }
  readonly alert: StreamAlert | null
  readonly tsdb: TsdbStatus
  readonly streamSubscribers: number
}

const MAX_RANGE_MS = 6 * 60 * 60 * 1_000
const MAX_FLOOD = 200

/**
 * Read model for the monitoring tab. Queries are wrapped so a dead time-series database
 * becomes one 503 with a stable code instead of a Nest stack trace, while the machine
 * endpoints keep selling.
 */
export class MonitoringService {
  private alert: StreamAlert | null = null

  constructor(
    private readonly metrics: MetricsService,
    private readonly machine: MachineService,
    private readonly temperature: TemperatureService,
    private readonly store: TimeSeriesStore,
    private readonly sizeGuard: SizeGuard,
    private readonly writer: MetricsWriter,
    private readonly stream: MonitoringStream,
    private readonly config: AppConfig,
    private readonly clock: () => number = Date.now,
  ) {
    this.stream.subscribe((event) => {
      if (event.kind === 'alert') {
        this.alert = event.data
      }
    })
  }

  async capabilities(): Promise<Capabilities> {
    return {
      backend: 'nestjs',
      signals: ['temperature', 'coin_rate', 'events'],
      databases: {
        vitals: { retention: this.config.influx.vitals.retention },
        events: { retention: this.config.influx.events.retention },
      },
      simulation: { ...this.config.simulation },
      tsdb: await this.tsdbStatus(),
    }
  }

  async summary(): Promise<Summary> {
    const view = this.machine.view()
    const [temperature, coinWindow, tsdb] = await Promise.all([
      this.temperatureOrNull(),
      this.coinWindowOrFail(),
      this.tsdbStatus(),
    ])
    const unitsSold = view.products.reduce((sum, product) => sum + product.unitsSold, 0)
    return {
      temperature,
      coins: {
        insertsLastMinute: coinWindow.inserts,
        valueLastMinute: coinWindow.cents / 100,
        hopperInserted: view.hopper.inserted,
        hopperCapacity: view.hopper.capacity,
      },
      machine: {
        credit: view.credit,
        totalRevenue: view.totalRevenue,
        unitsSold,
      },
      alert: this.alert,
      tsdb,
      streamSubscribers: this.stream.subscriberCount(),
    }
  }

  async series(
    signal: string,
    rangeMs: number,
  ): Promise<{ signal: MonitoringSignal; rangeSeconds: number; points: SeriesPoint[] }> {
    if (signal !== 'temperature' && signal !== 'coin_rate') {
      throw new RequestError(
        'VALIDATION_ERROR',
        `signal must be temperature or coin_rate, got '${signal}'`,
      )
    }
    if (!Number.isFinite(rangeMs) || rangeMs <= 0 || rangeMs > MAX_RANGE_MS) {
      throw new RequestError(
        'VALIDATION_ERROR',
        `range must be between 1 and ${MAX_RANGE_MS / 1_000} seconds`,
      )
    }

    const points =
      signal === 'temperature'
        ? await this.queryOrFail(() => this.metrics.temperatureSeries(rangeMs), [])
        : await this.queryOrFail(() => this.metrics.coinRateSeries(rangeMs), [])

    return { signal, rangeSeconds: Math.round(rangeMs / 1_000), points }
  }

  async events(limit: number): Promise<{ events: Awaited<ReturnType<MetricsService['recentEvents']>> }> {
    return { events: await this.queryOrFail(() => this.metrics.recentEvents(limit), []) }
  }

  history(limit: number): StreamEvent[] {
    return this.stream.recent(limit)
  }

  lastAlert(): StreamAlert | null {
    return this.alert
  }

  subscribe(listener: (event: StreamEvent) => void): () => void {
    return this.stream.subscribe(listener)
  }

  /**
   * Demo button: push cheap coins through the real guard until it trips. The machine, not
   * the demo endpoint, decides how many are accepted.
   */
  async simulateFlood(count: number): Promise<{
    attempted: number
    accepted: number
    rejected: number
    code?: string
  }> {
    const attempted = Math.min(MAX_FLOOD, Math.max(1, Math.trunc(count)))
    let accepted = 0
    let code: string | undefined
    const spacingMs = 5
    const end = this.clock()

    for (let index = 0; index < attempted; index += 1) {
      // InfluxDB keys a point by measurement, tag set and timestamp, so a burst that lands
      // in one millisecond would collapse into a single stored event. Spread the demo over
      // the recent past (at most a second) so every accepted insert stays visible.
      const at = end - (attempted - 1 - index) * spacingMs
      try {
        this.machine.insertCredit(0.05, at)
        accepted += 1
      } catch (error) {
        code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN'
      }
    }
    // keep the demo honest: flush so the events are visible in the chart immediately
    await this.writer.flush()
    return { attempted, accepted, rejected: attempted - accepted, ...(code ? { code } : {}) }
  }

  simulateExcursion(seconds: number): { seconds: number; until: string } {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3_600) {
      throw new RequestError('VALIDATION_ERROR', 'seconds must be between 1 and 3600')
    }
    return this.temperature.beginExcursion(Math.trunc(seconds))
  }

  private async tsdbStatus(): Promise<TsdbStatus> {
    const [reachable, size] = await Promise.all([this.store.ping(), this.sizeGuard.status()])
    const stats = this.writer.stats()
    return {
      reachable,
      bytes: size.bytes,
      maxBytes: size.maxBytes,
      level: size.level,
      queuedPoints: stats.queued,
      droppedPoints: stats.droppedPoints,
    }
  }

  private async temperatureOrNull() {
    try {
      return await this.metrics.latestTemperature()
    } catch {
      return null
    }
  }

  private async coinWindowOrFail(): Promise<CoinWindowStats> {
    try {
      return await this.metrics.coinWindowStats()
    } catch (error) {
      // A brand-new database has no event table yet. That is an empty coin window,
      // not an outage; the in-memory ledger still enforces the guard. Any other
      // failure is a real TSDB problem and must stay visible as 503.
      if (isMissingRelation(error)) {
        return { inserts: 0, cents: 0 }
      }
      throw this.unavailable()
    }
  }

  private async queryOrFail<T>(query: () => Promise<T>, emptyWhenMissing: T): Promise<T> {
    try {
      return await query()
    } catch (error) {
      // A first boot has no measurement tables yet. Charts and the event feed should start
      // empty, not in an error state; every other failure stays a visible 503.
      if (isMissingRelation(error)) return emptyWhenMissing
      throw this.unavailable()
    }
  }

  private unavailable(): RequestError {
    return new RequestError(
      'TSDB_UNAVAILABLE',
      'The time-series database is not available, machine operations are unaffected',
    )
  }
}
