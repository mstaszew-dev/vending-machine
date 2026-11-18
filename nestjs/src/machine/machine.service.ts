import type { MetricsService } from '../metrics/metrics-service'
import { formatEuros, eurosToCents } from './money'
import { MachineError } from './machine-error'
import type { MonitoringStream } from '../monitoring/monitoring-stream'
import type {
  LineRequest,
  MachineView,
  PurchaseReceipt,
  VendingMachine,
} from './vending-machine'

export interface ReturnedCredit {
  readonly returned: number
}

/**
 * Application service: the only place that combines the machine aggregate with telemetry.
 * The aggregate stays pure and synchronous; every successful action is projected into the
 * event store and the SSE stream, and every failure is recorded before it is re-thrown so
 * the monitoring view can explain rejections.
 */
export class MachineService {
  constructor(
    private readonly machine: VendingMachine,
    private readonly metrics: MetricsService,
    private readonly stream: MonitoringStream,
    private readonly clock: () => number = Date.now,
  ) {}

  view(): MachineView {
    return this.machine.view()
  }

  /**
   * `at` lets a caller (the flood demo) place the telemetry of a burst on distinct
   * timestamps. The aggregate's own rate window still keys off arrival time, so passing a
   * timestamp never changes whether a coin is accepted.
   */
  insertCredit(amountEuros: number, at = this.clock()): MachineView {
    let valueCents: number
    try {
      valueCents = eurosToCents(amountEuros)
    } catch {
      valueCents = 0
    }

    try {
      if (valueCents > 0) {
        this.machine.insertCredit(valueCents)
      } else {
        // let the aggregate produce the authoritative INVALID_COIN message
        this.machine.insertCredit(Number.isFinite(amountEuros) ? amountEuros : 0)
      }
    } catch (error) {
      if (error instanceof MachineError) {
        this.metrics.recordRejected(error.code, { valueCents, at })
        if (error.code === 'COIN_RATE_EXCEEDED' || error.code === 'HOPPER_FULL') {
          this.metrics.recordAlert(error.code, at)
          this.stream.publish({
            kind: 'alert',
            data: { code: error.code, at, message: error.message },
          })
        }
      }
      throw error
    }

    const view = this.machine.view()
    this.metrics.recordCoinInserted({
      valueCents,
      creditCents: eurosToCents(view.credit),
      at,
    })
    this.stream.publish({
      kind: 'machine_event',
      data: {
        at: new Date(at).toISOString(),
        type: 'coin_inserted',
        value: valueCents / 100,
        quantity: 1,
      },
    })
    this.stream.publish({ kind: 'machine', data: view })
    return view
  }

  returnCredit(): ReturnedCredit {
    const at = this.clock()
    const cents = this.machine.returnCredit()
    if (cents > 0) {
      this.metrics.recordCreditReturned({ valueCents: cents, at })
      this.stream.publish({
        kind: 'machine_event',
        data: {
          at: new Date(at).toISOString(),
          type: 'credit_returned',
          value: cents / 100,
          quantity: 1,
        },
      })
    }
    this.stream.publish({ kind: 'machine', data: this.machine.view() })
    return { returned: cents / 100 }
  }

  purchase(lines: readonly LineRequest[]): PurchaseReceipt {
    const at = this.clock()
    const receipt = this.machine.purchase(lines)
    const view = this.machine.view()
    this.metrics.recordPurchase({
      totalCents: eurosToCents(receipt.total),
      units: receipt.items.reduce((sum, item) => sum + item.quantity, 0),
      revenueCents: eurosToCents(view.totalRevenue),
      creditCents: 0,
      at,
    })
    this.stream.publish({
      kind: 'machine_event',
      data: {
        at: new Date(at).toISOString(),
        type: 'purchase',
        value: receipt.total,
        quantity: receipt.items.reduce((sum, item) => sum + item.quantity, 0),
      },
    })
    this.stream.publish({ kind: 'machine', data: view })
    return receipt
  }

  refill(lines: readonly LineRequest[]): MachineView {
    const at = this.clock()
    this.machine.refill(lines)
    const view = this.machine.view()
    this.metrics.recordRefill(lines, at)
    this.stream.publish({ kind: 'machine', data: view })
    return view
  }

  collect(): MachineView {
    const at = this.clock()
    const collectedCents = this.machine.collect()
    const view = this.machine.view()
    if (collectedCents > 0) {
      this.metrics.recordHopperCollected({ valueCents: collectedCents, at })
      this.stream.publish({
        kind: 'machine_event',
        data: {
          at: new Date(at).toISOString(),
          type: 'hopper_collected',
          value: collectedCents / 100,
          quantity: 1,
        },
      })
    }
    this.stream.publish({ kind: 'machine', data: view })
    return view
  }

  /** Exposed for the health and monitoring views without leaking the aggregate. */
  describeHopper(): string {
    const hopper = this.machine.view().hopper
    return `${formatEuros(Math.round(hopper.inserted * 100))} of ${formatEuros(
      Math.round(hopper.capacity * 100),
    )}`
  }
}
