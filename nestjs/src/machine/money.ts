/**
 * Money is integer cents inside the machine: 0.55 + 0.75 is exactly the class of bug a
 * vending machine must not have. The HTTP layer still speaks euro numbers with two
 * decimals, exactly like the Java backend.
 */

const SCALE = 100
const MICRO_EURO_TOLERANCE = 1e-6

export function eurosToCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error('amount must be finite')
  }
  if (amount < 0) {
    throw new Error('amount must not be negative')
  }
  const scaled = amount * SCALE
  const rounded = Math.round(scaled)
  if (Math.abs(scaled - rounded) > MICRO_EURO_TOLERANCE) {
    throw new Error('amount must have at most two decimals')
  }
  return rounded
}

export function centsToEuros(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new Error('cents must be an integer')
  }
  return Number((cents / SCALE).toFixed(2))
}

export function formatEuros(cents: number): string {
  return `${(cents / SCALE).toFixed(2)} EUR`
}
