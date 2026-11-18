import type { MachineView } from '../machine/vending-machine'
import type { EventView } from '../metrics/metrics-service'

export interface VitalsStreamSample {
  readonly at: number
  readonly temperatureC: number
  readonly humidityPct: number
  readonly setpointC: number
  readonly compressorOn: boolean
}

export interface StreamAlert {
  readonly code: string
  readonly at: number
  readonly message: string
  readonly temperatureC?: number
}

export type StreamEvent =
  | { readonly kind: 'machine_event'; readonly data: EventView }
  | { readonly kind: 'vitals'; readonly data: VitalsStreamSample }
  | { readonly kind: 'alert'; readonly data: StreamAlert }
  | { readonly kind: 'machine'; readonly data: MachineView }

export type StreamListener = (event: StreamEvent) => void

/**
 * Fan-out for the SSE endpoint plus a short replay buffer. A monitoring tab that connects a
 * second after a coin went in still sees it, and a browser that disconnects can never make
 * an emit throw into the machine path.
 */
export class MonitoringStream {
  private readonly listeners = new Set<StreamListener>()
  private readonly history: StreamEvent[] = []

  constructor(private readonly historyLimit = 50) {}

  publish(event: StreamEvent): void {
    this.history.push(event)
    if (this.history.length > this.historyLimit) {
      this.history.shift()
    }
    // Snapshot first: a listener is free to unsubscribe another during dispatch.
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event)
      } catch {
        // a dead SSE connection is not a machine fault
      }
    }
  }

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  recent(limit: number): StreamEvent[] {
    return this.history.slice(-Math.max(0, limit))
  }

  subscriberCount(): number {
    return this.listeners.size
  }
}
