export type MachineErrorCode =
  | 'INVALID_COIN'
  | 'INVALID_QUANTITY'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_PRODUCT'
  | 'INSUFFICIENT_STOCK'
  | 'INSUFFICIENT_CREDIT'
  | 'SLOT_CAPACITY_EXCEEDED'
  | 'COIN_RATE_EXCEEDED'
  | 'HOPPER_FULL'

/**
 * Domain error. Controllers never build HTTP responses from strings: the code is the
 * stable contract the frontend branches on, the message is for humans.
 */
export class MachineError extends Error {
  constructor(
    readonly code: MachineErrorCode,
    message: string,
    readonly details: { retryAfterSeconds?: number } = {},
  ) {
    super(message)
    this.name = 'MachineError'
  }
}
