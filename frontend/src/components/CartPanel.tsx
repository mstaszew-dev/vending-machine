import { useMemo } from 'react'
import {
  canPay,
  cartTotalCents,
  itemCount,
  missingCents,
  type CartLine,
} from '../cart'
import { formatCents, formatEuro, toCents } from '../money'
import type { Product } from '../types'

interface CartPanelProps {
  cart: CartLine[]
  products: Product[]
  credit: number
  acceptedCoins: number[]
  busy: boolean
  onSetQuantity: (product: Product, quantity: number) => void
  onInsertCoin: (amount: number) => void
  onReturnCredit: () => void
  onPay: () => void
}

export function CartPanel({
  cart,
  products,
  credit,
  acceptedCoins,
  busy,
  onSetQuantity,
  onInsertCoin,
  onReturnCredit,
  onPay,
}: CartPanelProps) {
  const lines = useMemo(
    () =>
      cart.flatMap((line) => {
        const product = products.find((candidate) => candidate.id === line.productId)
        return product ? [{ product, quantity: line.quantity }] : []
      }),
    [cart, products],
  )

  const totalCents = cartTotalCents(cart, products)
  const missing = missingCents(cart, products, credit)
  const payable = canPay(cart, products, credit) && !busy

  return (
    <aside className="cart" aria-label="Shopping cart">
      <h2 className="cart__title">
        Your cart
        {itemCount(cart) > 0 && (
          <span className="cart__badge">{itemCount(cart)}</span>
        )}
      </h2>

      {lines.length === 0 ? (
        <p className="cart__empty">
          Nothing picked yet. Choose a product on the left.
        </p>
      ) : (
        <ul className="cart__lines">
          {lines.map(({ product, quantity }) => (
            <li className="cart-line" key={product.id}>
              <div className="cart-line__info">
                <span className="cart-line__name">{product.name}</span>
                <span className="cart-line__unit">
                  {formatEuro(product.price)} each
                </span>
              </div>
              <div className="cart-line__controls">
                <button
                  type="button"
                  className="button button--tiny"
                  aria-label={`Remove one ${product.name}`}
                  disabled={busy}
                  onClick={() => onSetQuantity(product, quantity - 1)}
                >
                  −
                </button>
                <span className="cart-line__quantity">{quantity}</span>
                <button
                  type="button"
                  className="button button--tiny"
                  aria-label={`Add one ${product.name}`}
                  disabled={busy || quantity >= product.stock}
                  onClick={() => onSetQuantity(product, quantity + 1)}
                >
                  +
                </button>
              </div>
              <span className="cart-line__total">
                {formatCents(toCents(product.price) * quantity)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <dl className="cart__totals">
        <div>
          <dt>Total</dt>
          <dd>{formatCents(totalCents)}</dd>
        </div>
        <div>
          <dt>Credit</dt>
          <dd>{formatEuro(credit)}</dd>
        </div>
      </dl>

      <section className="coins" aria-label="Insert coins">
        <h3 className="coins__title">Insert coins</h3>
        <div className="coins__grid">
          {acceptedCoins.map((coin) => (
            <button
              key={coin}
              type="button"
              className="coin"
              disabled={busy}
              onClick={() => onInsertCoin(coin)}
            >
              {formatEuro(coin)}
            </button>
          ))}
        </div>
      </section>

      <div className="cart__actions">
        <button
          type="button"
          className="button button--primary button--block"
          disabled={!payable}
          onClick={onPay}
        >
          Pay {formatCents(totalCents)}
        </button>
        <button
          type="button"
          className="button button--ghost button--block"
          disabled={busy || credit === 0}
          onClick={onReturnCredit}
        >
          Return coins
        </button>
      </div>

      {missing > 0 && (
        <p className="cart__hint">{formatCents(missing)} missing</p>
      )}
    </aside>
  )
}
