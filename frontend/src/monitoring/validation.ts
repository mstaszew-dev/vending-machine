import { ShapeError } from '../validation'
import type {
  EventsResponse,
  ExcursionResult,
  FloodResult,
  LatestTemperature,
  MonitoringAlert,
  MonitoringCapabilities,
  MonitoringEvent,
  MonitoringSignal,
  SeriesResponse,
  TsdbLevel,
  TsdbStatus,
} from './types'

/**
 * Runtime checks for the monitoring read models. The machine client already narrows its
 * payloads at the network boundary; the monitoring documents need the same treatment so a
 * schema drift becomes one readable error instead of `NaN` on a chart.
 */

type Data = Record<string, unknown>

const LEVELS: readonly TsdbLevel[] = ['ok', 'warning', 'exceeded']
const SIGNALS: readonly MonitoringSignal[] = ['temperature', 'coin_rate']

function record(value: unknown, what: string): Data {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ShapeError(`${what} is not an object`)
  }
  return value as Data
}

function num(data: Data, key: string, what: string): number {
  const value = data[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ShapeError(`${what}.${key} is not a number`)
  }
  return value
}

function integer(data: Data, key: string, what: string): number {
  const value = num(data, key, what)
  if (!Number.isInteger(value)) {
    throw new ShapeError(`${what}.${key} is not an integer`)
  }
  return value
}

function money(data: Data, key: string, what: string): number {
  const value = num(data, key, what)
  if (value < 0) {
    throw new ShapeError(`${what}.${key} is negative`)
  }
  return value
}

function text(data: Data, key: string, what: string): string {
  const value = data[key]
  if (typeof value !== 'string') {
    throw new ShapeError(`${what}.${key} is not a string`)
  }
  return value
}

function bool(data: Data, key: string, what: string): boolean {
  const value = data[key]
  if (typeof value !== 'boolean') {
    throw new ShapeError(`${what}.${key} is not a boolean`)
  }
  return value
}

function list(data: Data, key: string, what: string): unknown[] {
  const value = data[key]
  if (!Array.isArray(value)) {
    throw new ShapeError(`${what}.${key} is not an array`)
  }
  return value
}

function optionalText(data: Data, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' ? value : undefined
}

function parseTsdb(value: unknown): TsdbStatus {
  const data = record(value, 'tsdb')
  const level = data['level']
  if (!LEVELS.includes(level as TsdbLevel)) {
    throw new ShapeError('tsdb.level is not a known size level')
  }
  return {
    reachable: bool(data, 'reachable', 'tsdb'),
    bytes: integer(data, 'bytes', 'tsdb'),
    maxBytes: integer(data, 'maxBytes', 'tsdb'),
    level: level as TsdbLevel,
    queuedPoints: integer(data, 'queuedPoints', 'tsdb'),
    droppedPoints: integer(data, 'droppedPoints', 'tsdb'),
  }
}

function parseDatabases(value: unknown): MonitoringCapabilities['databases'] {
  const data = record(value, 'databases')
  const vitals = record(data['vitals'], 'databases.vitals')
  const events = record(data['events'], 'databases.events')
  return {
    vitals: { retention: text(vitals, 'retention', 'databases.vitals') },
    events: { retention: text(events, 'retention', 'databases.events') },
  }
}

function parseSimulation(value: unknown): MonitoringCapabilities['simulation'] {
  const data = record(value, 'simulation')
  return {
    enabled: bool(data, 'enabled', 'simulation'),
    intervalMs: integer(data, 'intervalMs', 'simulation'),
  }
}

export function parseCapabilities(value: unknown): MonitoringCapabilities {
  const data = record(value, 'capabilities')
  return {
    backend: text(data, 'backend', 'capabilities'),
    signals: list(data, 'signals', 'capabilities').map((signal) => {
      if (typeof signal !== 'string') {
        throw new ShapeError('capabilities.signals must contain strings')
      }
      return signal
    }),
    databases: parseDatabases(data['databases']),
    simulation: parseSimulation(data['simulation']),
    tsdb: parseTsdb(data['tsdb']),
  }
}

function parseTemperature(value: unknown): LatestTemperature {
  const data = record(value, 'temperature')
  return {
    temperatureC: num(data, 'temperatureC', 'temperature'),
    setpointC: num(data, 'setpointC', 'temperature'),
    humidityPct: num(data, 'humidityPct', 'temperature'),
    at: text(data, 'at', 'temperature'),
  }
}

function parseAlert(value: unknown): MonitoringAlert {
  const data = record(value, 'alert')
  const alert: MonitoringAlert = {
    code: text(data, 'code', 'alert'),
    at: num(data, 'at', 'alert'),
    message: text(data, 'message', 'alert'),
  }
  const temperatureC = data['temperatureC']
  if (temperatureC === undefined) {
    return alert
  }
  if (typeof temperatureC !== 'number' || !Number.isFinite(temperatureC)) {
    throw new ShapeError('alert.temperatureC is not a number')
  }
  return { ...alert, temperatureC }
}

export function parseSummary(value: unknown) {
  const data = record(value, 'summary')
  const coins = record(data['coins'], 'summary.coins')
  const machine = record(data['machine'], 'summary.machine')
  const alert = data['alert']
  return {
    temperature: data['temperature'] === null ? null : parseTemperature(data['temperature']),
    coins: {
      insertsLastMinute: integer(coins, 'insertsLastMinute', 'summary.coins'),
      valueLastMinute: money(coins, 'valueLastMinute', 'summary.coins'),
      hopperInserted: money(coins, 'hopperInserted', 'summary.coins'),
      hopperCapacity: money(coins, 'hopperCapacity', 'summary.coins'),
    },
    machine: {
      credit: money(machine, 'credit', 'summary.machine'),
      totalRevenue: money(machine, 'totalRevenue', 'summary.machine'),
      unitsSold: integer(machine, 'unitsSold', 'summary.machine'),
    },
    alert: alert === null || alert === undefined ? null : parseAlert(alert),
    tsdb: parseTsdb(data['tsdb']),
    streamSubscribers: integer(data, 'streamSubscribers', 'summary'),
  }
}

export function parseSeries(value: unknown): SeriesResponse {
  const data = record(value, 'series')
  const signal = data['signal']
  if (!SIGNALS.includes(signal as MonitoringSignal)) {
    throw new ShapeError('series.signal is not a known signal')
  }
  return {
    signal: signal as MonitoringSignal,
    rangeSeconds: integer(data, 'rangeSeconds', 'series'),
    points: list(data, 'points', 'series').map((point) => {
      const entry = record(point, 'series point')
      return {
        at: num(entry, 'at', 'series point'),
        value: num(entry, 'value', 'series point'),
      }
    }),
  }
}

export function parseEvents(value: unknown): EventsResponse {
  const data = record(value, 'events')
  return {
    events: list(data, 'events', 'events').map((event) => {
      const entry = record(event, 'event')
      const parsed: MonitoringEvent = {
        at: text(entry, 'at', 'event'),
        type: text(entry, 'type', 'event'),
        value: money(entry, 'value', 'event'),
        quantity: integer(entry, 'quantity', 'event'),
      }
      const code = optionalText(entry, 'code')
      const productId = optionalText(entry, 'productId')
      return {
        ...parsed,
        ...(code === undefined ? {} : { code }),
        ...(productId === undefined ? {} : { productId }),
      }
    }),
  }
}

export function parseExcursion(value: unknown): ExcursionResult {
  const data = record(value, 'excursion')
  return {
    seconds: integer(data, 'seconds', 'excursion'),
    until: text(data, 'until', 'excursion'),
  }
}

export function parseFloodResult(value: unknown): FloodResult {
  const data = record(value, 'flood result')
  const result: FloodResult = {
    attempted: integer(data, 'attempted', 'flood result'),
    accepted: integer(data, 'accepted', 'flood result'),
    rejected: integer(data, 'rejected', 'flood result'),
  }
  const code = optionalText(data, 'code')
  return code === undefined ? result : { ...result, code }
}
