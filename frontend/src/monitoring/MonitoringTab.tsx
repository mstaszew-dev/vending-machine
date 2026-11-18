import { MonitoringView } from './MonitoringView'
import { useMonitoring } from './useMonitoring'

/**
 * Container for the monitoring tab. The hook is called here, not in App, so the capability
 * probe only runs when someone actually opens the tab.
 */
export function MonitoringTab() {
  const { status, data, error, actionError, busy, live, refresh, retry, flood, excursion } =
    useMonitoring()

  if (status === 'probing') {
    return (
      <section className="empty-state">
        <h2>Checking telemetry support…</h2>
        <p>The tab asks the backend whether it has time-series monitoring.</p>
      </section>
    )
  }

  if (status === 'unsupported') {
    return (
      <section className="empty-state" aria-label="Monitoring is not available">
        <h2>Monitoring needs the NestJS backend</h2>
        <p>
          This backend answers the machine contract but has no telemetry routes. Start the
          NestJS backend on port 8081 to see the fridge temperature, the coin rate and the
          InfluxDB health.
        </p>
      </section>
    )
  }

  if (status === 'error' || data === null) {
    return (
      <section className="empty-state" aria-label="Monitoring is not available">
        <h2>The monitoring data is out of reach</h2>
        <p>{error ?? 'The backend did not return a monitoring document.'}</p>
        <button
          type="button"
          className="button button--primary"
          disabled={busy}
          onClick={retry}
        >
          Retry
        </button>
      </section>
    )
  }

  return (
    <MonitoringView
      capabilities={data.capabilities}
      summary={data.summary}
      temperature={data.temperature}
      coinRate={data.coinRate}
      events={data.events}
      live={live}
      busy={busy}
      error={actionError}
      onFlood={() => void flood()}
      onExcursion={() => void excursion()}
      onRefresh={() => void refresh().catch(() => undefined)}
    />
  )
}
