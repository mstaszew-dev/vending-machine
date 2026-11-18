import { barGeometry, lineGeometry, type ChartBox } from './chart'
import type { SeriesPoint } from './types'

/**
 * Two small SVG charts. A chart library would be several hundred kilobytes for two fixed
 * shapes, so the paths are computed by hand and rendered as plain SVG.
 */

const BOX: ChartBox = { width: 600, height: 180, padding: 16 }

interface LineChartProps {
  readonly points: readonly SeriesPoint[]
  readonly label: string
  readonly format: (value: number) => string
  readonly reference?: { readonly value: number; readonly label: string }
  readonly min?: number
  readonly max?: number
}

export function LineChart({ points, label, format, reference, min, max }: LineChartProps) {
  const forced =
    min === undefined && max === undefined
      ? undefined
      : { min: min ?? 0, max: max ?? 1 }
  const geometry = lineGeometry(points, BOX, forced)
  const last = points[points.length - 1]

  return (
    <figure className="chart">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="chart__svg"
        preserveAspectRatio="none"
      >
        <line
          x1={BOX.padding}
          y1={BOX.height - BOX.padding}
          x2={BOX.width - BOX.padding}
          y2={BOX.height - BOX.padding}
          className="chart__axis"
        />
        {reference ? (
          <line
            x1={BOX.padding}
            y1={geometry.y(reference.value)}
            x2={BOX.width - BOX.padding}
            y2={geometry.y(reference.value)}
            className="chart__reference"
          />
        ) : null}
        {geometry.path === '' ? null : (
          <path d={geometry.path} className="chart__line" fill="none" />
        )}
      </svg>
      <figcaption className="chart__caption">
        {last === undefined ? null : (
          <span className="chart__value">{format(last.value)}</span>
        )}
        {reference ? (
          <span className="chart__hint">
            {reference.label} {format(reference.value)}
          </span>
        ) : null}
      </figcaption>
    </figure>
  )
}

interface BarChartProps {
  readonly points: readonly SeriesPoint[]
  readonly label: string
  readonly format: (value: number) => string
}

export function BarChart({ points, label, format }: BarChartProps) {
  const bars = barGeometry(points, BOX)
  const innerHeight = BOX.height - BOX.padding * 2
  const total = points.reduce((sum, point) => sum + point.value, 0)

  return (
    <figure className="chart">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="chart__svg"
        preserveAspectRatio="none"
      >
        <line
          x1={BOX.padding}
          y1={BOX.padding + innerHeight}
          x2={BOX.width - BOX.padding}
          y2={BOX.padding + innerHeight}
          className="chart__axis"
        />
        {bars.map((bar, index) => (
          <rect
            // the bars are a fixed, ordered series, so the index is the identity
            key={points[index]?.at ?? index}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            className="chart__bar"
          />
        ))}
      </svg>
      <figcaption className="chart__caption">
        <span className="chart__value">{format(total)}</span>
        <span className="chart__hint">in the selected range</span>
      </figcaption>
    </figure>
  )
}
