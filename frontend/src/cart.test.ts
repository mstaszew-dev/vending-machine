import { describe, expect, it } from 'vitest'
import {
  canPay,
  cartTotalCents,
  changeQuantity,
  itemCount,
  missingCents,
  quantityOf,
  setQuantity,
} from './cart'
import { makeProduct } from './test/fixtures'
import { toCents } from './money'

const showerGel = makeProduct({
  id: 1,
  name: 'Balea shower gel',
  price: 0.55,
  stock: 2,
})
const nightCream = makeProduct({
  id: 5,
  name: 'Nivea night cream Q10',
  price: 15.95,
  stock: 3,
})

describe('cart', () => {
  it('converts prices to integer cents without float drift', () => {
    expect(toCents(0.55)).toBe(55)
    expect(toCents(15.95)).toBe(1595)
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('adds a product once and increases an existing line', () => {
    const once = changeQuantity([], showerGel, 1)
    const twice = changeQuantity(once, showerGel, 1)

    expect(once).toEqual([{ productId: 1, quantity: 1 }])
    expect(twice).toEqual([{ productId: 1, quantity: 2 }])
  })

  it('never lets the cart hold more units than the slot', () => {
    const cart = setQuantity([], showerGel, 10)

    expect(cart).toEqual([{ productId: 1, quantity: 2 }])
  })

  it('removes the line when the quantity drops to zero', () => {
    const cart = setQuantity([{ productId: 1, quantity: 1 }], showerGel, 0)

    expect(cart).toEqual([])
    expect(quantityOf(cart, 1)).toBe(0)
  })

  it('keeps the order of lines and ignores unknown products when totalling', () => {
    const cart = setQuantity(
      setQuantity([], nightCream, 1),
      showerGel,
      2,
    )

    expect(cart.map((line) => line.productId)).toEqual([5, 1])
    expect(itemCount(cart)).toBe(3)
    expect(cartTotalCents(cart, [showerGel, nightCream])).toBe(1705)
    expect(cartTotalCents([{ productId: 99, quantity: 1 }], [showerGel])).toBe(0)
  })

  it('only allows paying when the inserted credit covers the total', () => {
    const cart = setQuantity([], nightCream, 1)

    expect(canPay(cart, [nightCream], 0)).toBe(false)
    expect(canPay(cart, [nightCream], 15.94)).toBe(false)
    expect(canPay(cart, [nightCream], 15.95)).toBe(true)
    expect(missingCents(cart, [nightCream], 10)).toBe(595)
    expect(canPay([], [nightCream], 100)).toBe(false)
  })
})
