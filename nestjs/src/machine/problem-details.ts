import { HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import type { MachineErrorCode } from './machine-error'
import { MachineError } from './machine-error'

export type RequestErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_REQUEST'
  | 'TSDB_UNAVAILABLE'
  | 'NOT_FOUND'

export interface ProblemDetails {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail: string
  readonly instance: string
  readonly code: string
  readonly retryAfterSeconds?: number
}

const STATUS_BY_CODE: Record<MachineErrorCode, number> = {
  INVALID_COIN: 400,
  INVALID_QUANTITY: 400,
  INVALID_REQUEST: 400,
  UNKNOWN_PRODUCT: 404,
  INSUFFICIENT_STOCK: 409,
  INSUFFICIENT_CREDIT: 409,
  SLOT_CAPACITY_EXCEEDED: 409,
  COIN_RATE_EXCEEDED: 409,
  HOPPER_FULL: 409,
}

const TITLE_BY_STATUS: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
}

export function statusForCode(code: MachineErrorCode): number {
  return STATUS_BY_CODE[code]
}

/**
 * Client-caused failure that is not a machine rule: malformed JSON, a failed DTO check, or
 * an unavailable time-series database. Keeps the same problem shape as domain errors.
 */
export class RequestError extends Error {
  readonly status: number

  constructor(
    readonly code: RequestErrorCode,
    message: string,
    status?: number,
  ) {
    super(message)
    this.name = 'RequestError'
    this.status = status ?? (code === 'TSDB_UNAVAILABLE' ? 503 : code === 'NOT_FOUND' ? 404 : 400)
  }
}

function baseProblem(
  status: number,
  code: string,
  detail: string,
  instance: string,
): ProblemDetails {
  return {
    type: 'about:blank',
    title: TITLE_BY_STATUS[status] ?? 'Internal Server Error',
    status,
    detail,
    instance,
    code,
  }
}

export function problemFromMachineError(
  error: MachineError,
  instance: string,
): ProblemDetails {
  const status = statusForCode(error.code)
  const problem = baseProblem(status, error.code, error.message, instance)
  return error.details.retryAfterSeconds === undefined
    ? problem
    : { ...problem, retryAfterSeconds: error.details.retryAfterSeconds }
}

export function problemFromAny(error: unknown, instance: string): ProblemDetails {
  if (error instanceof MachineError) {
    return problemFromMachineError(error, instance)
  }
  if (error instanceof RequestError) {
    return baseProblem(error.status, error.code, error.message, instance)
  }
  if (error instanceof HttpException) {
    const status = error.getStatus()
    const response = error.getResponse()
    const detail =
      typeof response === 'string'
        ? response
        : ((response as { message?: string | string[] }).message ?? error.message)
    return baseProblem(
      status,
      status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
      Array.isArray(detail) ? detail.join(', ') : detail,
      instance,
    )
  }
  return baseProblem(500, 'INTERNAL_ERROR', 'The machine hit an unexpected error', instance)
}

/** Global filter: every failure the API can produce is an RFC 9457 problem with a `code`. */
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<{ originalUrl?: string; url: string }>()
    const response = context.getResponse<Response>()
    const problem = problemFromAny(error, request.originalUrl ?? request.url)

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem)
  }
}
