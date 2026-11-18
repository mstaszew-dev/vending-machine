export const ACCEPTED_COIN_CENTS = [5, 10, 20, 50, 100, 200] as const

export type CoinCents = (typeof ACCEPTED_COIN_CENTS)[number]

export function isAcceptedCoin(cents: number): cents is CoinCents {
  return (ACCEPTED_COIN_CENTS as readonly number[]).includes(cents)
}
