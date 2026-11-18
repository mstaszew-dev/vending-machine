import { parseInsertCredit, parsePositions } from './dto'
import { RequestError } from './problem-details'

function errorOf(action: () => unknown): RequestError {
  try {
    action()
  } catch (error) {
    if (error instanceof RequestError) return error
    throw error
  }
  throw new Error('expected a RequestError')
}

describe('request DTOs', () => {
  it('accepts a euro amount and keeps its decimals', () => {
    expect(parseInsertCredit({ amount: 0.5 })).toBe(0.5)
  })

  it('accepts zero and negative amounts, because the coin rule owns that decision', () => {
    expect(parseInsertCredit({ amount: 0 })).toBe(0)
    expect(parseInsertCredit({ amount: -1 })).toBe(-1)
  })

  it('rejects a missing amount with the Java validation wording', () => {
    const error = errorOf(() => parseInsertCredit({}))
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toBe('amount must not be null')
  })

  it('rejects a body that is not an object', () => {
    expect(errorOf(() => parseInsertCredit(null)).code).toBe('INVALID_REQUEST')
    expect(errorOf(() => parseInsertCredit([])).code).toBe('INVALID_REQUEST')
    expect(errorOf(() => parseInsertCredit({ amount: '0.5' })).code).toBe('INVALID_REQUEST')
  })

  it('parses cart positions', () => {
    expect(parsePositions({ items: [{ productId: 1, quantity: 2 }] })).toEqual([
      { productId: 1, quantity: 2 },
    ])
  })

  it('rejects an empty or missing cart', () => {
    expect(errorOf(() => parsePositions({ items: [] })).message).toBe('items must not be empty')
    expect(errorOf(() => parsePositions({})).message).toBe('items must not be empty')
  })

  it('rejects a non-positive product id or quantity', () => {
    expect(
      errorOf(() => parsePositions({ items: [{ productId: 0, quantity: 1 }] })).message,
    ).toContain('productId')
    expect(
      errorOf(() => parsePositions({ items: [{ productId: 1, quantity: 0 }] })).message,
    ).toContain('quantity')
    expect(
      errorOf(() => parsePositions({ items: [{ productId: 1, quantity: 1.5 }] })).message,
    ).toContain('quantity')
  })

  it('collects every field error in one message', () => {
    const error = errorOf(() =>
      parsePositions({ items: [{ productId: -1, quantity: -2 }] }),
    )
    expect(error.message).toBe(
      'items[0].productId must be greater than 0, items[0].quantity must be greater than 0',
    )
  })

  it('rejects malformed item shapes', () => {
    expect(errorOf(() => parsePositions({ items: 'nope' })).code).toBe('INVALID_REQUEST')
    expect(errorOf(() => parsePositions({ items: [null] })).code).toBe('INVALID_REQUEST')
    expect(
      errorOf(() => parsePositions({ items: [{ productId: '1', quantity: 1 }] })).code,
    ).toBe('INVALID_REQUEST')
  })
})
