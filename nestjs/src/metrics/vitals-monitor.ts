import type { VitalsSample } from './temperature-simulator'

export type VitalsAlertCode = 'TEMP_HIGH' | 'TEMP_LOW'

export interface VitalsAlert {
  readonly code: VitalsAlertCode
  readonly at: number
  readonly temperatureC: number
  readonly message: string
}

export interface VitalsMonitorOptions {
  readonly minC: number
  readonly maxC: number
  readonly consecutiveSamples: number
}

export interface VitalsMonitorState {
  readonly highRun: number
  readonly lowRun: number
  readonly active: VitalsAlertCode | null
}

type Direction = 'high' | 'low' | null

/**
 * Turns a raw temperature stream into at most one alert per excursion. A single noisy sample
 * is normal for a fridge; three in a row outside the band is worth telling staff about, and
 * repeating the alert every two seconds would only train them to ignore it.
 */
export class VitalsMonitor {
  private highRun = 0
  private lowRun = 0
  private active: VitalsAlertCode | null = null

  constructor(private readonly options: VitalsMonitorOptions) {}

  observe(sample: VitalsSample): VitalsAlert | null {
    if (!Number.isFinite(sample.temperatureC)) {
      return null
    }

    const direction: Direction =
      sample.temperatureC > this.options.maxC
        ? 'high'
        : sample.temperatureC < this.options.minC
          ? 'low'
          : null

    if (direction === null) {
      this.highRun = 0
      this.lowRun = 0
      this.active = null
      return null
    }

    if (direction === 'high') {
      this.highRun += 1
      this.lowRun = 0
    } else {
      this.lowRun += 1
      this.highRun = 0
    }

    const code: VitalsAlertCode = direction === 'high' ? 'TEMP_HIGH' : 'TEMP_LOW'
    const run = direction === 'high' ? this.highRun : this.lowRun
    if (run < this.options.consecutiveSamples || this.active === code) {
      return null
    }

    this.active = code
    if (direction === 'high') {
      this.highRun = 0
    } else {
      this.lowRun = 0
    }
    const limit = direction === 'high' ? this.options.maxC : this.options.minC
    const comparison = direction === 'high' ? 'above' : 'below'
    return {
      code,
      at: sample.at,
      temperatureC: sample.temperatureC,
      message: `Cabinet temperature ${sample.temperatureC} C is ${comparison} the ${limit} C limit`,
    }
  }

  state(): VitalsMonitorState {
    return { highRun: this.highRun, lowRun: this.lowRun, active: this.active }
  }
}
