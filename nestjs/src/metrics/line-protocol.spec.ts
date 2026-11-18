import { encodeLine, encodeLines, type TimeSeriesPoint } from './line-protocol'

const AT = 1_700_000_000_123

describe('line protocol', () => {
  it('encodes tags, numeric fields and booleans as line protocol', () => {
    const point: TimeSeriesPoint = {
      measurement: 'machine_event',
      tags: { type: 'coin_inserted', code: 'HOPPER_FULL' },
      fields: { value_cents: 50, temperature_c: 5.4, compressor_on: true },
      at: AT,
    }

    expect(encodeLine(point)).toBe(
      'machine_event,code=HOPPER_FULL,type=coin_inserted compressor_on=true,temperature_c=5.4,value_cents=50 1700000000123',
    )
  })

  it('omits the tag section when there are no tags', () => {
    expect(
      encodeLine({ measurement: 'vending', fields: { temperature_c: 6 }, at: AT }),
    ).toBe('vending temperature_c=6 1700000000123')
  })

  it('escapes separators in measurement, tag keys and tag values', () => {
    expect(
      encodeLine({
        measurement: 'odd measure,ment',
        tags: { 'sensor name': 'cab inet=1' },
        fields: { value: 1 },
        at: AT,
      }),
    ).toBe('odd\\ measure\\,ment,sensor\\ name=cab\\ inet\\=1 value=1 1700000000123')
  })

  it('escapes quotes and backslashes in string fields', () => {
    expect(
      encodeLine({
        measurement: 'events',
        fields: { note: 'say "hi" \\ now' },
        at: AT,
      }),
    ).toBe('events note="say \\"hi\\" \\\\ now" 1700000000123')
  })

  it('rejects a point without fields', () => {
    expect(() => encodeLine({ measurement: 'events', fields: {}, at: AT })).toThrow(
      'at least one field',
    )
  })

  it('rejects an empty measurement and non-finite field values', () => {
    expect(() => encodeLine({ measurement: '', fields: { a: 1 }, at: AT })).toThrow(
      'measurement',
    )
    expect(() =>
      encodeLine({ measurement: 'events', fields: { a: Number.NaN }, at: AT }),
    ).toThrow('finite')
  })

  it('rejects an empty tag value instead of writing a broken line', () => {
    expect(() =>
      encodeLine({ measurement: 'events', tags: { type: '' }, fields: { a: 1 }, at: AT }),
    ).toThrow('tag')
  })

  it('joins a batch with newlines', () => {
    const lines = encodeLines([
      { measurement: 'vending', fields: { temperature_c: 5 }, at: AT },
      { measurement: 'vending', fields: { temperature_c: 6 }, at: AT + 1 },
    ])

    expect(lines.split('\n')).toHaveLength(2)
  })
})
