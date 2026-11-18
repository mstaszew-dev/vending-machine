import { mulberry32, TemperatureSimulator } from './temperature-simulator'

const T0 = 1_700_000_000_000

function simulator(seed = 42): TemperatureSimulator {
  return new TemperatureSimulator(
    {
      minC: 4,
      maxC: 8,
      setpointC: 6,
      stepC: 0.4,
      humidityBase: 40,
      excursionC: 3,
    },
    mulberry32(seed),
  )
}

describe('TemperatureSimulator', () => {
  it('is deterministic for a given seed', () => {
    const first = simulator().next(T0)
    const second = simulator().next(T0)
    const other = simulator(7).next(T0)

    expect(first).toEqual(second)
    expect(first.temperatureC).not.toBe(other.temperatureC)
  })

  it('keeps a normal sample inside the cabinet band', () => {
    const subject = simulator()
    for (let index = 0; index < 100; index += 1) {
      const sample = subject.next(T0 + index * 2_000)
      expect(sample.temperatureC).toBeGreaterThanOrEqual(4)
      expect(sample.temperatureC).toBeLessThanOrEqual(8)
      expect(sample.humidityPct).toBeGreaterThan(20)
      expect(sample.humidityPct).toBeLessThan(70)
    }
  })

  it('switches the compressor on above the setpoint and off below it', () => {
    expect(simulator().next(T0, 7.5).compressorOn).toBe(true)
    expect(simulator().next(T0, 5).compressorOn).toBe(false)
  })

  it('leaves the band during a requested excursion and recovers afterwards', () => {
    const subject = simulator()
    subject.beginExcursion(T0, 10_000)

    const during = subject.next(T0 + 5_000)
    expect(during.temperatureC).toBeGreaterThan(8)
    expect(during.compressorOn).toBe(true)

    const after = subject.next(T0 + 11_000)
    expect(after.temperatureC).toBeLessThanOrEqual(8)
  })

  it('marks the excursion in the sample so the alert path can see it', () => {
    const subject = simulator()
    subject.beginExcursion(T0, 5_000)

    expect(subject.next(T0 + 1_000).excursion).toBe(true)
    expect(subject.next(T0 + 6_000).excursion).toBe(false)
  })
})
