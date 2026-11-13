import { formatEuro } from '../money'
import { GROUP_LABELS, type Product } from '../types'

interface ProductCardProps {
  product: Product
  quantity: number
  busy: boolean
  onAdd: (product: Product) => void
  onRemove: (product: Product) => void
}

export function ProductCard({
  product,
  quantity,
  busy,
  onAdd,
  onRemove,
}: ProductCardProps) {
  const soldOut = product.stock === 0
  const fullyInCart = quantity >= product.stock
  const fillLevel = Math.round((product.stock / product.capacity) * 100)

  return (
    <article className={`product-card${soldOut ? ' product-card--sold-out' : ''}`}>
      <header className="product-card__header">
        <span className="product-card__group">{GROUP_LABELS[product.group]}</span>
        <span className="product-card__price">{formatEuro(product.price)}</span>
      </header>

      <h3 className="product-card__name">{product.name}</h3>

      <div className="stock">
        <div className="stock__bar" aria-hidden="true">
          <div className="stock__fill" style={{ width: `${fillLevel}%` }} />
        </div>
        <span className="stock__label">
          {soldOut ? 'Sold out' : `${product.stock} of ${product.capacity} left`}
        </span>
      </div>

      <footer className="product-card__actions">
        <button
          type="button"
          className="button button--ghost"
          aria-label={`Remove one ${product.name}`}
          disabled={busy || quantity === 0}
          onClick={() => onRemove(product)}
        >
          −
        </button>
        <output className="product-card__quantity" aria-label={`${product.name} in cart`}>
          {quantity}
        </output>
        <button
          type="button"
          className="button button--primary"
          aria-label={`Add one ${product.name}`}
          disabled={busy || soldOut || fullyInCart}
          onClick={() => onAdd(product)}
        >
          +
        </button>
      </footer>
    </article>
  )
}
