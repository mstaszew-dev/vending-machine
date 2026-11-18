import { Controller, Get, Inject } from '@nestjs/common'
import type { TimeSeriesStore } from '../metrics/time-series'
import { TIME_SERIES_STORE } from '../tokens'

/**
 * `/health/live` answers while the process can serve a sale. `/health/ready` also reports
 * the database, but a dead database is deliberately not a failed readiness check: the
 * machine must keep selling during an observability outage, so `tsdb.reachable` is data,
 * not a gate.
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(TIME_SERIES_STORE) private readonly store: TimeSeriesStore) {}

  @Get('live')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) }
  }

  @Get('ready')
  async ready(): Promise<{
    status: 'ready'
    tsdb: { reachable: boolean }
  }> {
    return { status: 'ready', tsdb: { reachable: await this.store.ping() } }
  }
}
