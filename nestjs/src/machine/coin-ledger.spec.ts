import { CoinLedger, type CoinWindowPolicy } from './coin-ledger'

const POLICY: CoinWindowPolicy = {
  windowMs: 60_000,
  maxInserts: 20,
  maxCents: 2500,
}

const T0 = 1_700_000_000_000

function ledger(now = T0): CoinLedger {
  return new CoinLedger(POLICY, () => now)
}

describe('CoinLedger', () => {
  it('counts inserts and value inside the window', () => {
    const coins = ledger()
    coins.record({ at: T0, valueCents: 50 })
    coins.record({ at: T0 + 1_000, valueCents: 100 })

    expect(coins.snapshot(T0 + 2_000)).toEqual({ inserts: 2, cents: 150 })
  })

  it('drops entries older than the window', () => {
    const coins = ledger()
    coins.record({ at: T0, valueCents: 200 })

    expect(coins.snapshot(T0 + 59_999)).toEqual({ inserts: 1, cents: 200 })
    expect(coins.snapshot(T0 + 60_000)).toEqual({ inserts: 0, cents: 0 })
  })

  it('allows an insert that reaches the limit exactly', () => {
    const coins = ledger()
    for (let i = 0; i < 19; i += 1) {
      coins.record({ at: T0 + i, valueCents: 5 })
    }

    expect(coins.wouldExceed(T0 + 30_000, 5)).toBe(false)
  })

  it('rejects the insert that would exceed the insert limit', () => {
    const coins = ledger()
    for (let i = 0; i < 20; i += 1) {
      coins.record({ at: T0 + i, valueCents: 5 })
    }

    expect(coins.wouldExceed(T0 + 30_000, 5)).toBe(true)
  })

  it('rejects the insert that would exceed the value limit', () => {
    const coins = ledger()
    for (let i = 0; i < 12; i += 1) {
      coins.record({ at: T0 + i, valueCents: 200 })
    }

    expect(coins.snapshot(T0 + 30_000).cents).toBe(2400)
    expect(coins.wouldExceed(T0 + 30_000, 100)).toBe(false)
    expect(coins.wouldExceed(T0 + 30_000, 200)).toBe(true)
  })

  it('forgets a burst once the window has passed', () => {
    const coins = ledger()
    for (let i = 0; i < 25; i += 1) {
      coins.record({ at: T0, valueCents: 100 })
    }

    expect(coins.wouldExceed(T0 + 1_000, 100)).toBe(true)
    expect(coins.wouldExceed(T0 + 60_001, 100)).toBe(false)
  })

  it('seeds from history in any order without double counting', () => {
    const coins = ledger()
    coins.seed([
      { at: T0 + 2_000, valueCents: 50 },
      { at: T0, valueCents: 10 },
      { at: T0 - 90_000, valueCents: 200 },
    ])

    expect(coins.snapshot(T0 + 3_000)).toEqual({ inserts: 2, cents: 60 })
  })

  it('keeps memory bounded by pruning on record', () => {
    const coins = ledger()
    for (let i = 0; i < 100; i += 1) {
      coins.record({ at: T0 + i * 1_000, valueCents: 5 })
    }

    expect(coins.snapshot(T0 + 99_000).inserts).toBe(60)
  })

  it('clears on reset', () => {
    const coins = ledger()
    coins.record({ at: T0, valueCents: 50 })
    coins.reset()

    expect(coins.snapshot(T0)).toEqual({ inserts: 0, cents: 0 })
  })
})
