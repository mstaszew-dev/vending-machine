import type { TimeSeriesPoint } from './line-protocol'

/** A fresh database has no measurement table yet; that is an empty view, not an outage. */
export class MissingRelationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingRelationError'
  }
}

/**
 * InfluxDB 3 reports a missing measurement as `table 'public.iox.x' not found` (HTTP 400)
 * and a missing database as `database not found: x` (HTTP 404). A bare `Not found` means a
 * wrong endpoint or base URL, which must stay a real failure. Requiring a relation noun
 * next to the missing phrase keeps a coincidental "not found" in a 5xx message out too.
 */
const MISSING_RELATION =
  /\b(?:no such table|unknown table)\b|\b(?:table|measurement|database)\b[\s\S]{0,120}?\b(?:not found|does not exist)\b/i

/** Adapter seam: classify the provider's error body before it becomes a domain error. */
export function isMissingRelationDetail(detail: string): boolean {
  return MISSING_RELATION.test(detail)
}

export function isMissingRelation(error: unknown): boolean {
  if (error instanceof MissingRelationError) return true
  return error instanceof Error && isMissingRelationDetail(error.message)
}

/**
 * The seam between the machine and the time-series database. Everything above this
 * interface is testable without InfluxDB, and a version difference in the HTTP API only
 * touches the adapter.
 */
export interface TimeSeriesStore {
  write(database: string, points: readonly TimeSeriesPoint[]): Promise<void>
  query<T>(database: string, sql: string): Promise<T[]>
  ensureDatabase(database: string, retention: string): Promise<void>
  ping(): Promise<boolean>
}
