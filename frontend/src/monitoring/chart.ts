import type { SeriesPoint } from './types'

/**
 * Pure geometry for the hand-written SVG charts. Keeping the maths out of the components
 * means the scaling is testable without a DOM and the components stay declarative.
 */

export interface ChartBox {
  width: number
  height: number
  padding: number
}

function bounds(points: readonly SeriesPoint[]): { min: number; max: number } {
  const values = points.map((point) => point.value)
  if (values.length === 0) {
    return { min: 0, max: 1 }
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  return min === max ? { min: min - 1, max: max + 1 } : { min, max }
}

export interface LineGeometry {
  /** `M x y L x y ...`, ready for a <path d>. */
  readonly path: string
  readonly min: number
  readonly max: number
  readonly y: (value: number) => number
}

export function lineGeometry(
  points: readonly SeriesPoint[],
  box: ChartBox,
  forced?: { min: number; max: number },
): LineGeometry {
  const { min, max } = forced ?? bounds(points)
  const innerWidth = box.width - box.padding * 2
  const innerHeight = box.height - box.padding * 2
  const span = max - min || 1
  const y = (value: number) =>
    box.padding + innerHeight - ((value - min) / span) * innerHeight

  if (points.length === 0) {
    return { path: '', min, max, y }
  }
  const step = points.length === 1 ? 0 : innerWidth / (points.length - 1)
  const path = points
    .map((point, index) => {
      const x = box.padding + index * step
      return `${index === 0 ? 'M' : 'L'} ${round(x)} ${round(y(point.value))}`
    })
    .join(' ')
  return { path, min, max, y }
}

export interface BarGeometry {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function barGeometry(
  points: readonly SeriesPoint[],
  box: ChartBox,
): BarGeometry[] {
  const innerWidth = box.width - box.padding * 2
  const innerHeight = box.height - box.padding * 2
  if (points.length === 0) {
    return []
  }
  const max = Math.max(...points.map((point) => point.value), 1)
  const slot = innerWidth / points.length
  const gap = Math.min(4, slot * 0.2)
  return points.map((point, index) => {
    const height = (point.value / max) * innerHeight
    return {
      x: round(box.padding + index * slot + gap / 2),
      y: round(box.padding + innerHeight - height),
      width: round(Math.max(1, slot - gap)),
      height: round(height),
    }
  })
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
