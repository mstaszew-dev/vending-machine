import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type SizeLevel = 'ok' | 'warning' | 'exceeded'

export interface SizeStatus {
  readonly bytes: number
  readonly maxBytes: number
  readonly level: SizeLevel
}

/** Recursive byte count of the InfluxDB data directory, tolerant of a missing dir. */
export async function directoryBytes(dir: string): Promise<number> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }

  let total = 0
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      total += await directoryBytes(path)
    } else if (entry.isFile()) {
      const info = await stat(path).catch(() => null)
      total += info?.size ?? 0
    }
  }
  return total
}

/**
 * InfluxDB 3 Core cannot delete rows and retention is immutable per database, so "keep the
 * database small" is a budget we report honestly: warn at 80 %, report exceeded at 100 %.
 */
export class SizeGuard {
  constructor(
    private readonly dataDir: string,
    private readonly maxBytes: number,
    private readonly warnAt = 0.8,
  ) {}

  async status(): Promise<SizeStatus> {
    const bytes = await directoryBytes(this.dataDir)
    const level: SizeLevel =
      bytes >= this.maxBytes ? 'exceeded' : bytes >= this.maxBytes * this.warnAt ? 'warning' : 'ok'
    return { bytes, maxBytes: this.maxBytes, level }
  }
}
