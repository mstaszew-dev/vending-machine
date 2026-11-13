import { quantityOf, type CartLine } from '../cart'
import type { MachineState, Product } from '../types'
import { CartPanel } from './CartPanel'
import { ProductCard } from './ProductCard'

interface CustomerViewProps {
  machine: MachineState
  cart: CartLine[]
  busy: boolean
  onSetQuantity: (product: Product, quantity: number) => void
  onInsertCoin: (amount: number) => void
  onReturnCredit: () => void
  onPay: () => void
}

export function CustomerView({
  machine,
  cart,
  busy,
  onSetQuantity,
  onInsertCoin,
  onReturnCredit,
  onPay,
}: CustomerViewProps) {
  return (
    <div className="customer">
      <section className="shelf" aria-label="Products">
        {machine.products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            quantity={quantityOf(cart, product.id)}
            busy={busy}
            onAdd={(item) => onSetQuantity(item, quantityOf(cart, item.id) + 1)}
            onRemove={(item) => onSetQuantity(item, quantityOf(cart, item.id) - 1)}
          />
        ))}
      </section>

      <CartPanel
        cart={cart}
        products={machine.products}
        credit={machine.credit}
        acceptedCoins={machine.acceptedCoins}
        busy={busy}
        onSetQuantity={onSetQuantity}
        onInsertCoin={onInsertCoin}
        onReturnCredit={onReturnCredit}
        onPay={onPay}
      />
    </div>
  )
}
