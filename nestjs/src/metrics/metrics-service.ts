import type { InfluxConfig } from '../config/app-config'
import type { CoinInsert } from '../machine/coin-ledger'
import type { MetricsWriter } from './metrics-writer'
import type { TimeSeriesStore } from './time-series'
import type { VitalsSample } from './temperature-simulator'

export interface CoinWindowStats {
  readonly inserts: number
  readonly cents: number
}

export interface LatestTemperature {
  readonly temperatureC: number
  readonly setpointC: number
  readonly humidityPct: number
  readonly at: string
}

export interface SeriesPoint {
  readonly at: number
  readonly value: number
}

export interface EventView {
  readonly at: string
  readonly type: string
  readonly value: number
  readonly quantity: number
  readonly code?: string
  readonly productId?: string
}

const EVENT_MEASUREMENT = 'machine_event'
const VITALS_MEASUREMENT = 'vending'
const COIN_WINDOW_SECONDS = 60

type Row = Readonly<Record<string, unknown>>

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toIso(value: unknown): string {
  if (typeof value === 'number') return new Date(value).toISOString()
  if (typeof value === 'string') {
    // InfluxDB 3 answers timestamps as naive UTC ISO strings ("2026-11-18T16:24:07.152").
    // ECMAScript parses a date-time without a zone as local time, which silently shifts every
    // timestamp by the machine's offset, so pin the zone before parsing.
    const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    return new Date(naive ? `${value}Z` : value).toISOString()
  }
  return new Date(0).toISOString()
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = String(value)
  return text === '' ? undefined : text
}

/**
 * The single place that knows the SQL for the monitoring views. Controllers ask questions;
 * this class turns them into queries over the events and vitals databases and maps rows back
 * to the shapes the frontend expects. Write methods are fire-and-forget: telemetry must never
 * fail a sale.
 */
export class MetricsService {
  constructor(
    private readonly store: TimeSeriesStore,
    private readonly writer: MetricsWriter,
    private readonly influx: InfluxConfig,
    private readonly clock: () => number = Date.now,
    private readonly coinWindowMs: number = COIN_WINDOW_SECONDS * 1_000,
  ) {}

  recordCoinInserted(input: { valueCents: number; creditCents: number; at?: number }): void {
    this.event('coin_inserted', input.at ?? this.clock(), {
      value_cents: input.valueCents,
      credit_cents: input.creditCents,
    })
  }

  recordRejected(
    code: string,
    input: { valueCents: number; at?: number; creditCents?: number },
  ): void {
    this.event(
      'insert_rejected',
      input.at ?? this.clock(),
      { value_cents: input.valueCents, credit_cents: input.creditCents ?? 0 },
      { code },
    )
  }

  recordPurchase(input: {
    totalCents: number
    units: number
    revenueCents: number
    creditCents: number
    at?: number
  }): void {
    this.event('purchase', input.at ?? this.clock(), {
      value_cents: input.totalCents,
      quantity: input.units,
      revenue_cents: input.revenueCents,
      credit_cents: input.creditCents,
    })
  }

  recordRefill(lines: readonly { productId: number; quantity: number }[], at?: number): void {
    const timestamp = at ?? this.clock()
    for (const line of lines) {
      this.event(
        'refill',
        timestamp,
        { value_cents: 0, quantity: line.quantity },
        { product_id: String(line.productId) },
      )
    }
  }

  recordCreditReturned(input: { valueCents: number; at?: number }): void {
    this.event('credit_returned', input.at ?? this.clock(), {
      value_cents: input.valueCents,
      credit_cents: 0,
    })
  }

  recordHopperCollected(input: { valueCents: number; at?: number }): void {
    this.event('hopper_collected', input.at ?? this.clock(), {
      value_cents: input.valueCents,
      credit_cents: 0,
    })
  }

  recordAlert(code: string, at?: number, temperatureC?: number): void {
    this.event(
      'alert',
      at ?? this.clock(),
      {
        value_cents: 0,
        ...(temperatureC === undefined ? {} : { temperature_c: temperatureC }),
      },
      { code },
    )
  }

  recordTemperature(sample: VitalsSample): void {
    this.writer.record(this.influx.vitals.database, {
      measurement: VITALS_MEASUREMENT,
      tags: { sensor: 'cabinet' },
      fields: {
        temperature_c: sample.temperatureC,
        humidity_pct: sample.humidityPct,
        setpoint_c: sample.setpointC,
        compressor_on: sample.compressorOn,
      },
      at: sample.at,
    })
  }

  async coinWindowStats(): Promise<CoinWindowStats> {
    const seconds = Math.max(1, Math.round(this.coinWindowMs / 1_000))
    const rows = await this.store.query<Row>(
      this.influx.events.database,
      `SELECT COUNT(*) AS inserts, COALESCE(SUM(value_cents), 0) AS cents
       FROM ${EVENT_MEASUREMENT}
       WHERE type = 'coin_inserted' AND time >= now() - INTERVAL '${seconds} seconds'`,
    )
    const row = rows[0]
    return {
      inserts: Math.round(toNumber(row?.['inserts'])),
      cents: Math.round(toNumber(row?.['cents'])),
    }
  }

  async latestTemperature(): Promise<LatestTemperature | null> {
    const rows = await this.store.query<Row>(
      this.influx.vitals.database,
      `SELECT temperature_c, setpoint_c, humidity_pct, time
       FROM ${VITALS_MEASUREMENT}
       WHERE sensor = 'cabinet'
       ORDER BY time DESC
       LIMIT 1`,
    )
    const row = rows[0]
    if (row === undefined) return null
    return {
      temperatureC: toNumber(row['temperature_c']),
      setpointC: toNumber(row['setpoint_c']),
      humidityPct: toNumber(row['humidity_pct']),
      at: toIso(row['time']),
    }
  }

  async temperatureSeries(windowMs: number): Promise<SeriesPoint[]> {
    const seconds = Math.max(1, Math.round(windowMs / 1_000))
    const rows = await this.store.query<Row>(
      this.influx.vitals.database,
      `SELECT time, temperature_c
       FROM ${VITALS_MEASUREMENT}
       WHERE sensor = 'cabinet' AND time >= now() - INTERVAL '${seconds} seconds'
       ORDER BY time ASC`,
    )
    return rows.map((row) => ({
      at: new Date(toIso(row['time'])).getTime(),
      value: toNumber(row['temperature_c']),
    }))
  }

  async coinRateSeries(windowMs: number): Promise<SeriesPoint[]> {
    const seconds = Math.max(1, Math.round(windowMs / 1_000))
    const rows = await this.store.query<Row>(
      this.influx.events.database,
      `SELECT date_bin(INTERVAL '10 seconds', time, TIMESTAMP '1970-01-01T00:00:00Z') AS bucket,
              COUNT(*) AS inserts
       FROM ${EVENT_MEASUREMENT}
       WHERE type = 'coin_inserted' AND time >= now() - INTERVAL '${seconds} seconds'
       GROUP BY bucket
       ORDER BY bucket ASC`,
    )
    return rows.map((row) => ({
      at: new Date(toIso(row['bucket'])).getTime(),
      value: Math.round(toNumber(row['inserts'])),
    }))
  }

  async recentEvents(limit: number): Promise<EventView[]> {
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)))
    const rows = await this.store.query<Row>(
      this.influx.events.database,
      // InfluxDB 3 creates tag columns lazily, so naming optional tags in the projection
      // fails on a fresh database. `*` keeps the query valid and the mapper tolerates
      // absent fields; the order and limit stay stable.
      `SELECT * FROM ${EVENT_MEASUREMENT} ORDER BY time DESC LIMIT ${safeLimit}`,
    )
    return rows.map((row) => ({
      at: toIso(row['time']),
      type: String(row['type'] ?? 'unknown'),
      value: Math.round(toNumber(row['value_cents'])) / 100,
      quantity: Math.round(toNumber(row['quantity'])),
      code: toOptionalString(row['code']),
      productId: toOptionalString(row['product_id']),
    }))
  }

  async coinInsertHistory(windowMs = this.coinWindowMs): Promise<CoinInsert[]> {
    const seconds = Math.max(1, Math.round(windowMs / 1_000))
    const rows = await this.store.query<Row>(
      this.influx.events.database,
      `SELECT time, value_cents
       FROM ${EVENT_MEASUREMENT}
       WHERE type = 'coin_inserted' AND time >= now() - INTERVAL '${seconds} seconds'
       ORDER BY time ASC`,
    )
    return rows.map((row) => ({
      at: Date.parse(toIso(row['time'])),
      valueCents: Math.round(toNumber(row['value_cents'])),
    }))
  }

  private event(
    type: string,
    at: number,
    fields: Readonly<Record<string, number>>,
    tags: Readonly<Record<string, string>> = {},
  ): void {
    this.writer.record(this.influx.events.database, {
      measurement: EVENT_MEASUREMENT,
      tags: { type, ...tags },
      fields: {
        value_cents: 0,
        quantity: 1,
        credit_cents: 0,
        revenue_cents: 0,
        ...fields,
      },
      at,
    })
  }
}
