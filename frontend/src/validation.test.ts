import { describe, expect, it } from 'vitest'
import { ShapeError, parseMachineState, parseProblemDetails } from './validation'
import { makeMachineState } from './test/fixtures'

describe('parseMachineState', () => {
  it('accepts the payload the backend actually sends', () => {
    const state = parseMachineState(JSON.parse(JSON.stringify(makeMachineState())))

    expect(state.products).toHaveLength(2)
    expect(state.products[0]?.group).toBe('PERSONAL_HYGIENE')
  })

  it('rejects a product group the UI does not know', () => {
    const payload = JSON.parse(JSON.stringify(makeMachineState()))
    payload.products[0].group = 'GARDEN'

    expect(() => parseMachineState(payload)).toThrow(ShapeError)
    expect(() => parseMachineState(payload)).toThrow(/product group/)
  })

  it('rejects fractional stock and negative prices', () => {
    const fractional = JSON.parse(JSON.stringify(makeMachineState()))
    fractional.products[0].stock = 1.5
    expect(() => parseMachineState(fractional)).toThrow(/not an integer/)

    const negative = JSON.parse(JSON.stringify(makeMachineState()))
    negative.products[0].price = -0.55
    expect(() => parseMachineState(negative)).toThrow(/negative/)
  })

  it('rejects a response that is not an object at all', () => {
    expect(() => parseMachineState(null)).toThrow(ShapeError)
    expect(() => parseMachineState('nope')).toThrow(ShapeError)
  })
})

describe('parseProblemDetails', () => {
  it('keeps the stable machine error code', () => {
    expect(parseProblemDetails({ code: 'INSUFFICIENT_STOCK', detail: 'sold out' })).toEqual({
      code: 'INSUFFICIENT_STOCK',
      detail: 'sold out',
      title: undefined,
      status: undefined,
    })
  })

  it('returns an empty object for a broken error body', () => {
    expect(parseProblemDetails(null)).toEqual({})
    expect(parseProblemDetails('boom')).toEqual({})
  })
})
