import { toCents } from './money'
import type { Product } from './types'

export interface CartLine {
  productId: number
  quantity: number
}

export const EMPTY_CART: CartLine[] = []

export function quantityOf(cart: CartLine[], productId: number): number {
  return cart.find((line) => line.productId === productId)?.quantity ?? 0
}

/**
 * Sets the quantity of one product. Quantities are clamped to the stock of the slot,
 * and a quantity of zero removes the line - this is the single place where the cart is
 * allowed to grow, so "you can only buy what the machine holds" cannot be bypassed.
 */
export function setQuantity(
  cart: CartLine[],
  product: Product,
  quantity: number,
): CartLine[] {
  const clamped = Math.max(0, Math.min(Math.trunc(quantity), product.stock))
  const known = cart.some((line) => line.productId === product.id)

  if (clamped === 0) {
    return cart.filter((line) => line.productId !== product.id)
  }
  if (!known) {
    return [...cart, { productId: product.id, quantity: clamped }]
  }
  return cart.map((line) =>
    line.productId === product.id ? { ...line, quantity: clamped } : line,
  )
}

export function changeQuantity(
  cart: CartLine[],
  product: Product,
  delta: number,
): CartLine[] {
  return setQuantity(cart, product, quantityOf(cart, product.id) + delta)
}

export function itemCount(cart: CartLine[]): number {
  return cart.reduce((count, line) => count + line.quantity, 0)
}

export function cartTotalCents(cart: CartLine[], products: Product[]): number {
  return cart.reduce((total, line) => {
    const product = products.find((candidate) => candidate.id === line.productId)
    return product ? total + toCents(product.price) * line.quantity : total
  }, 0)
}

export function canPay(
  cart: CartLine[],
  products: Product[],
  credit: number,
): boolean {
  return itemCount(cart) > 0 && cartTotalCents(cart, products) <= toCents(credit)
}

export function missingCents(
  cart: CartLine[],
  products: Product[],
  credit: number,
): number {
  return Math.max(0, cartTotalCents(cart, products) - toCents(credit))
}
