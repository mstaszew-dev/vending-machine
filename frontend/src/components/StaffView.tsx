/**
 * The staff tab: machine statistics and a restock table. Refill amounts are clamped
 * to the free space of each slot in the UI; the backend still re-checks everything,
 * so the two layers agree on what a valid refill is.
 */
import { useState } from 'react'
import { formatEuro } from '../money'
import { GROUP_LABELS, type MachineState, type Product } from '../types'

interface StaffViewProps {
  machine: MachineState
  busy: boolean
  onRefill: (items: { productId: number; quantity: number }[]) => void
}

interface RefillItem {
  productId: number
  quantity: number
}

export function StaffView({ machine, busy, onRefill }: StaffViewProps) {
  // the raw input is kept as a string so typing feels normal, and only the value that is
  // actually sent is clamped to the free space of the slot
  const [amounts, setAmounts] = useState<Record<number, string>>({})

  const missingUnits = (product: Product) => product.capacity - product.stock

  /** Keeps the typed amount inside 1..missing: the backend would reject anything else. */
  const clampRefill = (product: Product, value: number) => {
    const missing = missingUnits(product)
    if (missing === 0) {
      return 0
    }
    if (!Number.isFinite(value)) {
      return 1
    }
    return Math.min(missing, Math.max(1, Math.trunc(value)))
  }

  const rawAmountFor = (product: Product) =>
    amounts[product.id] ?? String(Math.max(1, missingUnits(product)))

  const amountFor = (product: Product) =>
    clampRefill(product, Number(rawAmountFor(product)))

  const refillOne = (product: Product) => {
    const quantity = amountFor(product)
    if (quantity > 0) {
      onRefill([{ productId: product.id, quantity }])
    }
  }

  const refillAll = () => {
    const items: RefillItem[] = machine.products
      .filter((product) => missingUnits(product) > 0)
      .map((product) => ({
        productId: product.id,
        quantity: missingUnits(product),
      }))
    if (items.length > 0) {
      onRefill(items)
    }
  }

  const unitsSold = machine.products.reduce(
    (total, product) => total + product.unitsSold,
    0,
  )
  const emptySlots = machine.products.filter((product) => product.stock === 0).length
  const fillableSlots = machine.products.filter(
    (product) => missingUnits(product) > 0,
  ).length

  return (
    <div className="staff">
      <section className="stats" aria-label="Machine statistics">
        <article className="stat">
          <span className="stat__label">Revenue</span>
          <span className="stat__value">{formatEuro(machine.totalRevenue)}</span>
        </article>
        <article className="stat">
          <span className="stat__label">Units sold</span>
          <span className="stat__value">{unitsSold}</span>
        </article>
        <article className={`stat${emptySlots > 0 ? ' stat--alert' : ''}`}>
          <span className="stat__label">Empty slots</span>
          <span className="stat__value">{emptySlots}</span>
        </article>
        <article className="stat">
          <span className="stat__label">Credit in machine</span>
          <span className="stat__value">{formatEuro(machine.credit)}</span>
        </article>
      </section>

      <section className="panel">
        <header className="panel__header">
          <h2 className="panel__title">Restock slots</h2>
          <button
            type="button"
            className="button button--primary"
            disabled={busy || fillableSlots === 0}
            onClick={refillAll}
          >
            Fill all slots
          </button>
        </header>

        <table className="table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Group</th>
              <th scope="col">Price</th>
              <th scope="col">Stock</th>
              <th scope="col">Sold</th>
              <th scope="col">Refill</th>
            </tr>
          </thead>
          <tbody>
            {machine.products.map((product) => (
              <tr key={product.id}>
                <td>{product.name}</td>
                <td className="table__muted">{GROUP_LABELS[product.group]}</td>
                <td>{formatEuro(product.price)}</td>
                <td>
                  <span
                    className={
                      product.stock === 0
                        ? 'pill pill--danger'
                        : 'pill'
                    }
                  >
                    {product.stock} / {product.capacity}
                  </span>
                </td>
                <td>{product.unitsSold}</td>
                <td>
                  <div className="refill">
                    <input
                      className="refill__input"
                      type="number"
                      min={1}
                      max={Math.max(1, missingUnits(product))}
                      aria-label={`Units of ${product.name} to add`}
                      value={rawAmountFor(product)}
                      onChange={(event) =>
                        setAmounts((current) => ({
                          ...current,
                          [product.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={busy || missingUnits(product) === 0}
                      onClick={() => refillOne(product)}
                    >
                      Refill
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
