import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatClock,
  formatCount,
  formatEuro,
  formatTemperature,
} from './format'

describe('monitoring formatters', () => {
  it('prints temperatures and counts in German notation', () => {
    expect(formatTemperature(5.4)).toBe('5,4 °C')
    expect(formatTemperature(-2)).toBe('-2 °C')
    expect(formatCount(1234)).toBe('1.234')
  })

  it('scales the storage budget through B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(4_096)).toBe('4 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })

  it('formats a clock time and keeps an unparsable stamp readable', () => {
    expect(formatClock('2026-11-18T10:00:05.000Z')).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(formatClock('not-a-date')).toBe('not-a-date')
  })

  it('re-exports the money formatter', () => {
    expect(formatEuro(12.5)).toContain('12,50')
  })
})
