import type {
  MachineState,
  ProductGroup,
  ProblemDetails,
  PurchaseResult,
  ReturnedCredit,
} from './types'

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

const PRODUCT_GROUPS: readonly ProductGroup[] = [
  'PERSONAL_HYGIENE',
  'FACE',
  'PHOTO',
  'TEXTILE',
  'HOUSEHOLD',
]

function asInteger(record: Record<string, unknown>, key: string, what: string): number {
  const value = asNumber(record, key, what)
  if (!Number.isInteger(value)) {
    throw new ShapeError(`${what}.${key} is not an integer`)
  }
  return value
}

function asMoney(record: Record<string, unknown>, key: string, what: string): number {
  const value = asNumber(record, key, what)
  if (value < 0) {
    throw new ShapeError(`${what}.${key} is negative`)
  }
  return value
}

function asGroup(record: Record<string, unknown>, key: string, what: string): ProductGroup {
  const value = record[key]
  if (!PRODUCT_GROUPS.includes(value as ProductGroup)) {
    throw new ShapeError(`${what}.${key} is not a known product group`)
  }
  return value as ProductGroup
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
    id: asInteger(record, 'id', 'product'),
    name: asString(record, 'name', 'product'),
    group: asGroup(record, 'group', 'product'),
    price: asMoney(record, 'price', 'product'),
    stock: asInteger(record, 'stock', 'product'),
    capacity: asInteger(record, 'capacity', 'product'),
    unitsSold: asInteger(record, 'unitsSold', 'product'),
  }
}

function parseHopper(value: unknown): MachineState['hopper'] {
  const record = asRecord(value, 'hopper')
  return {
    inserted: asMoney(record, 'inserted', 'hopper'),
    capacity: asMoney(record, 'capacity', 'hopper'),
  }
}

function parseCoinWindow(value: unknown): MachineState['coinWindow'] {
  const record = asRecord(value, 'coinWindow')
  return {
    inserts: asInteger(record, 'inserts', 'coinWindow'),
    value: asMoney(record, 'value', 'coinWindow'),
    windowSeconds: asNumber(record, 'windowSeconds', 'coinWindow'),
  }
}

export function parseMachineState(value: unknown): MachineState {
  const record = asRecord(value, 'machine')
  const products = asArray(record, 'products', 'machine').map(parseProduct)
  const acceptedCoins = asArray(record, 'acceptedCoins', 'machine').map((coin) => {
    if (typeof coin !== 'number' || !Number.isFinite(coin) || coin <= 0) {
      throw new ShapeError('machine.acceptedCoins must contain positive numbers')
    }
    return coin
  })
  // Both extras are optional: the Java backend answers without them, and the UI must keep
  // working against either backend.
  const hopper = record.hopper === undefined ? undefined : parseHopper(record.hopper)
  const coinWindow =
    record.coinWindow === undefined ? undefined : parseCoinWindow(record.coinWindow)
  return {
    credit: asMoney(record, 'credit', 'machine'),
    totalRevenue: asMoney(record, 'totalRevenue', 'machine'),
    products,
    acceptedCoins,
    ...(hopper === undefined ? {} : { hopper }),
    ...(coinWindow === undefined ? {} : { coinWindow }),
  }
}

export function parsePurchaseResult(value: unknown): PurchaseResult {
  const record = asRecord(value, 'purchase')
  return {
    total: asMoney(record, 'total', 'purchase'),
    change: asMoney(record, 'change', 'purchase'),
    remainingCredit: asMoney(record, 'remainingCredit', 'purchase'),
    items: asArray(record, 'items', 'purchase').map((item) => {
      const entry = asRecord(item, 'purchase item')
      return {
        productId: asInteger(entry, 'productId', 'purchase item'),
        name: asString(entry, 'name', 'purchase item'),
        quantity: asInteger(entry, 'quantity', 'purchase item'),
        unitPrice: asMoney(entry, 'unitPrice', 'purchase item'),
        lineTotal: asMoney(entry, 'lineTotal', 'purchase item'),
      }
    }),
  }
}

export function parseReturnedCredit(value: unknown): ReturnedCredit {
  const record = asRecord(value, 'returned credit')
  return { returned: asMoney(record, 'returned', 'returned credit') }
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
