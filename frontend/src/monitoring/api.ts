import { ApiError } from '../errors'
import { parseProblemDetails, ShapeError } from '../validation'
import type {
  EventsResponse,
  ExcursionResult,
  FloodResult,
  MonitoringCapabilities,
  MonitoringSignal,
  MonitoringSummary,
  SeriesResponse,
} from './types'
import {
  parseCapabilities,
  parseEvents,
  parseExcursion,
  parseFloodResult,
  parseSeries,
  parseSummary,
} from './validation'

const BASE = '/api/monitoring'
const REQUEST_TIMEOUT_MS = 10_000

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
      // monitoring must never leave a spinner running forever
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(
        `The backend did not answer within ${REQUEST_TIMEOUT_MS / 1000} seconds`,
        504,
      )
    }
    throw error
  }
}

async function parseResponse<T>(
  response: Response,
  parse: (value: unknown) => T,
): Promise<T> {
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
      throw new ApiError(`Unexpected response from the backend: ${error.message}`, 500)
    }
    throw error
  }
}

async function request<T>(
  path: string,
  parse: (value: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  return parseResponse(await send(path, init), parse)
}

/**
 * A null answer is the capability probe: the Java backend has no monitoring routes, so it
 * answers 404 and the tab explains that time-series monitoring needs the NestJS backend.
 * Any other failure is a real problem and keeps its status and code.
 */
export async function probeCapabilities(): Promise<MonitoringCapabilities | null> {
  const response = await send('/capabilities')
  if (response.status === 404) {
    return null
  }
  return parseResponse(response, parseCapabilities)
}

export function getSummary(): Promise<MonitoringSummary> {
  return request('/summary', parseSummary)
}

export function getSeries(
  signal: MonitoringSignal,
  range: string,
): Promise<SeriesResponse> {
  const query = new URLSearchParams({ signal, range })
  return request(`/series?${query.toString()}`, parseSeries)
}

export function getEvents(limit: number): Promise<EventsResponse> {
  const safe = Math.min(500, Math.max(1, Math.trunc(limit)))
  return request(`/events?limit=${safe}`, parseEvents)
}

export function simulateFlood(count: number): Promise<FloodResult> {
  return request('/simulate/flood', parseFloodResult, {
    method: 'POST',
    body: JSON.stringify({ count }),
  })
}

export function simulateExcursion(seconds: number): Promise<ExcursionResult> {
  return request('/simulate/excursion', parseExcursion, {
    method: 'POST',
    body: JSON.stringify({ seconds }),
  })
}
