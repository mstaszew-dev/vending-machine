import { loadAppConfig, parseSize } from './app-config'

describe('app config', () => {
  it('provides demo defaults without any environment', () => {
    const config = loadAppConfig({})

    expect(config).toEqual({
      port: 8081,
      machine: {
        capacityPerSlot: 10,
        initialStockPerSlot: 3,
        hopperCapacityCents: 5_000,
        coinWindow: { windowMs: 60_000, maxInserts: 20, maxCents: 2_500 },
      },
      influx: {
        url: 'http://127.0.0.1:8181',
        token: '',
        timeoutMs: 2_000,
        dataDir: '.data/influxdb3',
        vitals: { database: 'vitals', retention: '1h' },
        events: { database: 'events', retention: '7d' },
      },
      tsdb: { maxBytes: 64 * 1024 * 1024 },
      simulation: { enabled: true, intervalMs: 2_000 },
      temperature: {
        minC: 4,
        maxC: 8,
        setpointC: 6,
        stepC: 0.4,
        humidityBase: 40,
        excursionC: 3,
      },
    })
  })

  it('reads overrides from strings and converts euro limits to cents', () => {
    const config = loadAppConfig({
      PORT: '9000',
      MACHINE_CAPACITY_PER_SLOT: '12',
      MACHINE_INITIAL_STOCK_PER_SLOT: '4',
      HOPPER_CAPACITY_EUROS: '20.50',
      COIN_WINDOW_SECONDS: '30',
      COIN_MAX_INSERTS: '5',
      COIN_MAX_EUROS: '7.5',
      INFLUX_URL: 'http://localhost:9999/',
      TSDB_MAX_BYTES: '8mb',
      TEMPERATURE_SIMULATION: 'false',
      TEMPERATURE_INTERVAL_MS: '5000',
    })

    expect(config.port).toBe(9000)
    expect(config.machine).toMatchObject({
      capacityPerSlot: 12,
      initialStockPerSlot: 4,
      hopperCapacityCents: 2_050,
      coinWindow: { windowMs: 30_000, maxInserts: 5, maxCents: 750 },
    })
    expect(config.influx.url).toBe('http://localhost:9999')
    expect(config.tsdb.maxBytes).toBe(8 * 1024 * 1024)
    expect(config.simulation).toEqual({ enabled: false, intervalMs: 5_000 })
  })

  it('names the variable when a value is invalid', () => {
    expect(() => loadAppConfig({ COIN_MAX_INSERTS: '0' })).toThrow('COIN_MAX_INSERTS')
    expect(() => loadAppConfig({ PORT: 'http' })).toThrow('PORT')
    expect(() => loadAppConfig({ HOPPER_CAPACITY_EUROS: 'many' })).toThrow(
      'HOPPER_CAPACITY_EUROS',
    )
  })

  it('parses byte sizes with and without a unit', () => {
    expect(parseSize('1024')).toBe(1024)
    expect(parseSize('2kb')).toBe(2 * 1024)
    expect(parseSize('64mb')).toBe(64 * 1024 * 1024)
    expect(() => parseSize('12xb')).toThrow('size unit')
  })
})
