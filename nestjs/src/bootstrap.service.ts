import { Inject, Injectable, Logger } from '@nestjs/common'
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import type { AppConfig } from './config/app-config'
import { MetricsService } from './metrics/metrics-service'
import { MetricsWriter } from './metrics/metrics-writer'
import { TemperatureService } from './metrics/temperature-service'
import { isMissingRelation, type TimeSeriesStore } from './metrics/time-series'
import { VendingMachine } from './machine/vending-machine'
import { MonitoringService } from './monitoring/monitoring.service'
import { APP_CONFIG, TIME_SERIES_STORE } from './tokens'

/**
 * Boot choreography: create the databases idempotently, recover the coin window from the
 * durable event log, then start the background writers. Every step is fail-open — a machine
 * that cannot reach its telemetry database still has to sell coffee at seven in the morning.
 */
@Injectable()
export class BootstrapService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BootstrapService.name)

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TIME_SERIES_STORE) private readonly store: TimeSeriesStore,
    private readonly machine: VendingMachine,
    private readonly metrics: MetricsService,
    private readonly writer: MetricsWriter,
    private readonly temperature: TemperatureService,
    private readonly monitoring: MonitoringService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDatabases()
    await this.warmCoinWindow()
    this.writer.start()
    this.temperature.start()
  }

  async onApplicationShutdown(): Promise<void> {
    this.temperature.stop()
    this.writer.stop()
    await this.writer.flush().catch(() => undefined)
  }

  private async ensureDatabases(): Promise<void> {
    const { vitals, events } = this.config.influx
    const results = await Promise.allSettled([
      this.store.ensureDatabase(vitals.database, vitals.retention),
      this.store.ensureDatabase(events.database, events.retention),
    ])
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `database setup failed, telemetry will retry later: ${String(result.reason)}`,
        )
      }
    }
  }

  private async warmCoinWindow(): Promise<void> {
    try {
      const history = await this.metrics.coinInsertHistory()
      this.machine.seedCoinHistory(history)
      if (history.length > 0) {
        this.logger.log(`recovered ${history.length} coin inserts from the last minute`)
      }
    } catch (error) {
      // an empty window is the safe default; the in-memory ledger still enforces the limit
      if (isMissingRelation(error)) {
        // a brand-new database has no table yet, which is expected on first boot
        this.logger.log('no coin history yet, the rate window starts empty')
      } else {
        this.monitoring.reportUnavailable(
          Date.now(),
          'Time-series database unavailable while warming the coin window',
        )
        this.logger.warn(`coin window warm-up skipped: ${String(error)}`)
      }
    }
  }
}
