import { VitalsMonitor } from './vitals-monitor'
import type { VitalsSample } from './temperature-simulator'

const T0 = 1_700_000_000_000

function sample(temperatureC: number, at = T0): VitalsSample {
  return {
    at,
    temperatureC,
    humidityPct: 40,
    setpointC: 6,
    compressorOn: temperatureC > 6,
    excursion: false,
  }
}

function monitor(): VitalsMonitor {
  return new VitalsMonitor({ minC: 4, maxC: 8, consecutiveSamples: 3 })
}

describe('VitalsMonitor', () => {
  it('stays quiet while the cabinet is inside its band', () => {
    const subject = monitor()

    expect(subject.observe(sample(6))).toBeNull()
    expect(subject.observe(sample(8))).toBeNull()
    expect(subject.observe(sample(4))).toBeNull()
  })

  it('raises TEMP_HIGH only after three consecutive samples above the band', () => {
    const subject = monitor()

    expect(subject.observe(sample(9))).toBeNull()
    expect(subject.observe(sample(9.5))).toBeNull()

    expect(subject.observe(sample(10.1))).toEqual({
      code: 'TEMP_HIGH',
      at: T0,
      temperatureC: 10.1,
      message: 'Cabinet temperature 10.1 C is above the 8 C limit',
    })
  })

  it('raises TEMP_LOW only after three consecutive samples below the band', () => {
    const subject = monitor()

    expect(subject.observe(sample(3.9))).toBeNull()
    expect(subject.observe(sample(3.5))).toBeNull()

    expect(subject.observe(sample(2.8))).toMatchObject({ code: 'TEMP_LOW' })
  })

  it('does not repeat the alert while the excursion continues', () => {
    const subject = monitor()
    subject.observe(sample(9))
    subject.observe(sample(9))
    expect(subject.observe(sample(9))).toMatchObject({ code: 'TEMP_HIGH' })

    expect(subject.observe(sample(11))).toBeNull()
    expect(subject.observe(sample(12))).toBeNull()
  })

  it('rearms only after the cabinet is back inside the band', () => {
    const subject = monitor()
    subject.observe(sample(9))
    subject.observe(sample(9))
    subject.observe(sample(9))

    expect(subject.observe(sample(6))).toBeNull()
    expect(subject.observe(sample(9))).toBeNull()
    expect(subject.observe(sample(9))).toBeNull()
    expect(subject.observe(sample(9))).toMatchObject({ code: 'TEMP_HIGH' })
  })

  it('breaks a run when a single in-band sample appears in the middle', () => {
    const subject = monitor()
    subject.observe(sample(9))
    subject.observe(sample(9))
    subject.observe(sample(6))

    expect(subject.observe(sample(9))).toBeNull()
    expect(subject.observe(sample(9))).toBeNull()
    expect(subject.observe(sample(9))).toMatchObject({ code: 'TEMP_HIGH' })
  })

  it('switches direction without a stale counter', () => {
    const subject = monitor()
    subject.observe(sample(9))
    subject.observe(sample(9))

    expect(subject.observe(sample(3))).toBeNull()
    expect(subject.observe(sample(3))).toBeNull()
    expect(subject.observe(sample(3))).toMatchObject({ code: 'TEMP_LOW' })
    expect(subject.state()).toEqual({ highRun: 0, lowRun: 0, active: 'TEMP_LOW' })
  })

  it('clears the active alert when the cabinet recovers', () => {
    const subject = monitor()
    subject.observe(sample(9))
    subject.observe(sample(9))
    subject.observe(sample(9))

    subject.observe(sample(6))

    expect(subject.state().active).toBeNull()
  })

  it('ignores non-finite samples instead of alerting on them', () => {
    const subject = monitor()

    subject.observe(sample(Number.NaN))
    subject.observe(sample(Number.NaN))

    expect(subject.observe(sample(Number.NaN))).toBeNull()
  })
})
