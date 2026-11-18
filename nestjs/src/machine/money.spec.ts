import { eurosToCents, centsToEuros, formatEuros } from './money'

describe('money', () => {
  it('converts a two-decimal amount to integer cents', () => {
    expect(eurosToCents(0.55)).toBe(55)
    expect(eurosToCents(7.95)).toBe(795)
    expect(eurosToCents(15.95)).toBe(1595)
    expect(eurosToCents(2)).toBe(200)
  })

  it('tolerates binary floating point noise within one micro-euro', () => {
    expect(eurosToCents(0.1 + 0.2)).toBe(30)
  })

  it('rejects amounts with more than two decimals', () => {
    expect(() => eurosToCents(1.234)).toThrow('at most two decimals')
  })

  it('rejects negative and non-finite amounts', () => {
    expect(() => eurosToCents(-1)).toThrow('negative')
    expect(() => eurosToCents(Number.NaN)).toThrow('finite')
    expect(() => eurosToCents(Number.POSITIVE_INFINITY)).toThrow('finite')
  })

  it('serialises cents back to a two-decimal euro number', () => {
    expect(centsToEuros(55)).toBe(0.55)
    expect(centsToEuros(1595)).toBe(15.95)
    expect(centsToEuros(0)).toBe(0)
    expect(centsToEuros(100)).toBe(1)
  })

  it('formats cents for humans', () => {
    expect(formatEuros(55)).toBe('0.55 EUR')
    expect(formatEuros(1595)).toBe('15.95 EUR')
  })
})
