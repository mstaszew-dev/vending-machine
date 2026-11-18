import { describe, expect, it } from 'vitest'
import { ShapeError } from '../validation'
import {
  parseCapabilities,
  parseEvents,
  parseFloodResult,
  parseSeries,
  parseSummary,
} from './validation'

const TSDB = {
  reachable: true,
  bytes: 1024,
  maxBytes: 67_108_864,
  level: 'ok',
  queuedPoints: 0,
  droppedPoints: 0,
}

const CAPABILITIES = {
  backend: 'nestjs',
  signals: ['temperature', 'coin_rate', 'events'],
  databases: { vitals: { retention: '1h' }, events: { retention: '7d' } },
  simulation: { enabled: true, intervalMs: 2_000 },
  tsdb: TSDB,
}

const SUMMARY = {
  temperature: {
    temperatureC: 5.4,
    setpointC: 6,
    humidityPct: 41.2,
    at: '2026-11-18T10:00:00.000Z',
  },
  coins: {
    insertsLastMinute: 3,
    valueLastMinute: 6,
    hopperInserted: 6,
    hopperCapacity: 50,
  },
  machine: { credit: 6, totalRevenue: 0, unitsSold: 0 },
  alert: null,
  tsdb: TSDB,
  streamSubscribers: 1,
}

describe('monitoring validation', () => {
  it('parses a capability document', () => {
    const parsed = parseCapabilities(CAPABILITIES)

    expect(parsed.backend).toBe('nestjs')
    expect(parsed.signals).toEqual(['temperature', 'coin_rate', 'events'])
    expect(parsed.databases.vitals.retention).toBe('1h')
    expect(parsed.tsdb.level).toBe('ok')
  })

  it('accepts every storage level the NestJS size guard emits', () => {
    for (const level of ['ok', 'warning', 'exceeded'] as const) {
      expect(
        parseCapabilities({ ...CAPABILITIES, tsdb: { ...TSDB, level } }).tsdb.level,
      ).toBe(level)
      expect(parseSummary({ ...SUMMARY, tsdb: { ...TSDB, level } }).tsdb.level).toBe(level)
    }
  })

  it('rejects a capability document with an unknown size level', () => {
    expect(() =>
      parseCapabilities({ ...CAPABILITIES, tsdb: { ...TSDB, level: 'nope' } }),
    ).toThrow(ShapeError)
  })

  it('rejects a capability document without signals', () => {
    expect(() => parseCapabilities({ ...CAPABILITIES, signals: 'all' })).toThrow(
      ShapeError,
    )
  })

  it('parses a summary with a temperature reading', () => {
    const parsed = parseSummary(SUMMARY)

    expect(parsed.temperature?.temperatureC).toBe(5.4)
    expect(parsed.coins.hopperCapacity).toBe(50)
    expect(parsed.alert).toBeNull()
  })

  it('parses a summary without a temperature reading', () => {
    const parsed = parseSummary({ ...SUMMARY, temperature: null })

    expect(parsed.temperature).toBeNull()
  })

  it('parses an alert with its optional temperature', () => {
    const parsed = parseSummary({
      ...SUMMARY,
      alert: {
        code: 'TEMP_HIGH',
        at: 1_700_000_000_000,
        message: 'hot',
        temperatureC: 9.5,
      },
    })

    expect(parsed.alert?.code).toBe('TEMP_HIGH')
    expect(parsed.alert?.temperatureC).toBe(9.5)
  })

  it('rejects a summary with a non-numeric temperature', () => {
    expect(() =>
      parseSummary({ ...SUMMARY, temperature: { temperatureC: 'warm' } }),
    ).toThrow(ShapeError)
  })

  it('parses a series and rejects non-finite points', () => {
    const parsed = parseSeries({
      signal: 'temperature',
      rangeSeconds: 900,
      points: [{ at: 1_700_000_000_000, value: 5.5 }],
    })
    expect(parsed.points).toHaveLength(1)
    expect(parsed.rangeSeconds).toBe(900)

    expect(() =>
      parseSeries({
        signal: 'temperature',
        rangeSeconds: 900,
        points: [{ at: 1_700_000_000_000, value: Number.NaN }],
      }),
    ).toThrow(ShapeError)
  })

  it('rejects a series with an unknown signal', () => {
    expect(() =>
      parseSeries({ signal: 'bogus', rangeSeconds: 900, points: [] }),
    ).toThrow(ShapeError)
  })

  it('parses events with optional code and product id', () => {
    const parsed = parseEvents({
      events: [
        {
          at: '2026-11-18T10:00:00.000Z',
          type: 'coin_inserted',
          value: 0.5,
          quantity: 1,
        },
        {
          at: '2026-11-18T10:00:01.000Z',
          type: 'insert_rejected',
          value: 0.05,
          quantity: 1,
          code: 'COIN_RATE_EXCEEDED',
        },
      ],
    })

    expect(parsed.events).toHaveLength(2)
    expect(parsed.events[1]?.code).toBe('COIN_RATE_EXCEEDED')
    expect(parsed.events[0]?.productId).toBeUndefined()
  })

  it('parses the flood result and keeps an optional code', () => {
    expect(
      parseFloodResult({ attempted: 25, accepted: 20, rejected: 5, code: 'COIN_RATE_EXCEEDED' }),
    ).toEqual({ attempted: 25, accepted: 20, rejected: 5, code: 'COIN_RATE_EXCEEDED' })
    expect(parseFloodResult({ attempted: 5, accepted: 5, rejected: 0 })).toEqual({
      attempted: 5,
      accepted: 5,
      rejected: 0,
    })
  })
})
