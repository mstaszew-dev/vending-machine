import { CATALOG, findProduct, productIds } from './catalog'
import { ACCEPTED_COIN_CENTS } from './coin'

describe('catalog', () => {
  it('contains the eight products from the task with exact prices', () => {
    expect(CATALOG).toHaveLength(8)
    expect(CATALOG.map((product) => [product.id, product.name, product.priceCents])).toEqual([
      [1, 'Balea shower gel', 55],
      [2, 'SEINZ beard oil', 795],
      [3, 'Balea body lotion', 75],
      [4, 'Fotoparadies USB stick 16GB', 695],
      [5, 'Nivea night cream Q10', 1595],
      [6, 'Kinderhose (one-size)', 990],
      [7, 'All-purpose cleaner Power degreaser', 175],
      [8, 'Profissimo Dirt eraser', 225],
    ])
  })

  it('assigns every product to a group', () => {
    expect(CATALOG.map((product) => product.group)).toEqual([
      'PERSONAL_HYGIENE',
      'FACE',
      'PERSONAL_HYGIENE',
      'PHOTO',
      'FACE',
      'TEXTILE',
      'HOUSEHOLD',
      'HOUSEHOLD',
    ])
  })

  it('finds products by id and exposes unique ids', () => {
    expect(findProduct(2)?.name).toBe('SEINZ beard oil')
    expect(findProduct(99)).toBeUndefined()
    expect(new Set(productIds()).size).toBe(8)
  })

  it('accepts exactly the euro coins from 5 cents to 2 euro', () => {
    expect([...ACCEPTED_COIN_CENTS]).toEqual([5, 10, 20, 50, 100, 200])
  })
})
