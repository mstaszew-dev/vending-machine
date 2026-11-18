/**
 * Root component and owner of all UI state: the active tab, the machine state and
 * the cart. Customer and Staff share one state document; Monitoring owns its own
 * telemetry data because it talks to a different API surface. Every machine mutation
 * returns the new state from the backend, so App is the only place that talks to it.
 */
import { useEffect, useState } from 'react'
import * as api from './api'
import { describeError } from './api'
import { EMPTY_CART, setQuantity, type CartLine } from './cart'
import { CustomerView } from './components/CustomerView'
import { StaffView } from './components/StaffView'
import { MonitoringTab } from './monitoring/MonitoringTab'
import { formatEuro } from './money'
import type { MachineState, Product } from './types'

type Tab = 'customer' | 'staff' | 'monitoring'

function App() {
  const [tab, setTab] = useState<Tab>('customer')
  const [machine, setMachine] = useState<MachineState | null>(null)
  const [cart, setCart] = useState<CartLine[]>(EMPTY_CART)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    // the mount fetch guards against a late response landing after unmount
    // (React 19 StrictMode mounts the component twice in development)
    let cancelled = false
    void (async () => {
      setBusy(true)
      setProblem(null)
      try {
        const state = await api.getMachine()
        if (cancelled) return
        setMachine(state)
        setNotice(null)
      } catch (error) {
        if (cancelled) return
        setProblem(describeError(error))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function refresh() {
    setBusy(true)
    setProblem(null)
    try {
      setMachine(await api.getMachine())
      setNotice(null)
    } catch (error) {
      setProblem(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Every mutation returns the new machine state, so one call is enough to redraw the
   * whole screen. Errors arrive as problem details and are shown above the content.
   */
  async function perform(action: () => Promise<MachineState>) {
    setBusy(true)
    setProblem(null)
    setNotice(null)
    try {
      setMachine(await action())
    } catch (error) {
      setProblem(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  function updateQuantity(product: Product, quantity: number) {
    setCart((current) => setQuantity(current, product, quantity))
    setProblem(null)
  }

  function pay() {
    void perform(async () => {
      const result = await api.purchase(cart)
      setCart(EMPTY_CART)
      setNotice(
        `Paid ${formatEuro(result.total)}. Please take your change: ${formatEuro(result.change)}.`,
      )
      return api.getMachine()
    })
  }

  function returnCredit() {
    void perform(async () => {
      const { returned } = await api.returnCredit()
      setNotice(`Returned ${formatEuro(returned)} in coins.`)
      return api.getMachine()
    })
  }

  function refill(items: { productId: number; quantity: number }[]) {
    void perform(async () => {
      const state = await api.refill(items)
      setNotice('Machine refilled.')
      return state
    })
  }

  function collect() {
    void perform(async () => {
      const state = await api.collect()
      setNotice('Coin box collected.')
      return state
    })
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            dm
          </span>
          <div>
            <h1 className="brand__title">dm drugstore vending machine</h1>
            <p className="brand__subtitle">
              8 products, coins only, change included.
            </p>
          </div>
        </div>

        <div className="app__actions">
          <nav className="tabs" aria-label="Views">
            <button
              type="button"
              className={`tab${tab === 'customer' ? ' tab--active' : ''}`}
              aria-current={tab === 'customer' ? 'page' : undefined}
              onClick={() => setTab('customer')}
            >
              Customer
            </button>
            <button
              type="button"
              className={`tab${tab === 'staff' ? ' tab--active' : ''}`}
              aria-current={tab === 'staff' ? 'page' : undefined}
              onClick={() => setTab('staff')}
            >
              Staff
            </button>
            <button
              type="button"
              className={`tab${tab === 'monitoring' ? ' tab--active' : ''}`}
              aria-current={tab === 'monitoring' ? 'page' : undefined}
              onClick={() => setTab('monitoring')}
            >
              Monitoring
            </button>
          </nav>
          <button
            type="button"
            className="button button--ghost"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Reload
          </button>
        </div>
      </header>

      {problem && (
        <p className="banner banner--error" role="alert">
          {problem}
        </p>
      )}
      {notice && (
        <p className="banner banner--success" role="status">
          {notice}
        </p>
      )}

      <main className="app__main">
        {tab === 'monitoring' ? (
          <MonitoringTab />
        ) : !machine ? (
          <section className="empty-state">
            <h2>Connecting to the machine…</h2>
            <p>Start the configured backend and retry.</p>
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </section>
        ) : tab === 'customer' ? (
          <CustomerView
            machine={machine}
            cart={cart}
            busy={busy}
            onSetQuantity={updateQuantity}
            onInsertCoin={(amount) => void perform(() => api.insertCredit(amount))}
            onReturnCredit={returnCredit}
            onPay={pay}
          />
        ) : (
          <StaffView
            machine={machine}
            busy={busy}
            onRefill={refill}
            onCollect={collect}
          />
        )}
      </main>

      <footer className="app__footer">
        Demo state lives in memory and is reset when the backend restarts.
      </footer>
    </div>
  )
}

export default App
