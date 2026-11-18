import { z } from 'zod'
import { eurosToCents } from '../machine/money'
import type { MachineOptions } from '../machine/vending-machine'

export interface InfluxConfig {
  readonly url: string
  readonly token: string
  readonly timeoutMs: number
  readonly dataDir: string
  readonly vitals: { readonly database: string; readonly retention: string }
  readonly events: { readonly database: string; readonly retention: string }
}

export interface TemperatureSimulatorConfig {
  readonly minC: number
  readonly maxC: number
  readonly setpointC: number
  readonly stepC: number
  readonly humidityBase: number
  readonly excursionC: number
}

export interface AppConfig {
  readonly port: number
  readonly machine: MachineOptions
  readonly influx: InfluxConfig
  readonly tsdb: { readonly maxBytes: number }
  readonly simulation: { readonly enabled: boolean; readonly intervalMs: number }
  readonly temperature: TemperatureSimulatorConfig
}

export type Env = Readonly<Record<string, string | undefined>>

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
}

export function parseSize(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(value.trim())
  if (!match) {
    throw new Error(`invalid size '${value}', use bytes or a unit such as 64mb`)
  }
  const unit = (match[2] ?? '').toLowerCase() || 'b'
  const multiplier = UNITS[unit]
  if (multiplier === undefined) {
    throw new Error(`unknown size unit '${unit}', use b, kb, mb or gb`)
  }
  return Math.round(Number(match[1]) * multiplier)
}

function numberFrom(env: Env, name: string, fallback: number, schema: z.ZodTypeAny): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${name} is invalid: ${parsed.error.issues[0]?.message ?? 'not a number'}`)
  }
  if (typeof parsed.data === 'number') return parsed.data
  throw new Error(`${name} is invalid`)
}

function eurosFrom(env: Env, name: string, fallbackCents: number): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallbackCents
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive euro amount`)
  }
  return eurosToCents(parsed)
}

function booleanFrom(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  throw new Error(`${name} must be true or false`)
}

const positiveInt = z.coerce.number().int().positive()
const positiveNumber = z.coerce.number().positive()

/**
 * One typed configuration object, validated once at boot. Unknown or unparsable values fail
 * with the variable name instead of surfacing as `NaN` deep inside a money calculation.
 */
export function loadAppConfig(env: Env = process.env): AppConfig {
  const temperatureMin = numberFrom(env, 'TEMPERATURE_MIN_C', 4, positiveNumber)
  const temperatureMax = numberFrom(env, 'TEMPERATURE_MAX_C', 8, positiveNumber)
  if (temperatureMin >= temperatureMax) {
    throw new Error('TEMPERATURE_MIN_C must be below TEMPERATURE_MAX_C')
  }

  return {
    port: numberFrom(env, 'PORT', 8081, positiveInt),
    machine: {
      capacityPerSlot: numberFrom(env, 'MACHINE_CAPACITY_PER_SLOT', 10, positiveInt),
      initialStockPerSlot: numberFrom(env, 'MACHINE_INITIAL_STOCK_PER_SLOT', 3, positiveInt),
      hopperCapacityCents: eurosFrom(env, 'HOPPER_CAPACITY_EUROS', 5_000),
      coinWindow: {
        windowMs:
          numberFrom(env, 'COIN_WINDOW_SECONDS', 60, positiveInt) * 1_000,
        maxInserts: numberFrom(env, 'COIN_MAX_INSERTS', 20, positiveInt),
        maxCents: eurosFrom(env, 'COIN_MAX_EUROS', 2_500),
      },
    },
    influx: {
      url: (env['INFLUX_URL'] ?? 'http://127.0.0.1:8181').replace(/\/+$/, ''),
      token: env['INFLUX_TOKEN'] ?? '',
      timeoutMs: numberFrom(env, 'INFLUX_TIMEOUT_MS', 2_000, positiveInt),
      dataDir: env['TSDB_DATA_DIR'] ?? '.data/influxdb3',
      vitals: {
        database: env['INFLUX_VITALS_DB'] ?? 'vitals',
        retention: env['INFLUX_VITALS_RETENTION'] ?? '1h',
      },
      events: {
        database: env['INFLUX_EVENTS_DB'] ?? 'events',
        retention: env['INFLUX_EVENTS_RETENTION'] ?? '7d',
      },
    },
    tsdb: {
      maxBytes: parseSize(env['TSDB_MAX_BYTES'] ?? '64mb'),
    },
    simulation: {
      enabled: booleanFrom(env, 'TEMPERATURE_SIMULATION', true),
      intervalMs: numberFrom(env, 'TEMPERATURE_INTERVAL_MS', 2_000, positiveInt),
    },
    temperature: {
      minC: temperatureMin,
      maxC: temperatureMax,
      setpointC: numberFrom(env, 'TEMPERATURE_SETPOINT_C', 6, positiveNumber),
      stepC: numberFrom(env, 'TEMPERATURE_STEP_C', 0.4, positiveNumber),
      humidityBase: numberFrom(env, 'TEMPERATURE_HUMIDITY_BASE', 40, positiveNumber),
      excursionC: numberFrom(env, 'TEMPERATURE_EXCURSION_C', 3, positiveNumber),
    },
  }
}
