/**
 * Money is handled in integer cents everywhere in the frontend: floating point
 * addition of 0.55 + 0.75 is exactly the kind of bug a vending machine must not have.
 */

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatEuro(amount: number): string {
  return euroFormat.format(amount)
}

export function formatCents(cents: number): string {
  return formatEuro(fromCents(cents))
}
