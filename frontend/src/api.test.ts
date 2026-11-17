import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeError,
  getMachine,
  insertCredit,
  purchase,
  refill,
  returnCredit,
} from './api'
import { ApiError } from './errors'
import { makeMachineState } from './test/fixtures'

const mockFetch = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('machine API client', () => {
  it('loads and validates the machine state', async () => {
    const state = makeMachineState()
    mockFetch.mockResolvedValueOnce(jsonResponse(state))

    await expect(getMachine()).resolves.toEqual(state)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/machine',
      expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    )
  })

  it('sends a coin amount and parses the updated state', async () => {
    const state = makeMachineState({ credit: 0.5 })
    mockFetch.mockResolvedValueOnce(jsonResponse(state))

    await expect(insertCredit(0.5)).resolves.toEqual(state)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/machine/credit',
      expect.objectContaining({ method: 'POST', body: '{"amount":0.5}' }),
    )
  })

  it('returns the credited amount from the refund endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ returned: 1.2 }))

    await expect(returnCredit()).resolves.toEqual({ returned: 1.2 })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/machine/credit/return',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('sends purchase lines and parses the receipt', async () => {
    const items = [{ productId: 1, quantity: 2 }]
    const receipt = {
      total: 1.1,
      change: 0.9,
      remainingCredit: 0,
      items: [
        {
          productId: 1,
          name: 'Balea shower gel',
          quantity: 2,
          unitPrice: 0.55,
          lineTotal: 1.1,
        },
      ],
    }
    mockFetch.mockResolvedValueOnce(jsonResponse(receipt))

    await expect(purchase(items)).resolves.toEqual(receipt)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/machine/purchase',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ items }) }),
    )
  })

  it('sends refill lines and parses the new machine state', async () => {
    const items = [{ productId: 1, quantity: 5 }]
    const state = makeMachineState()
    mockFetch.mockResolvedValueOnce(jsonResponse(state))

    await expect(refill(items)).resolves.toEqual(state)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/machine/refill',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ items }) }),
    )
  })

  it('preserves the server message, status, and stable code on HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: 'Only one unit is left', code: 'INSUFFICIENT_STOCK' }, 409),
    )

    await expect(purchase([{ productId: 1, quantity: 2 }])).rejects.toMatchObject({
      message: 'Only one unit is left',
      status: 409,
      code: 'INSUFFICIENT_STOCK',
    })
  })

  it('uses the HTTP status when an error body is not valid JSON', async () => {
    mockFetch.mockResolvedValueOnce(new Response('not json', { status: 503 }))

    await expect(getMachine()).rejects.toMatchObject({
      message: 'Request failed with status 503',
      status: 503,
    })
  })

  it('converts an invalid successful response into a machine API error', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ products: 'not a list' }))

    await expect(getMachine()).rejects.toMatchObject({
      name: 'ApiError',
      message: expect.stringContaining('Unexpected response from the machine:'),
      status: 500,
    })
  })

  it('does not disguise invalid JSON from a successful response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('not json'))

    await expect(getMachine()).rejects.toBeInstanceOf(SyntaxError)
  })

  it('turns request timeouts into a gateway timeout error', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))

    await expect(getMachine()).rejects.toMatchObject({
      message: 'The machine did not answer within 10 seconds',
      status: 504,
    })
  })

  it('leaves other network errors intact for the UI to describe', async () => {
    const failure = new TypeError('fetch failed')
    mockFetch.mockRejectedValueOnce(failure)

    await expect(getMachine()).rejects.toBe(failure)
    expect(describeError(failure)).toBe(
      'Cannot reach the machine. Is the backend running on port 8080?',
    )
  })

  it('describes API, generic, and non-error failures', () => {
    expect(describeError(new ApiError('sold out', 409, 'INSUFFICIENT_STOCK'))).toBe('sold out')
    expect(describeError(new Error('unexpected'))).toBe('unexpected')
    expect(describeError('unexpected')).toBe('Something went wrong')
  })
})
