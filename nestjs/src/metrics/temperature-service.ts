import type { MonitoringStream } from '../monitoring/monitoring-stream'
import type { MetricsService } from './metrics-service'
import type { TemperatureSimulator, VitalsSample } from './temperature-simulator'
import type { VitalsMonitor } from './vitals-monitor'

export interface TemperatureServiceOptions {
  readonly enabled: boolean
  readonly intervalMs: number
}

export interface ExcursionWindow {
  readonly seconds: number
  readonly until: string
}

/**
 * Drives the simulated cabinet sensor. Sampling, persisting and alerting happen in one tick
 * so the chart, the event log and the alert can never disagree about what the sensor said.
 */
export class TemperatureService {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly simulator: TemperatureSimulator,
    private readonly monitor: VitalsMonitor,
    private readonly metrics: MetricsService,
    private readonly stream: MonitoringStream,
    private readonly options: TemperatureServiceOptions,
    private readonly clock: () => number = Date.now,
  ) {}

  start(): void {
    if (!this.options.enabled || this.timer !== null) return
    // The writer owns its own flush interval; sampling must not start a second one.
    this.timer = setInterval(() => {
      this.tick()
    }, this.options.intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  running(): boolean {
    return this.timer !== null
  }

  tick(): VitalsSample {
    const sample = this.simulator.next(this.clock())
    this.metrics.recordTemperature(sample)
    this.stream.publish({
      kind: 'vitals',
      data: {
        at: sample.at,
        temperatureC: sample.temperatureC,
        humidityPct: sample.humidityPct,
        setpointC: sample.setpointC,
        compressorOn: sample.compressorOn,
      },
    })

    const alert = this.monitor.observe(sample)
    if (alert !== null) {
      this.metrics.recordAlert(alert.code, alert.at, alert.temperatureC)
      this.stream.publish({
        kind: 'alert',
        data: {
          code: alert.code,
          at: alert.at,
          temperatureC: alert.temperatureC,
          message: alert.message,
        },
      })
    }
    return sample
  }

  beginExcursion(seconds: number): ExcursionWindow {
    const now = this.clock()
    this.simulator.beginExcursion(now, seconds * 1_000)
    return { seconds, until: new Date(now + seconds * 1_000).toISOString() }
  }
}
