import { CircuitBreaker } from './circuit-breaker'

const T0 = 1_700_000_000_000

function breaker(now: { value: number }): CircuitBreaker {
  return new CircuitBreaker({ failureThreshold: 3, openMs: 10_000 }, () => now.value)
}

describe('CircuitBreaker', () => {
  it('stays closed while writes succeed', () => {
    const now = { value: T0 }
    const subject = breaker(now)
    subject.recordSuccess()
    subject.recordSuccess()

    expect(subject.allow()).toBe(true)
    expect(subject.state()).toBe('closed')
  })

  it('opens after the configured number of consecutive failures', () => {
    const now = { value: T0 }
    const subject = breaker(now)
    subject.recordFailure()
    subject.recordFailure()

    expect(subject.state()).toBe('closed')
    expect(subject.allow()).toBe(true)

    subject.recordFailure()

    expect(subject.state()).toBe('open')
    expect(subject.allow()).toBe(false)
  })

  it('lets one probe through after the cooldown', () => {
    const now = { value: T0 }
    const subject = breaker(now)
    subject.recordFailure()
    subject.recordFailure()
    subject.recordFailure()

    now.value = T0 + 9_999
    expect(subject.allow()).toBe(false)

    now.value = T0 + 10_000
    expect(subject.allow()).toBe(true)
    expect(subject.state()).toBe('half-open')
  })

  it('closes on a successful probe', () => {
    const now = { value: T0 }
    const subject = breaker(now)
    subject.recordFailure()
    subject.recordFailure()
    subject.recordFailure()
    now.value = T0 + 10_000

    subject.recordSuccess()

    expect(subject.state()).toBe('closed')
    expect(subject.allow()).toBe(true)
  })

  it('reopens immediately when the probe fails', () => {
    const now = { value: T0 }
    const subject = breaker(now)
    subject.recordFailure()
    subject.recordFailure()
    subject.recordFailure()
    now.value = T0 + 10_000
    subject.allow()

    subject.recordFailure()

    expect(subject.state()).toBe('open')
    expect(subject.allow()).toBe(false)
    now.value = T0 + 19_999
    expect(subject.allow()).toBe(false)
  })

  it('resets the failure count after a success', () => {
    const now = { value: T0 }
    const subject = breaker(now)
    subject.recordFailure()
    subject.recordFailure()
    subject.recordSuccess()
    subject.recordFailure()

    expect(subject.state()).toBe('closed')
  })
})
