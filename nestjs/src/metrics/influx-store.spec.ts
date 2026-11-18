import { InfluxTimeSeriesStore } from './influx-store'
import type { TimeSeriesPoint } from './line-protocol'
import { MissingRelationError } from './time-series'

const AT = 1_700_000_000_000
const POINT: TimeSeriesPoint = {
  measurement: 'machine_event',
  tags: { type: 'coin_inserted' },
  fields: { value_cents: 50 },
  at: AT,
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response
}

function store(): InfluxTimeSeriesStore {
  return new InfluxTimeSeriesStore({
    url: 'http://127.0.0.1:8181',
    timeoutMs: 2_000,
  })
}

describe('InfluxTimeSeriesStore', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(response(null, 204))
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('writes line protocol to the v3 write endpoint without blocking on fsync', async () => {
    await store().write('events', [POINT])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'http://127.0.0.1:8181/api/v3/write_lp?db=events&precision=millisecond&no_sync=true',
    )
    expect(init.method).toBe('POST')
    expect(init.body).toBe('machine_event,type=coin_inserted value_cents=50 1700000000000')
    expect(new Headers(init.headers).get('content-type')).toBe('text/plain; charset=utf-8')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('skips the request when there is nothing to write', async () => {
    await store().write('events', [])

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports the status and a body excerpt when a write fails', async () => {
    fetchMock.mockResolvedValue(response('wal buffer is full', 429))

    await expect(store().write('events', [POINT])).rejects.toThrow(
      'InfluxDB write failed with 429: wal buffer is full',
    )
  })

  it('queries SQL through the v3 query endpoint', async () => {
    fetchMock.mockResolvedValue(response([{ temperature_c: 5.4, time: '2026-11-18T10:00:00Z' }]))

    const rows = await store().query<{ temperature_c: number }>(
      'vitals',
      "SELECT temperature_c FROM vending WHERE sensor = 'cabinet'",
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8181/api/v3/query_sql')
    expect(init.body).toBe(
      JSON.stringify({
        db: 'vitals',
        q: "SELECT temperature_c FROM vending WHERE sensor = 'cabinet'",
        format: 'json',
      }),
    )
    expect(rows).toEqual([{ temperature_c: 5.4, time: '2026-11-18T10:00:00Z' }])
  })

  it('classifies a missing measurement on HTTP 400 as a missing relation', async () => {
    fetchMock.mockResolvedValue(
      response("Error during planning: table 'public.iox.machine_event' not found", 400),
    )

    await expect(store().query('events', 'SELECT 1')).rejects.toBeInstanceOf(MissingRelationError)
  })

  it('reports a query failure with the database name', async () => {
    fetchMock.mockResolvedValue(response('table not found', 404))

    const failure = store().query('vitals', 'SELECT 1')
    await expect(failure).rejects.toThrow(MissingRelationError)
    await expect(failure).rejects.toThrow(
      'InfluxDB query failed on vitals with 404: table not found',
    )
  })

  it('keeps a 404 that does not name a relation as a plain query failure', async () => {
    // A wrong endpoint/base URL returns a bare "Not found". Treating that as an empty
    // coin window would make a broken deployment look healthy on the ops dashboard.
    fetchMock.mockResolvedValue(response('Not found', 404))

    const error = await store().query('vitals', 'SELECT 1').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(MissingRelationError)
    expect((error as Error).message).toBe('InfluxDB query failed on vitals with 404: Not found')
  })

  it('creates a database with its immutable retention period', async () => {
    fetchMock.mockResolvedValue(response({ db: 'vitals' }, 201))

    await store().ensureDatabase('vitals', '1h')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8181/api/v3/configure/database')
    expect(init.body).toBe(JSON.stringify({ db: 'vitals', retention_period: '1h' }))
  })

  it('treats an existing database as success', async () => {
    fetchMock.mockResolvedValue(response('database already exists', 409))

    await expect(store().ensureDatabase('vitals', '1h')).resolves.toBeUndefined()
  })

  it('fails when the database cannot be created for another reason', async () => {
    fetchMock.mockResolvedValue(response('invalid retention', 400))

    await expect(store().ensureDatabase('vitals', '1m')).rejects.toThrow(
      'InfluxDB refused database vitals',
    )
  })

  it('pings the health endpoint', async () => {
    fetchMock.mockResolvedValue(response('OK', 200))

    await expect(store().ping()).resolves.toBe(true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://127.0.0.1:8181/health')
  })

  it('reports an unreachable server as down instead of throwing', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'))

    await expect(store().ping()).resolves.toBe(false)
  })
})
