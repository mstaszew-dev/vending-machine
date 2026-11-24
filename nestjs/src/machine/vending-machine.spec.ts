import { MachineError, type MachineErrorCode } from './machine-error'
import {
  DEFAULT_MACHINE_OPTIONS,
  VendingMachine,
  type MachineOptions,
} from './vending-machine'

const T0 = 1_700_000_000_000

const OPEN_LIMITS: MachineOptions = {
  ...DEFAULT_MACHINE_OPTIONS,
  coinWindow: { windowMs: 60_000, maxInserts: 1_000, maxCents: 1_000_000 },
}

function machine(now = { value: T0 }, options: MachineOptions = OPEN_LIMITS): VendingMachine {
  return new VendingMachine(options, () => now.value)
}

function codeOf(action: () => unknown): MachineErrorCode {
  try {
    action()
  } catch (error) {
    if (error instanceof MachineError) return error.code
    throw error
  }
  throw new Error('expected the action to throw a MachineError')
}

describe('VendingMachine', () => {
  it('starts with eight slots, configured stock and capacity', () => {
    const view = machine().view()

    expect(view.products).toHaveLength(8)
    expect(view.products[0]).toMatchObject({ id: 1, stock: 3, capacity: 10, unitsSold: 0 })
    expect(view.acceptedCoins).toEqual([0.05, 0.1, 0.2, 0.5, 1, 2])
    expect(view.credit).toBe(0)
    expect(view.totalRevenue).toBe(0)
    expect(view.hopper).toEqual({ inserted: 0, capacity: 50 })
  })

  it('clamps initial stock to the slot capacity', () => {
    const view = machine(undefined, {
      ...OPEN_LIMITS,
      capacityPerSlot: 4,
      initialStockPerSlot: 9,
    }).view()

    expect(view.products[0]).toMatchObject({ stock: 4, capacity: 4 })
  })

  it('adds an accepted coin to credit and to the hopper', () => {
    const view = machine().insertCredit(50).view()

    expect(view.credit).toBe(0.5)
    expect(view.hopper.inserted).toBe(0.5)
  })

  it('rejects a coin the machine does not accept without side effects', () => {
    const subject = machine()

    expect(codeOf(() => subject.insertCredit(3))).toBe('INVALID_COIN')
    expect(subject.view().credit).toBe(0)
  })

  it('rejects an insert that would overflow the hopper', () => {
    const subject = machine(undefined, { ...OPEN_LIMITS, hopperCapacityCents: 100 })

    subject.insertCredit(50)

    expect(codeOf(() => subject.insertCredit(100))).toBe('HOPPER_FULL')
    expect(subject.view().credit).toBe(0.5)
    expect(subject.view().hopper.inserted).toBe(0.5)
  })

  it('rejects a burst above the rolling insert limit', () => {
    const now = { value: T0 }
    const subject = machine(now, {
      ...OPEN_LIMITS,
      coinWindow: { windowMs: 60_000, maxInserts: 3, maxCents: 100_000 },
    })

    subject.insertCredit(5)
    subject.insertCredit(5)
    subject.insertCredit(5)

    expect(codeOf(() => subject.insertCredit(5))).toBe('COIN_RATE_EXCEEDED')
    expect(subject.view().credit).toBe(0.15)
  })

  it('accepts coins again after the window has passed', () => {
    const now = { value: T0 }
    const subject = machine(now, {
      ...OPEN_LIMITS,
      coinWindow: { windowMs: 60_000, maxInserts: 3, maxCents: 100_000 },
    })
    subject.insertCredit(5)
    subject.insertCredit(5)
    subject.insertCredit(5)

    now.value = T0 + 60_001

    expect(subject.insertCredit(5).view().credit).toBe(0.2)
  })

  it('rejects a burst above the rolling value limit', () => {
    const subject = machine(undefined, {
      ...OPEN_LIMITS,
      coinWindow: { windowMs: 60_000, maxInserts: 100, maxCents: 300 },
    })

    subject.insertCredit(100)
    subject.insertCredit(100)
    subject.insertCredit(100)

    expect(codeOf(() => subject.insertCredit(100))).toBe('COIN_RATE_EXCEEDED')
  })

  it('returns the inserted credit on cancel', () => {
    const subject = machine()
    subject.insertCredit(100).insertCredit(50)

    expect(subject.returnCredit()).toBe(150)
    expect(subject.view().credit).toBe(0)
    expect(subject.view().hopper.inserted).toBe(1.5)
  })

  it('returns zero when there is nothing to return', () => {
    expect(machine().returnCredit()).toBe(0)
  })

  it('sells products and returns change', () => {
    const subject = machine()
    subject.insertCredit(200)

    const receipt = subject.purchase([{ productId: 1, quantity: 2 }])

    expect(receipt.total).toBe(1.1)
    expect(receipt.change).toBe(0.9)
    expect(receipt.remainingCredit).toBe(0)
    expect(receipt.items).toEqual([
      { productId: 1, name: 'Balea shower gel', quantity: 2, unitPrice: 0.55, lineTotal: 1.1 },
    ])
    expect(subject.view().products[0]).toMatchObject({ stock: 1, unitsSold: 2 })
    expect(subject.view().totalRevenue).toBe(1.1)
  })

  it('rejects a cart with an unknown product', () => {
    const subject = machine()
    subject.insertCredit(200)

    expect(codeOf(() => subject.purchase([{ productId: 99, quantity: 1 }]))).toBe('UNKNOWN_PRODUCT')
  })

  it.each([0, -1, 1.5])('rejects quantity %s', (quantity) => {
    const subject = machine()
    subject.insertCredit(200)

    expect(codeOf(() => subject.purchase([{ productId: 1, quantity }]))).toBe('INVALID_QUANTITY')
  })

  it('purchase with duplicate lines that are within stock succeeds, returns one summed receipt item, and deducts stock once', () => {
    const subject = machine()
    subject.insertCredit(200)

    const receipt = subject.purchase([
      { productId: 1, quantity: 2 },
      { productId: 1, quantity: 1 },
    ])

    expect(receipt.items).toEqual([
      { productId: 1, name: 'Balea shower gel', quantity: 3, unitPrice: 0.55, lineTotal: 1.65 },
    ])
    expect(receipt.total).toBe(1.65)
    expect(receipt.change).toBe(0.35)
    expect(subject.view().products[0]).toMatchObject({ stock: 0, unitsSold: 3 })
  })

  it('rejects a summed quantity beyond Number.MAX_SAFE_INTEGER with INVALID_QUANTITY', () => {
    const subject = machine()
    subject.insertCredit(200).insertCredit(200).insertCredit(100)

    expect(
      codeOf(() =>
        subject.purchase([
          { productId: 1, quantity: Number.MAX_SAFE_INTEGER },
          { productId: 1, quantity: 1 },
        ]),
      ),
    ).toBe('INVALID_QUANTITY')

    expect(subject.view().products[0]).toMatchObject({ stock: 3, unitsSold: 0 })
    expect(subject.view().credit).toBe(5)
  })

  it('rejects an empty cart', () => {
    expect(codeOf(() => machine().purchase([]))).toBe('INVALID_REQUEST')
  })

  it('rejects a cart that asks for more than the stock, changing nothing', () => {
    const subject = machine()
    subject.insertCredit(200).insertCredit(200).insertCredit(100)

    expect(
      codeOf(() =>
        subject.purchase([
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 5 },
        ]),
      ),
    ).toBe('INSUFFICIENT_STOCK')

    expect(subject.view().credit).toBe(5)
    expect(subject.view().products[1]).toMatchObject({ stock: 3, unitsSold: 0 })
  })

  it('purchase with two lines for the same product rejects the combined quantity with INSUFFICIENT_STOCK and leaves stock/credit unchanged', () => {
    const subject = machine()
    subject.insertCredit(200).insertCredit(200).insertCredit(100)

    expect(
      codeOf(() =>
        subject.purchase([
          { productId: 1, quantity: 2 },
          { productId: 1, quantity: 2 },
        ]),
      ),
    ).toBe('INSUFFICIENT_STOCK')

    expect(subject.view().products[0]).toMatchObject({ stock: 3, unitsSold: 0 })
    expect(subject.view().credit).toBe(5)
    expect(subject.view().totalRevenue).toBe(0)
  })

  it('rejects a purchase the credit does not cover, changing nothing', () => {
    const subject = machine()
    subject.insertCredit(50)

    expect(codeOf(() => subject.purchase([{ productId: 5, quantity: 1 }]))).toBe(
      'INSUFFICIENT_CREDIT',
    )
    expect(subject.view().products[4]).toMatchObject({ stock: 3, unitsSold: 0 })
    expect(subject.view().credit).toBe(0.5)
  })

  it('refills up to the slot capacity', () => {
    const subject = machine()
    subject.refill([{ productId: 1, quantity: 7 }])

    expect(subject.view().products[0]?.stock).toBe(10)
    expect(codeOf(() => subject.refill([{ productId: 1, quantity: 1 }]))).toBe(
      'SLOT_CAPACITY_EXCEEDED',
    )
  })

  it('refills all or nothing', () => {
    const subject = machine()

    expect(
      codeOf(() =>
        subject.refill([
          { productId: 1, quantity: 1 },
          { productId: 2, quantity: 100 },
        ]),
      ),
    ).toBe('SLOT_CAPACITY_EXCEEDED')

    expect(subject.view().products[0]?.stock).toBe(3)
  })

  it('refill with two lines for the same product rejects the combined quantity with SLOT_CAPACITY_EXCEEDED and leaves stock unchanged', () => {
    const subject = machine()

    expect(
      codeOf(() =>
        subject.refill([
          { productId: 1, quantity: 4 },
          { productId: 1, quantity: 4 },
        ]),
      ),
    ).toBe('SLOT_CAPACITY_EXCEEDED')

    expect(subject.view().products[0]?.stock).toBe(3)
  })

  it('collects the hopper without touching credit', () => {
    const subject = machine()
    subject.insertCredit(100)
    subject.insertCredit(200)

    expect(subject.collect()).toBe(300)
    expect(subject.view().hopper.inserted).toBe(0)
    expect(subject.view().credit).toBe(3)
  })

  it('keeps an accept/reject history of the window in the view', () => {
    const now = { value: T0 }
    const subject = machine(now)

    subject.insertCredit(50)
    subject.insertCredit(100)

    expect(subject.view().coinWindow).toEqual({ inserts: 2, value: 1.5, windowSeconds: 60 })
  })
})
