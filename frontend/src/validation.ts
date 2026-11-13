import type { MachineState, ProblemDetails, PurchaseResult, ReturnedCredit } from './types'

/**
 * Runtime checks at the network boundary. TypeScript types vanish at runtime, so every
 * response is narrowed from `unknown` before the UI trusts it. A mismatch becomes one
 * readable error instead of `undefined is not a function` deep inside a component.
 */

export class ShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShapeError'
  }
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ShapeError(`${what} is not an object`)
  }
  return value as Record<string, unknown>
}

function asNumber(record: Record<string, unknown>, key: string, what: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ShapeError(`${what}.${key} is not a number`)
  }
  return value
}

function asString(record: Record<string, unknown>, key: string, what: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new ShapeError(`${what}.${key} is not a string`)
  }
  return value
}

function asArray(record: Record<string, unknown>, key: string, what: string): unknown[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    throw new ShapeError(`${what}.${key} is not an array`)
  }
  return value
}

function parseProduct(value: unknown): MachineState['products'][number] {
  const record = asRecord(value, 'product')
  return {
    id: asNumber(record, 'id', 'product'),
    name: asString(record, 'name', 'product'),
    group: asString(record, 'group', 'product') as MachineState['products'][number]['group'],
    price: asNumber(record, 'price', 'product'),
    stock: asNumber(record, 'stock', 'product'),
    capacity: asNumber(record, 'capacity', 'product'),
    unitsSold: asNumber(record, 'unitsSold', 'product'),
  }
}

export function parseMachineState(value: unknown): MachineState {
  const record = asRecord(value, 'machine')
  const products = asArray(record, 'products', 'machine').map(parseProduct)
  const acceptedCoins = asArray(record, 'acceptedCoins', 'machine').map((coin) => {
    if (typeof coin !== 'number') {
      throw new ShapeError('machine.acceptedCoins must contain numbers')
    }
    return coin
  })
  return {
    credit: asNumber(record, 'credit', 'machine'),
    totalRevenue: asNumber(record, 'totalRevenue', 'machine'),
    products,
    acceptedCoins,
  }
}

export function parsePurchaseResult(value: unknown): PurchaseResult {
  const record = asRecord(value, 'purchase')
  return {
    total: asNumber(record, 'total', 'purchase'),
    change: asNumber(record, 'change', 'purchase'),
    remainingCredit: asNumber(record, 'remainingCredit', 'purchase'),
    items: asArray(record, 'items', 'purchase').map((item) => {
      const entry = asRecord(item, 'purchase item')
      return {
        productId: asNumber(entry, 'productId', 'purchase item'),
        name: asString(entry, 'name', 'purchase item'),
        quantity: asNumber(entry, 'quantity', 'purchase item'),
        unitPrice: asNumber(entry, 'unitPrice', 'purchase item'),
        lineTotal: asNumber(entry, 'lineTotal', 'purchase item'),
      }
    }),
  }
}

export function parseReturnedCredit(value: unknown): ReturnedCredit {
  const record = asRecord(value, 'returned credit')
  return { returned: asNumber(record, 'returned', 'returned credit') }
}

export function parseProblemDetails(value: unknown): ProblemDetails {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const record = value as Record<string, unknown>
  return {
    detail: typeof record.detail === 'string' ? record.detail : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    status: typeof record.status === 'number' ? record.status : undefined,
  }
}
