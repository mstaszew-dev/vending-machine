import { MonitoringStream } from './monitoring-stream'

describe('MonitoringStream', () => {
  it('delivers published events to every subscriber', () => {
    const subject = new MonitoringStream()
    const seen: string[] = []
    const unsubscribe = subject.subscribe((event) => seen.push(event.kind))

    subject.publish({ kind: 'alert', data: { code: 'TEMP_HIGH', at: 1, temperatureC: 9, message: 'hot' } })
    subject.publish({ kind: 'vitals', data: { at: 2, temperatureC: 5, humidityPct: 40, setpointC: 6, compressorOn: false } })

    expect(seen).toEqual(['alert', 'vitals'])
    unsubscribe()
  })

  it('stops delivering after unsubscribe', () => {
    const subject = new MonitoringStream()
    const seen: string[] = []
    const unsubscribe = subject.subscribe((event) => seen.push(event.kind))

    unsubscribe()
    subject.publish({ kind: 'alert', data: { code: 'TEMP_LOW', at: 1, temperatureC: 2, message: 'cold' } })

    expect(seen).toEqual([])
  })

  it('keeps a bounded history for late subscribers', () => {
    const subject = new MonitoringStream(2)
    subject.publish({ kind: 'alert', data: { code: 'TEMP_HIGH', at: 1, temperatureC: 9, message: 'a' } })
    subject.publish({ kind: 'alert', data: { code: 'TEMP_HIGH', at: 2, temperatureC: 9, message: 'b' } })
    subject.publish({ kind: 'alert', data: { code: 'TEMP_HIGH', at: 3, temperatureC: 9, message: 'c' } })

    expect(
      subject.recent(10).map((event) => (event.kind === 'alert' ? event.data.message : '')),
    ).toEqual(['b', 'c'])
    expect(subject.recent(1)).toHaveLength(1)
  })

  it('survives a subscriber that throws', () => {
    const subject = new MonitoringStream()
    const seen: string[] = []
    subject.subscribe(() => {
      throw new Error('client went away')
    })
    subject.subscribe((event) => seen.push(event.kind))

    expect(() =>
      subject.publish({ kind: 'alert', data: { code: 'TEMP_HIGH', at: 1, temperatureC: 9, message: 'a' } }),
    ).not.toThrow()
    expect(seen).toEqual(['alert'])
  })

  it('reports the subscriber count', () => {
    const subject = new MonitoringStream()
    const unsubscribe = subject.subscribe(() => undefined)
    expect(subject.subscriberCount()).toBe(1)
    unsubscribe()
    expect(subject.subscriberCount()).toBe(0)
  })
})
