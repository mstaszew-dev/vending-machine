/** Mirror of the NestJS monitoring read models (`nestjs/src/monitoring`). */

export type TsdbLevel = 'ok' | 'warning' | 'exceeded'

export interface TsdbStatus {
  reachable: boolean
  bytes: number
  maxBytes: number
  level: TsdbLevel
  queuedPoints: number
  droppedPoints: number
}

export interface MonitoringCapabilities {
  backend: string
  signals: string[]
  databases: {
    vitals: { retention: string }
    events: { retention: string }
  }
  simulation: { enabled: boolean; intervalMs: number }
  tsdb: TsdbStatus
}

export interface LatestTemperature {
  temperatureC: number
  setpointC: number
  humidityPct: number
  at: string
}

export interface MonitoringAlert {
  code: string
  at: number
  message: string
  temperatureC?: number
}

export interface MonitoringSummary {
  temperature: LatestTemperature | null
  coins: {
    insertsLastMinute: number
    valueLastMinute: number
    hopperInserted: number
    hopperCapacity: number
  }
  machine: {
    credit: number
    totalRevenue: number
    unitsSold: number
  }
  alert: MonitoringAlert | null
  tsdb: TsdbStatus
  streamSubscribers: number
}

export type MonitoringSignal = 'temperature' | 'coin_rate'

export interface SeriesPoint {
  at: number
  value: number
}

export interface SeriesResponse {
  signal: MonitoringSignal
  rangeSeconds: number
  points: SeriesPoint[]
}

export interface MonitoringEvent {
  at: string
  type: string
  value: number
  quantity: number
  code?: string
  productId?: string
}

export interface EventsResponse {
  events: MonitoringEvent[]
}

export interface FloodResult {
  attempted: number
  accepted: number
  rejected: number
  code?: string
}

export interface ExcursionResult {
  seconds: number
  until: string
}
