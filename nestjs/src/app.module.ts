import type { DynamicModule, Provider } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { Module } from '@nestjs/common'
import type { AppConfig } from './config/app-config'
import { loadAppConfig } from './config/app-config'
import { BootstrapService } from './bootstrap.service'
import { HealthController } from './health/health.controller'
import { MachineController } from './machine/machine.controller'
import { MachineService } from './machine/machine.service'
import { ProblemDetailsFilter } from './machine/problem-details'
import { VendingMachine } from './machine/vending-machine'
import { CircuitBreaker } from './metrics/circuit-breaker'
import { InfluxTimeSeriesStore } from './metrics/influx-store'
import { MetricsService } from './metrics/metrics-service'
import { MetricsWriter } from './metrics/metrics-writer'
import { SizeGuard } from './metrics/size-guard'
import { TemperatureService } from './metrics/temperature-service'
import { mulberry32, TemperatureSimulator } from './metrics/temperature-simulator'
import type { TimeSeriesStore } from './metrics/time-series'
import { VitalsMonitor } from './metrics/vitals-monitor'
import { MonitoringController } from './monitoring/monitoring.controller'
import { MonitoringService } from './monitoring/monitoring.service'
import { MonitoringStream } from './monitoring/monitoring-stream'
import { APP_CONFIG, CLOCK, TIME_SERIES_STORE } from './tokens'

export interface AppModuleOptions {
  readonly config?: AppConfig
  readonly store?: TimeSeriesStore
  readonly clock?: () => number
}

/**
 * Manual wiring instead of decorator scanning: every dependency is visible in one list,
 * and integration tests can swap the time-series port without monkey-patching.
 */
@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const config = options.config ?? loadAppConfig()
    const clock = options.clock ?? (() => Date.now())
    const store = options.store ?? new InfluxTimeSeriesStore({
      url: config.influx.url,
      token: config.influx.token,
      timeoutMs: config.influx.timeoutMs,
    })

    const providers: Provider[] = [
      { provide: APP_CONFIG, useValue: config },
      { provide: CLOCK, useValue: clock },
      { provide: TIME_SERIES_STORE, useValue: store },
      { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      { provide: VendingMachine, useFactory: () => new VendingMachine(config.machine, clock) },
      {
        provide: MonitoringStream,
        useFactory: () => new MonitoringStream(),
      },
      {
        provide: CircuitBreaker,
        useFactory: () => new CircuitBreaker({ failureThreshold: 3, openMs: 10_000 }, clock),
      },
      {
        provide: MetricsWriter,
        useFactory: (timeSeries: TimeSeriesStore, breaker: CircuitBreaker) =>
          new MetricsWriter(timeSeries, breaker, {
            maxQueue: 1_000,
            batchSize: 100,
            flushIntervalMs: 500,
          }),
        inject: [TIME_SERIES_STORE, CircuitBreaker],
      },
      {
        provide: MetricsService,
        useFactory: (timeSeries: TimeSeriesStore, writer: MetricsWriter) =>
          new MetricsService(
            timeSeries,
            writer,
            config.influx,
            clock,
            config.machine.coinWindow.windowMs,
          ),
        inject: [TIME_SERIES_STORE, MetricsWriter],
      },
      {
        provide: MachineService,
        useFactory: (machine: VendingMachine, metrics: MetricsService, stream: MonitoringStream) =>
          new MachineService(machine, metrics, stream, clock),
        inject: [VendingMachine, MetricsService, MonitoringStream],
      },
      {
        provide: TemperatureSimulator,
        useFactory: () =>
          new TemperatureSimulator(config.temperature, mulberry32(Date.now() % 2 ** 32)),
      },
      {
        provide: VitalsMonitor,
        useFactory: () =>
          new VitalsMonitor({
            minC: config.temperature.minC,
            maxC: config.temperature.maxC,
            consecutiveSamples: 3,
          }),
      },
      {
        provide: TemperatureService,
        useFactory: (
          simulator: TemperatureSimulator,
          monitor: VitalsMonitor,
          metrics: MetricsService,
          stream: MonitoringStream,
        ) =>
          new TemperatureService(simulator, monitor, metrics, stream, config.simulation, clock),
        inject: [TemperatureSimulator, VitalsMonitor, MetricsService, MonitoringStream],
      },
      {
        provide: SizeGuard,
        useFactory: () => new SizeGuard(config.influx.dataDir, config.tsdb.maxBytes),
      },
      {
        provide: MonitoringService,
        useFactory: (
          metrics: MetricsService,
          machine: MachineService,
          temperature: TemperatureService,
          timeSeries: TimeSeriesStore,
          sizeGuard: SizeGuard,
          writer: MetricsWriter,
          stream: MonitoringStream,
        ) =>
          new MonitoringService(
            metrics,
            machine,
            temperature,
            timeSeries,
            sizeGuard,
            writer,
            stream,
            config,
            clock,
          ),
        inject: [
          MetricsService,
          MachineService,
          TemperatureService,
          TIME_SERIES_STORE,
          SizeGuard,
          MetricsWriter,
          MonitoringStream,
        ],
      },
      BootstrapService,
    ]

    return {
      module: AppModule,
      controllers: [MachineController, MonitoringController, HealthController],
      providers,
    }
  }
}
