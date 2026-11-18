import { HttpStatus } from '@nestjs/common'
import { MachineError } from './machine-error'
import {
  RequestError,
  problemFromAny,
  problemFromMachineError,
  statusForCode,
} from './problem-details'

describe('problem details', () => {
  it('maps every machine error code to the Java status', () => {
    expect(statusForCode('UNKNOWN_PRODUCT')).toBe(HttpStatus.NOT_FOUND)
    expect(statusForCode('INSUFFICIENT_STOCK')).toBe(HttpStatus.CONFLICT)
    expect(statusForCode('INSUFFICIENT_CREDIT')).toBe(HttpStatus.CONFLICT)
    expect(statusForCode('SLOT_CAPACITY_EXCEEDED')).toBe(HttpStatus.CONFLICT)
    expect(statusForCode('COIN_RATE_EXCEEDED')).toBe(HttpStatus.CONFLICT)
    expect(statusForCode('HOPPER_FULL')).toBe(HttpStatus.CONFLICT)
    expect(statusForCode('INVALID_COIN')).toBe(HttpStatus.BAD_REQUEST)
    expect(statusForCode('INVALID_QUANTITY')).toBe(HttpStatus.BAD_REQUEST)
    expect(statusForCode('INVALID_REQUEST')).toBe(HttpStatus.BAD_REQUEST)
  })

  it('turns a domain error into an RFC 9457 problem', () => {
    const problem = problemFromMachineError(
      new MachineError('COIN_RATE_EXCEEDED', 'Too many coins', { retryAfterSeconds: 60 }),
      '/api/machine/credit',
    )

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'Too many coins',
      instance: '/api/machine/credit',
      code: 'COIN_RATE_EXCEEDED',
      retryAfterSeconds: 60,
    })
  })

  it('keeps the Java titles for the shared codes', () => {
    expect(problemFromMachineError(new MachineError('UNKNOWN_PRODUCT', 'x'), '/a').title).toBe(
      'Not Found',
    )
    expect(problemFromMachineError(new MachineError('INVALID_COIN', 'x'), '/a').title).toBe(
      'Bad Request',
    )
  })

  it('passes a request error through unchanged', () => {
    const problem = problemFromAny(
      new RequestError('VALIDATION_ERROR', 'items must not be empty'),
      '/api/machine/purchase',
    )

    expect(problem).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      detail: 'items must not be empty',
      instance: '/api/machine/purchase',
    })
  })

  it('maps an unexpected exception to a generic 500 without leaking internals', () => {
    const problem = problemFromAny(new Error('database password is hunter2'), '/api/machine')

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      detail: 'The machine hit an unexpected error',
      instance: '/api/machine',
      code: 'INTERNAL_ERROR',
    })
  })
})
