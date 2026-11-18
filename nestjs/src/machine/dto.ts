import type { LineRequest } from './vending-machine'
import { RequestError } from './problem-details'

/**
 * Hand-written narrowing instead of decorator DTOs: the body arrives as `unknown`, every
 * failure carries the same problem shape as a domain error, and the messages that the
 * frontend and tests rely on stay in one place. The wording mirrors the Java Bean
 * Validation messages so both backends answer alike.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function parseInsertCredit(body: unknown): number {
  const record = asRecord(body)
  if (record === null) {
    throw new RequestError('INVALID_REQUEST', 'Request body is missing or malformed')
  }
  const amount = record['amount']
  if (amount === undefined || amount === null) {
    throw new RequestError('VALIDATION_ERROR', 'amount must not be null')
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new RequestError('INVALID_REQUEST', 'Request body is missing or malformed')
  }
  return amount
}

export function parsePositions(body: unknown): LineRequest[] {
  const record = asRecord(body)
  if (record === null) {
    throw new RequestError('INVALID_REQUEST', 'Request body is missing or malformed')
  }
  const items = record['items']
  if (items === undefined || items === null || (Array.isArray(items) && items.length === 0)) {
    throw new RequestError('VALIDATION_ERROR', 'items must not be empty')
  }
  if (!Array.isArray(items)) {
    throw new RequestError('INVALID_REQUEST', 'Request body is missing or malformed')
  }

  const problems: string[] = []
  const lines: LineRequest[] = items.map((item, index) => {
    const entry = asRecord(item)
    if (entry === null) {
      throw new RequestError('INVALID_REQUEST', 'Request body is missing or malformed')
    }
    const productId = entry['productId']
    const quantity = entry['quantity']
    if (typeof productId !== 'number' || typeof quantity !== 'number') {
      throw new RequestError('INVALID_REQUEST', 'Request body is missing or malformed')
    }

    if (!Number.isInteger(productId) || productId <= 0) {
      problems.push(`items[${index}].productId must be greater than 0`)
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      problems.push(`items[${index}].quantity must be greater than 0`)
    }
    return { productId, quantity }
  })

  if (problems.length > 0) {
    throw new RequestError('VALIDATION_ERROR', problems.join(', '))
  }
  return lines
}
