/** Mirror of the backend view models (`de.dm.vendingmachine.machine`). */

export type ProductGroup =
  | 'PERSONAL_HYGIENE'
  | 'FACE'
  | 'PHOTO'
  | 'TEXTILE'
  | 'HOUSEHOLD'

export interface Product {
  id: number
  name: string
  group: ProductGroup
  price: number
  stock: number
  capacity: number
  unitsSold: number
}

export interface MachineState {
  credit: number
  products: Product[]
  acceptedCoins: number[]
  totalRevenue: number
}

export interface PurchaseResult {
  total: number
  change: number
  items: {
    productId: number
    name: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }[]
  remainingCredit: number
}

export interface ReturnedCredit {
  returned: number
}

/** RFC 9457 problem response, extended with our stable machine error code. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  code?: string
}

export const GROUP_LABELS: Record<ProductGroup, string> = {
  PERSONAL_HYGIENE: 'Personal hygiene',
  FACE: 'Face',
  PHOTO: 'Photo',
  TEXTILE: 'Textile',
  HOUSEHOLD: 'Household',
}
