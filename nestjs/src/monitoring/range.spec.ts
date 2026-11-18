import { parseRange } from './range'

describe('parseRange', () => {
  it('parses the minute, hour and second forms the UI uses', () => {
    expect(parseRange('15m')).toBe(15 * 60 * 1_000)
    expect(parseRange('1h')).toBe(60 * 60 * 1_000)
    expect(parseRange('90s')).toBe(90 * 1_000)
  })

  it('treats a bare number as seconds', () => {
    expect(parseRange('30')).toBe(30_000)
  })

  it('rejects missing, malformed and zero ranges', () => {
    for (const value of ['', 'abc', '0m', '-5m', '15x']) {
      expect(() => parseRange(value)).toThrow('range')
    }
  })

  it('caps a range at six hours', () => {
    expect(parseRange('12h')).toBe(6 * 60 * 60 * 1_000)
  })
})
