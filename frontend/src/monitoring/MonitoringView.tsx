import {
  formatBytes,
  formatClock,
  formatCount,
  formatEuro,
  formatTemperature,
} from './format'
import { BarChart, LineChart } from './Charts'
import type {
  MonitoringCapabilities,
  MonitoringEvent,
  MonitoringSummary,
  SeriesResponse,
} from './types'

/**
 * The monitoring tab. Everything on screen comes from the NestJS monitoring read model:
 * temperature and coin-rate charts, storage health, the recent business events and the two
 * demo actions that run through the real machine guard.
 */
interface MonitoringViewProps {
  readonly capabilities: MonitoringCapabilities
  readonly summary: MonitoringSummary
  readonly temperature: SeriesResponse
  readonly coinRate: SeriesResponse
  readonly events: readonly MonitoringEvent[]
  readonly live: boolean
  readonly busy: boolean
  readonly error: string | null
  readonly onFlood: () => void
  readonly onExcursion: () => void
  readonly onRefresh: () => void
}

export function MonitoringView({
  capabilities,
  summary,
  temperature,
  coinRate,
  events,
  live,
  busy,
  error,
  onFlood,
  onExcursion,
  onRefresh,
}: MonitoringViewProps) {
  const { tsdb } = summary
  const latest = summary.temperature

  return (
    <div className="monitoring">
      <section className="panel" aria-label="Telemetry health">
        <header className="panel__header">
          <h2 className="panel__title">Telemetry health</h2>
          <span
            className={`live${live ? ' live--on' : ''}`}
            title={live ? 'Server-sent events connected' : 'Falling back to polling'}
          >
            {live ? 'live' : 'polling every 5 s'}
          </span>
        </header>
        <dl className="health">
          <div className="health__item">
            <dt>Backend</dt>
            <dd>{capabilities.backend}</dd>
          </div>
          <div className="health__item">
            <dt>Database</dt>
            <dd>{tsdb.reachable ? 'reachable' : 'unreachable'}</dd>
          </div>
          <div className="health__item">
            <dt>Storage</dt>
            <dd>
              {formatBytes(tsdb.bytes)} of {formatBytes(tsdb.maxBytes)}
            </dd>
          </div>
          <div className="health__item">
            <dt>Size level</dt>
            <dd>
              <span className={`pill pill--${tsdb.level}`}>{tsdb.level}</span>
            </dd>
          </div>
          <div className="health__item">
            <dt>Queued</dt>
            <dd>{formatCount(tsdb.queuedPoints)} points</dd>
          </div>
          <div className="health__item">
            <dt>Dropped</dt>
            <dd>{formatCount(tsdb.droppedPoints)} points</dd>
          </div>
          <div className="health__item">
            <dt>Retention</dt>
            <dd>
              vitals {capabilities.databases.vitals.retention}, events{' '}
              {capabilities.databases.events.retention}
            </dd>
          </div>
          <div className="health__item">
            <dt>Watchers</dt>
            <dd>{formatCount(summary.streamSubscribers)}</dd>
          </div>
        </dl>
      </section>

      {summary.alert ? (
        <div className="alert-banner" role="alert">
          <strong>{summary.alert.code}</strong>
          <span>{summary.alert.message}</span>
          {summary.alert.temperatureC === undefined ? null : (
            <span className="alert-banner__value">
              {formatTemperature(summary.alert.temperatureC)}
            </span>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="form__error" role="status">
          {error}
        </p>
      ) : null}

      <div className="cards">
        <section className="panel">
          <header className="panel__header">
            <h2 className="panel__title">Temperature</h2>
            <span className="pill">
              setpoint {formatTemperature(latest?.setpointC ?? 6)}
            </span>
          </header>
          {latest ? (
            <>
              <div className="metrics">
                <div className="metric">
                  <span className="metric__label">Fridge</span>
                  <span className="metric__value">
                    {formatTemperature(latest.temperatureC)}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric__label">Humidity</span>
                  <span className="metric__value">
                    {formatCount(latest.humidityPct)} %
                  </span>
                </div>
                <div className="metric">
                  <span className="metric__label">Sampled</span>
                  <span className="metric__value">{formatClock(latest.at)}</span>
                </div>
              </div>
              <LineChart
                points={temperature.points}
                label="Temperature history"
                format={formatTemperature}
                reference={{
                  value: latest.setpointC,
                  label: 'setpoint',
                }}
              />
            </>
          ) : (
            <p className="panel__hint">Waiting for the first sample from the fridge.</p>
          )}
        </section>

        <section className="panel">
          <header className="panel__header">
            <h2 className="panel__title">Coins</h2>
            <span className="pill">
              {formatCount(summary.coins.insertsLastMinute)} inserts / min
            </span>
          </header>
          <div className="metrics">
            <div className="metric">
              <span className="metric__label">Last minute</span>
              <span className="metric__value">
                {formatEuro(summary.coins.valueLastMinute)}
              </span>
            </div>
            <div className="metric">
              <span className="metric__label">Coin box</span>
              <span className="metric__value">
                {formatEuro(summary.coins.hopperInserted)} of{' '}
                {formatEuro(summary.coins.hopperCapacity)}
              </span>
            </div>
          </div>
          <BarChart
            points={coinRate.points}
            label="Coin rate history"
            format={(value) => `${formatCount(value)} inserts`}
          />
        </section>
      </div>

      <div className="cards">
        <section className="panel">
          <header className="panel__header">
            <h2 className="panel__title">Recent events</h2>
            <button type="button" className="button button--ghost" onClick={onRefresh}>
              Refresh
            </button>
          </header>
          {events.length === 0 ? (
            <p className="panel__hint">No events stored yet.</p>
          ) : (
            <ul className="events" aria-label="Recent machine events">
              {events.map((event, index) => (
                <li
                  className="events__row"
                  key={`${event.at}-${event.type}-${index}`}
                >
                  <span className="events__time">{formatClock(event.at)}</span>
                  <span className="events__type">{event.type}</span>
                  {event.code === undefined ? null : (
                    <span className="pill pill--danger">{event.code}</span>
                  )}
                  <span className="events__value">
                    {event.type === 'coin_inserted' || event.type === 'purchase'
                      ? formatEuro(event.value)
                      : formatCount(event.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <header className="panel__header">
            <h2 className="panel__title">Demo actions</h2>
          </header>
          <p className="panel__hint">
            Both buttons run through the real machine and the real guard, so the evidence in
            the charts is the evidence the machine produced.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              disabled={busy || !capabilities.simulation.enabled}
              onClick={onFlood}
            >
              Simulate coin flood
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy || !capabilities.simulation.enabled}
              onClick={onExcursion}
            >
              Simulate temperature excursion
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
