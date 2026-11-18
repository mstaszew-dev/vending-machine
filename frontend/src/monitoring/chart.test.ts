import { describe, expect, it } from 'vitest'
import { barGeometry, lineGeometry, type ChartBox } from './chart'

const BOX: ChartBox = { width: 200, height: 100, padding: 10 }

describe('chart geometry', () => {
  it('maps the series across the inner width and flips the y axis', () => {
    const geometry = lineGeometry(
      [
        { at: 1, value: 0 },
        { at: 2, value: 10 },
      ],
      BOX,
      { min: 0, max: 10 },
    )

    expect(geometry.path).toBe('M 10 90 L 190 10')
  })

  it('keeps a flat series visible by widening the domain', () => {
    const geometry = lineGeometry([{ at: 1, value: 5 }], BOX)

    expect(geometry.min).toBe(4)
    expect(geometry.max).toBe(6)
    expect(geometry.path).toBe('M 10 50')
  })

  it('returns an empty path and a safe domain for no points', () => {
    const geometry = lineGeometry([], BOX)

    expect(geometry.path).toBe('')
    expect(geometry.min).toBe(0)
    expect(geometry.max).toBe(1)
  })

  it('sizes bars against the biggest bucket', () => {
    const bars = barGeometry(
      [
        { at: 1, value: 2 },
        { at: 2, value: 4 },
      ],
      BOX,
    )

    expect(bars).toHaveLength(2)
    expect(bars[0]?.height).toBe(40)
    expect(bars[1]?.height).toBe(80)
    expect(bars[1]?.y).toBe(10)
    expect(bars[0]?.width).toBeGreaterThan(0)
  })

  it('returns no bars for an empty series', () => {
    expect(barGeometry([], BOX)).toEqual([])
  })
})
