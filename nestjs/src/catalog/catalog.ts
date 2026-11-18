export type ProductGroup =
  | 'PERSONAL_HYGIENE'
  | 'FACE'
  | 'PHOTO'
  | 'TEXTILE'
  | 'HOUSEHOLD'

export interface Product {
  readonly id: number
  readonly name: string
  readonly group: ProductGroup
  readonly priceCents: number
}

/**
 * Products belong in code, not in the database: the catalog is fixed by the task, and a
 * time-series store is the wrong shape for a price list.
 */
export const CATALOG: readonly Product[] = [
  { id: 1, name: 'Balea shower gel', group: 'PERSONAL_HYGIENE', priceCents: 55 },
  { id: 2, name: 'SEINZ beard oil', group: 'FACE', priceCents: 795 },
  { id: 3, name: 'Balea body lotion', group: 'PERSONAL_HYGIENE', priceCents: 75 },
  { id: 4, name: 'Fotoparadies USB stick 16GB', group: 'PHOTO', priceCents: 695 },
  { id: 5, name: 'Nivea night cream Q10', group: 'FACE', priceCents: 1595 },
  { id: 6, name: 'Kinderhose (one-size)', group: 'TEXTILE', priceCents: 990 },
  { id: 7, name: 'All-purpose cleaner Power degreaser', group: 'HOUSEHOLD', priceCents: 175 },
  { id: 8, name: 'Profissimo Dirt eraser', group: 'HOUSEHOLD', priceCents: 225 },
]

const BY_ID = new Map(CATALOG.map((product) => [product.id, product]))

export function findProduct(id: number): Product | undefined {
  return BY_ID.get(id)
}

export function productIds(): number[] {
  return CATALOG.map((product) => product.id)
}
