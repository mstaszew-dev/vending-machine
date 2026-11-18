import { ACCEPTED_COIN_CENTS, isAcceptedCoin } from '../catalog/coin'
import { CATALOG } from '../catalog/catalog'
import type { Product } from '../catalog/catalog'
import { CoinLedger, type CoinInsert, type CoinWindowPolicy } from './coin-ledger'
import { MachineError } from './machine-error'
import { centsToEuros } from './money'

export interface MachineOptions {
  readonly capacityPerSlot: number
  readonly initialStockPerSlot: number
  readonly hopperCapacityCents: number
  readonly coinWindow: CoinWindowPolicy
}

export const DEFAULT_MACHINE_OPTIONS: MachineOptions = {
  capacityPerSlot: 10,
  initialStockPerSlot: 3,
  hopperCapacityCents: 5_000,
  coinWindow: { windowMs: 60_000, maxInserts: 20, maxCents: 2_500 },
}

export interface LineRequest {
  readonly productId: number
  readonly quantity: number
}

export interface ProductView {
  readonly id: number
  readonly name: string
  readonly group: string
  readonly price: number
  readonly stock: number
  readonly capacity: number
  readonly unitsSold: number
}

export interface MachineView {
  readonly credit: number
  readonly products: readonly ProductView[]
  readonly acceptedCoins: readonly number[]
  readonly totalRevenue: number
  readonly hopper: { readonly inserted: number; readonly capacity: number }
  readonly coinWindow: {
    readonly inserts: number
    readonly value: number
    readonly windowSeconds: number
  }
}

export interface PurchaseReceipt {
  readonly total: number
  readonly change: number
  readonly items: readonly {
    readonly productId: number
    readonly name: string
    readonly quantity: number
    readonly unitPrice: number
    readonly lineTotal: number
  }[]
  readonly remainingCredit: number
}

interface Slot {
  readonly product: Product
  stock: number
  unitsSold: number
}

/**
 * The machine aggregate: plain TypeScript, no Nest, no HTTP, no telemetry. Operations are
 * synchronous, so each one is atomic in Node's single-threaded runtime; purchase and refill
 * validate every line before touching stock or money, matching the Java aggregate.
 */
export class VendingMachine {
  private readonly slots: Slot[]
  private readonly ledger: CoinLedger
  private creditCents = 0
  private revenueCents = 0
  private hopperCents = 0

  constructor(
    private readonly options: MachineOptions = DEFAULT_MACHINE_OPTIONS,
    private readonly clock: () => number = Date.now,
  ) {
    this.slots = CATALOG.map((product) => ({
      product,
      stock: options.initialStockPerSlot,
      unitsSold: 0,
    }))
    this.ledger = new CoinLedger(options.coinWindow, clock)
  }

  /** Boot warm-up: recover the rolling window from durable telemetry. */
  seedCoinHistory(history: readonly CoinInsert[]): void {
    this.ledger.seed(history)
  }

  insertCredit(valueCents: number): this {
    if (!isAcceptedCoin(valueCents)) {
      throw new MachineError(
        'INVALID_COIN',
        `Accepted coins are ${ACCEPTED_COIN_CENTS.map((coin) => `${coin} cents`).join(', ')}`,
      )
    }
    const at = this.clock()
    if (this.hopperCents + valueCents > this.options.hopperCapacityCents) {
      throw new MachineError(
        'HOPPER_FULL',
        `The coin box holds ${centsToEuros(this.options.hopperCapacityCents)} EUR and must be collected`,
      )
    }
    if (this.ledger.wouldExceed(at, valueCents)) {
      const { windowMs, maxInserts, maxCents } = this.options.coinWindow
      throw new MachineError(
        'COIN_RATE_EXCEEDED',
        `Too many coins: at most ${maxInserts} inserts or ${centsToEuros(maxCents)} EUR per ${
          windowMs / 1_000
        } seconds`,
        { retryAfterSeconds: Math.ceil(windowMs / 1_000) },
      )
    }

    this.creditCents += valueCents
    this.hopperCents += valueCents
    this.ledger.record({ at, valueCents })
    return this
  }

  returnCredit(): number {
    const returned = this.creditCents
    this.creditCents = 0
    return returned
  }

  purchase(lines: readonly LineRequest[]): PurchaseReceipt {
    const plan = this.plan(lines)
    const totalCents = plan.reduce((sum, line) => sum + line.lineTotalCents, 0)
    if (this.creditCents < totalCents) {
      throw new MachineError(
        'INSUFFICIENT_CREDIT',
        `The cart costs ${centsToEuros(totalCents)} EUR but only ${centsToEuros(
          this.creditCents,
        )} EUR was inserted`,
      )
    }

    for (const line of plan) {
      line.slot.stock -= line.quantity
      line.slot.unitsSold += line.quantity
    }
    const changeCents = this.creditCents - totalCents
    this.creditCents = 0
    this.revenueCents += totalCents

    return {
      total: centsToEuros(totalCents),
      change: centsToEuros(changeCents),
      remainingCredit: 0,
      items: plan.map((line) => ({
        productId: line.slot.product.id,
        name: line.slot.product.name,
        quantity: line.quantity,
        unitPrice: centsToEuros(line.slot.product.priceCents),
        lineTotal: centsToEuros(line.lineTotalCents),
      })),
    }
  }

  refill(lines: readonly LineRequest[]): this {
    if (lines.length === 0) {
      throw new MachineError('INVALID_REQUEST', 'Send at least one product position')
    }
    for (const line of lines) {
      const slot = this.slotFor(line)
      if (slot.stock + line.quantity > this.options.capacityPerSlot) {
        throw new MachineError(
          'SLOT_CAPACITY_EXCEEDED',
          `Slot for '${slot.product.name}' holds ${this.options.capacityPerSlot} units, ${line.quantity} more would overflow`,
        )
      }
    }
    for (const line of lines) {
      this.slotFor(line).stock += line.quantity
    }
    return this
  }

  collect(): number {
    const collected = this.hopperCents
    this.hopperCents = 0
    return collected
  }

  view(): MachineView {
    const now = this.clock()
    const window = this.ledger.snapshot(now)
    return {
      credit: centsToEuros(this.creditCents),
      totalRevenue: centsToEuros(this.revenueCents),
      acceptedCoins: ACCEPTED_COIN_CENTS.map((coin) => centsToEuros(coin)),
      hopper: {
        inserted: centsToEuros(this.hopperCents),
        capacity: centsToEuros(this.options.hopperCapacityCents),
      },
      coinWindow: {
        inserts: window.inserts,
        value: centsToEuros(window.cents),
        windowSeconds: this.options.coinWindow.windowMs / 1_000,
      },
      products: this.slots.map((slot) => ({
        id: slot.product.id,
        name: slot.product.name,
        group: slot.product.group,
        price: centsToEuros(slot.product.priceCents),
        stock: slot.stock,
        capacity: this.options.capacityPerSlot,
        unitsSold: slot.unitsSold,
      })),
    }
  }

  private plan(lines: readonly LineRequest[]): {
    slot: Slot
    quantity: number
    lineTotalCents: number
  }[] {
    if (lines.length === 0) {
      throw new MachineError('INVALID_REQUEST', 'Send at least one product position')
    }
    return lines.map((line) => {
      const slot = this.slotFor(line)
      if (slot.stock < line.quantity) {
        throw new MachineError(
          'INSUFFICIENT_STOCK',
          `Only ${slot.stock} unit(s) of '${slot.product.name}' left, ${line.quantity} requested`,
        )
      }
      return {
        slot,
        quantity: line.quantity,
        lineTotalCents: slot.product.priceCents * line.quantity,
      }
    })
  }

  private slotFor(line: LineRequest): Slot {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new MachineError(
        'INVALID_QUANTITY',
        `Quantity must be a whole number above zero, got ${line.quantity}`,
      )
    }
    const slot = this.slots.find((candidate) => candidate.product.id === line.productId)
    if (!slot) {
      throw new MachineError('UNKNOWN_PRODUCT', `There is no product with id ${line.productId}`)
    }
    return slot
  }
}
