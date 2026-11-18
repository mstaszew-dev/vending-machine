import { isMissingRelation, MissingRelationError } from './time-series'

describe('isMissingRelation', () => {
  it('recognises a typed missing-relation error', () => {
    expect(isMissingRelation(new MissingRelationError('database not found: events'))).toBe(true)
  })

  it('recognises a relation-specific provider message', () => {
    expect(
      isMissingRelation(
        new Error("Error during planning: table 'public.iox.machine_event' not found"),
      ),
    ).toBe(true)
    expect(isMissingRelation(new Error('query error: database not found: events'))).toBe(true)
  })

  it('recognises a standalone no-such-table message', () => {
    expect(isMissingRelation(new Error('no such table: vending'))).toBe(true)
  })

  it('does not classify a vague not-found message as a missing relation', () => {
    expect(isMissingRelation(new Error('Not found'))).toBe(false)
    expect(isMissingRelation(new Error('InfluxDB query failed with 404: not found'))).toBe(false)
  })

  it('does not classify an unrelated failure that mentions not found', () => {
    expect(isMissingRelation(new Error('InfluxDB query failed with 503: upstream not found'))).toBe(
      false,
    )
  })
})
