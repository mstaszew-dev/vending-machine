import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ApiError } from './errors'
import { makeMachineState } from './test/fixtures'

// The whole api module is replaced, so App can be tested without a backend.
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    getMachine: vi.fn(),
    insertCredit: vi.fn(),
    purchase: vi.fn(),
    returnCredit: vi.fn(),
    describeError: actual.describeError,
  }
})

import * as api from './api'

const mockedGetMachine = vi.mocked(api.getMachine)
const mockedInsertCredit = vi.mocked(api.insertCredit)
const mockedPurchase = vi.mocked(api.purchase)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('App', () => {
  it('renders the machine state on first load', async () => {
    mockedGetMachine.mockResolvedValue(makeMachineState())

    render(<App />)

    expect(await screen.findByText('Balea shower gel')).toBeInTheDocument()
    expect(screen.getByText('Nivea night cream Q10')).toBeInTheDocument()
  })

  it('shows an error banner and a retry path when the backend is unreachable', async () => {
    const user = userEvent.setup()
    mockedGetMachine
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(makeMachineState())

    render(<App />)

    expect(
      await screen.findByText(
        'Cannot reach the machine. Is the backend running on port 8080?',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Balea shower gel')).toBeInTheDocument()
    expect(mockedGetMachine).toHaveBeenCalledTimes(2)
  })

  it('inserts a coin and switches to the new credit the backend reports', async () => {
    const user = userEvent.setup()
    mockedGetMachine.mockResolvedValue(makeMachineState())
    mockedInsertCredit.mockResolvedValue(makeMachineState({ credit: 1 }))

    render(<App />)
    await screen.findByText('Balea shower gel')

    const coinRack = screen.getByRole('region', { name: 'Insert coins' })
    await user.click(within(coinRack).getByRole('button', { name: /1,00/ }))

    expect(await screen.findByText('1,00 €', { selector: 'dd' })).toBeInTheDocument()
    expect(mockedInsertCredit).toHaveBeenCalledWith(1)
  })

  it('surfaces a backend rejection as a problem banner without changing the state', async () => {
    const user = userEvent.setup()
    mockedGetMachine.mockResolvedValue(makeMachineState({ credit: 1 }))
    mockedInsertCredit.mockRejectedValue(
      new ApiError('Only these coins are accepted', 400, 'INVALID_COIN'),
    )

    render(<App />)
    await screen.findByText('Balea shower gel')

    const coinRack = screen.getByRole('region', { name: 'Insert coins' })
    await user.click(within(coinRack).getByRole('button', { name: /1,00/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only these coins are accepted',
    )
  })

  it('pays for the cart, shows the change and empties the cart', async () => {
    const user = userEvent.setup()
    const state = makeMachineState({ credit: 2 })
    mockedGetMachine
      .mockResolvedValueOnce(state)
      .mockResolvedValueOnce({ ...state, credit: 1.45 })
    mockedPurchase.mockResolvedValue({
      total: 0.55,
      change: 1.45,
      remainingCredit: 0,
      items: [
        {
          productId: 1,
          name: 'Balea shower gel',
          quantity: 1,
          unitPrice: 0.55,
          lineTotal: 0.55,
        },
      ],
    })

    render(<App />)
    await screen.findByText('Balea shower gel')

    await user.click(screen.getByRole('button', { name: 'Add one Balea shower gel' }))
    await user.click(screen.getByRole('button', { name: /Pay 0,55/ }))

    expect(await screen.findByText(/Paid 0,55/)).toHaveTextContent(
      'Paid 0,55 €. Please take your change: 1,45 €.',
    )
    expect(mockedPurchase).toHaveBeenCalledWith([{ productId: 1, quantity: 1 }])
    expect(
      screen.getByText('Nothing picked yet. Choose a product on the left.'),
    ).toBeInTheDocument()
  })

  it('shows the staff statistics when the staff tab is selected', async () => {
    const user = userEvent.setup()
    mockedGetMachine.mockResolvedValue(makeMachineState())

    render(<App />)
    await screen.findByText('Balea shower gel')

    await user.click(screen.getByRole('button', { name: 'Staff' }))

    expect(screen.getByText('Restock slots')).toBeInTheDocument()
    expect(screen.getByText('Revenue')).toBeInTheDocument()
  })
})
