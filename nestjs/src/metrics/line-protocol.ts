export type FieldValue = number | boolean | string

export interface TimeSeriesPoint {
  readonly measurement: string
  readonly tags?: Readonly<Record<string, string>>
  readonly fields: Readonly<Record<string, FieldValue>>
  /** Epoch milliseconds. */
  readonly at: number
}

const MEASUREMENT_ESCAPES = /[, ]/g
const KEY_ESCAPES = /[,= ]/g

function escapeMeasurement(value: string): string {
  return value.replace(MEASUREMENT_ESCAPES, (character) => `\\${character}`)
}

function escapeKey(value: string): string {
  return value.replace(KEY_ESCAPES, (character) => `\\${character}`)
}

function escapeStringValue(value: string): string {
  return value.replace(/["\\]/g, (character) => `\\${character}`)
}

function encodeFieldValue(key: string, value: FieldValue): string {
  if (typeof value === 'boolean') {
    return `${escapeKey(key)}=${value ? 'true' : 'false'}`
  }
  if (typeof value === 'string') {
    return `${escapeKey(key)}="${escapeStringValue(value)}"`
  }
  if (!Number.isFinite(value)) {
    throw new Error(`field '${key}' must be a finite number`)
  }
  return `${escapeKey(key)}=${value}`
}

/**
 * Minimal line-protocol encoder. Every numeric field is written as a float so a column
 * never changes type between writes: InfluxDB rejects a schema conflict, and a value that
 * is sometimes `50i` and sometimes `50.5` is exactly that conflict.
 */
export function encodeLine(point: TimeSeriesPoint): string {
  if (point.measurement.trim() === '') {
    throw new Error('measurement must not be empty')
  }
  if (!Number.isInteger(point.at)) {
    throw new Error('timestamp must be an integer number of milliseconds')
  }

  const entries = Object.entries(point.fields)
  if (entries.length === 0) {
    throw new Error('a point needs at least one field')
  }

  const tags = Object.entries(point.tags ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      if (key === '' || value === '') {
        throw new Error('tag keys and values must not be empty')
      }
      return `,${escapeKey(key)}=${escapeKey(value)}`
    })
    .join('')

  const fields = entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => encodeFieldValue(key, value))
    .join(',')

  return `${escapeMeasurement(point.measurement)}${tags} ${fields} ${point.at}`
}

export function encodeLines(points: readonly TimeSeriesPoint[]): string {
  return points.map(encodeLine).join('\n')
}
