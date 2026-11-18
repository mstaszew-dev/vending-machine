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
    refill: vi.fn(),
    collect: vi.fn(),
    describeError: actual.describeError,
  }
})

// The monitoring tab owns its own data fetching; App only has to mount it.
vi.mock('./monitoring/MonitoringTab', () => ({
  MonitoringTab: () => <p>monitoring-tab-stub</p>,
}))

import * as api from './api'

const mockedGetMachine = vi.mocked(api.getMachine)
const mockedInsertCredit = vi.mocked(api.insertCredit)
const mockedReturnCredit = vi.mocked(api.returnCredit)
const mockedPurchase = vi.mocked(api.purchase)
const mockedRefill = vi.mocked(api.refill)
const mockedCollect = vi.mocked(api.collect)

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
        'Cannot reach the machine. Is the configured backend running?',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Balea shower gel')).toBeInTheDocument()
    expect(mockedGetMachine).toHaveBeenCalledTimes(2)
  })

  it('keeps the current machine state when reload fails', async () => {
    const user = userEvent.setup()
    mockedGetMachine
      .mockResolvedValueOnce(makeMachineState())
      .mockRejectedValueOnce(new ApiError('Could not reload state', 503))

    render(<App />)
    expect(await screen.findByText('Balea shower gel')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reload' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reload state',
    )
    expect(screen.getByText('Balea shower gel')).toBeInTheDocument()
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

  it('keeps the cart and reports a rejected purchase', async () => {
    const user = userEvent.setup()
    mockedGetMachine.mockResolvedValue(makeMachineState({ credit: 1 }))
    mockedPurchase.mockRejectedValue(
      new ApiError('Not enough credit', 409, 'INSUFFICIENT_CREDIT'),
    )

    render(<App />)
    await screen.findByText('Balea shower gel')

    await user.click(screen.getByRole('button', { name: 'Add one Balea shower gel' }))
    await user.click(screen.getByRole('button', { name: /Pay 0,55/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough credit')
    expect(screen.getByLabelText('Balea shower gel in cart')).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Pay 0,55/ })).toBeEnabled()
    expect(mockedGetMachine).toHaveBeenCalledTimes(1)
  })

  it('returns inserted credit and refreshes the displayed machine state', async () => {
    const user = userEvent.setup()
    const paidIn = makeMachineState({ credit: 1.2 })
    const refunded = makeMachineState()
    mockedGetMachine
      .mockResolvedValueOnce(paidIn)
      .mockResolvedValueOnce(refunded)
    mockedReturnCredit.mockResolvedValue({ returned: 1.2 })

    render(<App />)
    await screen.findByText('Balea shower gel')
    await user.click(screen.getByRole('button', { name: 'Return coins' }))

    expect(
      await screen.findByText('Returned 1,20 € in coins.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('0,00 €', { selector: 'dd' })).toHaveLength(2)
    expect(mockedReturnCredit).toHaveBeenCalledOnce()
    expect(mockedGetMachine).toHaveBeenCalledTimes(2)
  })

  it('refills a slot from the staff tab and reports it', async () => {
    const user = userEvent.setup()
    const state = makeMachineState()
    mockedGetMachine.mockResolvedValue(state)
    const refilled = {
      ...state,
      products: state.products.map((product) =>
        product.id === 1 ? { ...product, stock: product.capacity } : product,
      ),
    }
    mockedRefill.mockResolvedValue(refilled)

    render(<App />)
    await screen.findByText('Balea shower gel')

    await user.click(screen.getByRole('button', { name: 'Staff' }))
    const row = screen.getByText('Balea shower gel').closest('tr') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Refill' }))

    expect(await screen.findByText('Machine refilled.')).toBeInTheDocument()
    expect(mockedRefill).toHaveBeenCalledWith([{ productId: 1, quantity: 8 }])
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

  it('opens the monitoring tab without disturbing the machine view', async () => {
    const user = userEvent.setup()
    mockedGetMachine.mockResolvedValue(makeMachineState())

    render(<App />)
    await screen.findByText('Balea shower gel')

    await user.click(screen.getByRole('button', { name: 'Monitoring' }))

    expect(screen.getByText('monitoring-tab-stub')).toBeInTheDocument()
    expect(screen.queryByText('Balea shower gel')).not.toBeInTheDocument()
    expect(mockedGetMachine).toHaveBeenCalledTimes(1)
  })

  it('collects the coin box from the staff tab and shows the emptied box', async () => {
    const user = userEvent.setup()
    const filled = makeMachineState({ hopper: { inserted: 12.5, capacity: 50 } })
    mockedGetMachine.mockResolvedValue(filled)
    mockedCollect.mockResolvedValue(
      makeMachineState({ hopper: { inserted: 0, capacity: 50 } }),
    )

    render(<App />)
    await screen.findByText('Balea shower gel')

    await user.click(screen.getByRole('button', { name: 'Staff' }))
    await user.click(screen.getByRole('button', { name: 'Collect coins' }))

    expect(await screen.findByText(/0,00 € of 50,00 €/)).toBeInTheDocument()
    expect(mockedCollect).toHaveBeenCalledOnce()
  })
})
