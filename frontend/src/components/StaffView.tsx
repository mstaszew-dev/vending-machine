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
  const [amounts, setAmounts] = useState<Record<number, number>>({})

  const missingUnits = (product: Product) => product.capacity - product.stock
  const amountFor = (product: Product) =>
    amounts[product.id] ?? Math.max(1, missingUnits(product))

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
                      value={amountFor(product)}
                      onChange={(event) =>
                        setAmounts((current) => ({
                          ...current,
                          [product.id]: Number(event.target.value),
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
