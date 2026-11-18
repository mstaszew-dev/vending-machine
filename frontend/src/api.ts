import { ApiError } from './errors'
import type { MachineState, PurchaseResult, ReturnedCredit } from './types'
import {
  parseMachineState,
  parseProblemDetails,
  parsePurchaseResult,
  parseReturnedCredit,
  ShapeError,
} from './validation'

const REQUEST_TIMEOUT_MS = 10_000

async function request<T>(
  path: string,
  parse: (value: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/machine${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      // a vending machine that never answers must not leave the UI busy forever
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(
        `The machine did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`,
        504,
      )
    }
    throw error
  }

  if (!response.ok) {
    const problem = parseProblemDetails(await response.json().catch(() => null))
    throw new ApiError(
      problem.detail ?? `Request failed with status ${response.status}`,
      response.status,
      problem.code,
    )
  }

  try {
    return parse(await response.json())
  } catch (error) {
    if (error instanceof ShapeError) {
      throw new ApiError(`Unexpected response from the machine: ${error.message}`, 500)
    }
    throw error
  }
}

export function getMachine(): Promise<MachineState> {
  return request('', parseMachineState)
}

export function insertCredit(amount: number): Promise<MachineState> {
  return request('/credit', parseMachineState, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}

export function returnCredit(): Promise<ReturnedCredit> {
  return request('/credit/return', parseReturnedCredit, { method: 'POST' })
}

export function purchase(
  items: { productId: number; quantity: number }[],
): Promise<PurchaseResult> {
  return request('/purchase', parsePurchaseResult, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export function refill(
  items: { productId: number; quantity: number }[],
): Promise<MachineState> {
  return request('/refill', parseMachineState, {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

/**
 * Empties the coin box. Only the NestJS backend has this route; the staff view only shows
 * the action when the machine state reports a hopper.
 */
export function collect(): Promise<MachineState> {
  return request('/collect', parseMachineState, { method: 'POST' })
}

export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }
  if (error instanceof TypeError) {
    return 'Cannot reach the machine. Is the configured backend running?'
  }
  return error instanceof Error ? error.message : 'Something went wrong'
}
