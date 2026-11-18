export interface TemperatureSimulatorOptions {
  readonly minC: number
  readonly maxC: number
  readonly setpointC: number
  readonly stepC: number
  readonly humidityBase: number
  readonly excursionC: number
}

export interface VitalsSample {
  readonly at: number
  readonly temperatureC: number
  readonly humidityPct: number
  readonly setpointC: number
  readonly compressorOn: boolean
  readonly excursion: boolean
}

/** Deterministic PRNG so tests can pin the simulated stream. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * Simulated cabinet sensor: a random walk inside the cooling band, plus a staff-triggerable
 * excursion so the alert path and the dashboard can be demonstrated without a real fridge.
 */
export class TemperatureSimulator {
  private temperatureC: number
  private humidityPct: number
  private excursionUntil = 0

  constructor(
    private readonly options: TemperatureSimulatorOptions,
    private readonly random: () => number,
  ) {
    this.temperatureC = options.setpointC
    this.humidityPct = options.humidityBase
  }

  beginExcursion(at: number, durationMs: number): void {
    this.excursionUntil = at + durationMs
  }

  next(at: number, forcedTemperatureC?: number): VitalsSample {
    const excursion = at < this.excursionUntil
    if (forcedTemperatureC !== undefined) {
      this.temperatureC = forcedTemperatureC
    } else if (excursion) {
      // a failing door seal jumps out of the band immediately, then wobbles
      this.temperatureC =
        this.options.maxC + this.options.excursionC * (0.5 + 0.5 * this.random())
    } else {
      const drift = (this.random() - 0.5) * this.options.stepC
      this.temperatureC = Math.min(
        this.options.maxC,
        Math.max(this.options.minC, this.temperatureC + drift),
      )
      // pull back towards the setpoint so the walk does not hug a limit for ever
      this.temperatureC += (this.options.setpointC - this.temperatureC) * 0.1
    }

    this.humidityPct = Math.min(
      65,
      Math.max(25, this.humidityPct + (this.random() - 0.5) * 1.5),
    )

    return {
      at,
      temperatureC: Number(this.temperatureC.toFixed(2)),
      humidityPct: Number(this.humidityPct.toFixed(1)),
      setpointC: this.options.setpointC,
      compressorOn: this.temperatureC > this.options.setpointC,
      excursion,
    }
  }
}
