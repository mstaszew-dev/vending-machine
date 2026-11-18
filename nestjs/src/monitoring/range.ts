import { RequestError } from '../machine/problem-details'

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3_600 }
const MAX_MS = 6 * 60 * 60 * 1_000

/**
 * Query-string ranges such as `15m` are friendlier than a millisecond count in a URL. A
 * bare number means seconds. Anything above six hours is clamped, because the shortest
 * retention (vitals, one hour) makes longer temperature windows empty noise.
 */
export function parseRange(value: string): number {
  const match = /^(\d+)([smh]?)$/i.exec(value.trim())
  if (!match) {
    throw new RequestError('VALIDATION_ERROR', `range must look like 15m, 1h or 90s, got '${value}'`)
  }
  const amount = Number(match[1])
  if (amount <= 0) {
    throw new RequestError('VALIDATION_ERROR', 'range must be greater than zero')
  }
  const unit = (match[2] ?? '').toLowerCase() || 's'
  const ms = amount * (UNIT_SECONDS[unit] ?? 1) * 1_000
  return Math.min(MAX_MS, ms)
}
