import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CustomerView } from './components/CustomerView'
import { StaffView } from './components/StaffView'
import { makeMachineState, makeProduct } from './test/fixtures'

const noop = () => undefined

describe('CustomerView', () => {
  it('renders every product of the machine', () => {
    const machine = makeMachineState()
    render(
      <CustomerView
        machine={machine}
        cart={[]}
        busy={false}
        onSetQuantity={noop}
        onInsertCoin={noop}
        onReturnCredit={noop}
        onPay={noop}
      />,
    )

    expect(screen.getByText('Balea shower gel')).toBeInTheDocument()
    expect(screen.getByText('Nivea night cream Q10')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('requests one more unit when the customer clicks plus', async () => {
    const user = userEvent.setup()
    const onSetQuantity = vi.fn()
    const machine = makeMachineState()

    render(
      <CustomerView
        machine={machine}
        cart={[]}
        busy={false}
        onSetQuantity={onSetQuantity}
        onInsertCoin={noop}
        onReturnCredit={noop}
        onPay={noop}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Add one Balea shower gel' }),
    )

    expect(onSetQuantity).toHaveBeenCalledWith(machine.products[0], 1)
  })

  it('blocks sold out products', () => {
    const machine = makeMachineState({
      products: [
        makeProduct({ id: 6, name: 'Kinderhose (one-size)', price: 9.9, stock: 0 }),
      ],
    })

    render(
      <CustomerView
        machine={machine}
        cart={[]}
        busy={false}
        onSetQuantity={noop}
        onInsertCoin={noop}
        onReturnCredit={noop}
        onPay={noop}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Add one Kinderhose (one-size)' }),
    ).toBeDisabled()
    expect(screen.getByText('Sold out')).toBeInTheDocument()
  })

  it('passes the clicked coin to the machine and shows the missing amount', async () => {
    const user = userEvent.setup()
    const onInsertCoin = vi.fn()
    const machine = makeMachineState({ credit: 10 })
    const cart = [{ productId: 5, quantity: 1 }]

    render(
      <CustomerView
        machine={machine}
        cart={cart}
        busy={false}
        onSetQuantity={noop}
        onInsertCoin={onInsertCoin}
        onReturnCredit={noop}
        onPay={noop}
      />,
    )

    await user.click(screen.getByRole('button', { name: /1,00/ }))

    expect(onInsertCoin).toHaveBeenCalledWith(1)
    expect(screen.getByText(/missing/)).toHaveTextContent(/5,95/)
    expect(screen.getByRole('button', { name: /^Pay/ })).toBeDisabled()
  })

  it('enables paying once the credit covers the cart', () => {
    const machine = makeMachineState({ credit: 2 })
    const cart = [{ productId: 1, quantity: 2 }]

    render(
      <CustomerView
        machine={machine}
        cart={cart}
        busy={false}
        onSetQuantity={noop}
        onInsertCoin={noop}
        onReturnCredit={noop}
        onPay={noop}
      />,
    )

    expect(screen.getByRole('button', { name: /^Pay/ })).toBeEnabled()
    expect(screen.queryByText(/missing/)).not.toBeInTheDocument()
  })
})

describe('StaffView', () => {
  it('fills every slot up to its capacity', async () => {
    const user = userEvent.setup()
    const onRefill = vi.fn()
    const machine = makeMachineState({
      products: [
        makeProduct({ id: 1, name: 'Balea shower gel', price: 0.55, stock: 3 }),
        makeProduct({ id: 2, name: 'SEINZ beard oil', price: 7.95, stock: 10 }),
      ],
    })

    render(<StaffView machine={machine} busy={false} onRefill={onRefill} />)
    await user.click(screen.getByRole('button', { name: 'Fill all slots' }))

    expect(onRefill).toHaveBeenCalledWith([{ productId: 1, quantity: 7 }])
  })

  it('refills a single slot with the entered amount', async () => {
    const user = userEvent.setup()
    const onRefill = vi.fn()
    const machine = makeMachineState({
      products: [
        makeProduct({ id: 1, name: 'Balea shower gel', price: 0.55, stock: 3 }),
      ],
    })

    render(<StaffView machine={machine} busy={false} onRefill={onRefill} />)
    const input = screen.getByLabelText('Units of Balea shower gel to add')
    await user.clear(input)
    await user.type(input, '4')
    await user.click(screen.getByRole('button', { name: 'Refill' }))

    expect(onRefill).toHaveBeenCalledWith([{ productId: 1, quantity: 4 }])
  })

  it('shows revenue and units sold', () => {
    const machine = makeMachineState({
      totalRevenue: 5.5,
      products: [
        makeProduct({
          id: 1,
          name: 'Balea shower gel',
          price: 0.55,
          stock: 1,
          unitsSold: 10,
        }),
      ],
    })

    render(<StaffView machine={machine} busy={false} onRefill={noop} />)

    const soldStat = screen.getByText('Units sold').closest('article')
    expect(soldStat).not.toBeNull()
    expect(within(soldStat as HTMLElement).getByText('10')).toBeInTheDocument()
    expect(screen.getByText('5,50 €')).toBeInTheDocument()
  })
})
