import type { MachineState, Product, ProductGroup } from '../types'

/** Builds a product with sensible defaults, so tests state only what they care about. */
export function makeProduct(
  overrides: Partial<Product> & Pick<Product, 'id' | 'name' | 'price'>,
): Product {
  return {
    group: 'PERSONAL_HYGIENE' as ProductGroup,
    stock: 3,
    capacity: 10,
    unitsSold: 0,
    ...overrides,
  }
}

export function makeMachineState(
  overrides: Partial<MachineState> = {},
): MachineState {
  return {
    credit: 0,
    totalRevenue: 0,
    acceptedCoins: [0.05, 0.1, 0.2, 0.5, 1, 2],
    products: [
      makeProduct({ id: 1, name: 'Balea shower gel', price: 0.55, stock: 2 }),
      makeProduct({
        id: 5,
        name: 'Nivea night cream Q10',
        group: 'FACE',
        price: 15.95,
        stock: 1,
      }),
    ],
    ...overrides,
  }
}
