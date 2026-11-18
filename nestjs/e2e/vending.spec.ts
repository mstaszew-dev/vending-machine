import { expect, test } from '@playwright/test'

/**
 * End-to-end suite against a real NestJS process and a real InfluxDB 3 database.
 *
 * The tests share one machine process, so they run in order: the ordinary purchase flows
 * first, then the coin guard (which fills the rolling window), then the monitoring reads.
 * Assertions stay independent of the exact window contents so a slow run cannot make them
 * flaky.
 */

test.describe('machine contract', () => {
  test('serves the catalogue with the shared contract', async ({ request }) => {
    const response = await request.get('/api/machine')
    expect(response.status()).toBe(200)

    const machine = await response.json()
    expect(machine.products).toHaveLength(8)
    expect(machine.acceptedCoins).toEqual([0.05, 0.1, 0.2, 0.5, 1, 2])
    expect(machine).toMatchObject({
      credit: 0,
      totalRevenue: 0,
      hopper: { inserted: 0, capacity: 50 },
      coinWindow: { inserts: 0, value: 0, windowSeconds: 60 },
    })
  })

  test('buys a product for coins and returns the change', async ({ request }) => {
    const inserted = await request.post('/api/machine/credit', { data: { amount: 2 } })
    expect(inserted.status()).toBe(200)
    expect((await inserted.json()).credit).toBe(2)

    const purchased = await request.post('/api/machine/purchase', {
      data: { items: [{ productId: 1, quantity: 1 }] },
    })
    expect(purchased.status()).toBe(200)
    const receipt = await purchased.json()
    expect(receipt).toMatchObject({
      total: 0.55,
      change: 1.45,
      remainingCredit: 0,
    })
    expect(receipt.items[0]).toMatchObject({ productId: 1, quantity: 1 })

    const machine = await (await request.get('/api/machine')).json()
    expect(machine.credit).toBe(0)
    expect(machine.totalRevenue).toBe(0.55)
    expect(machine.products[0].stock).toBe(2)
    expect(machine.products[0].unitsSold).toBe(1)
  })

  test('returns inserted credit in coins', async ({ request }) => {
    await request.post('/api/machine/credit', { data: { amount: 1 } })

    const returned = await request.post('/api/machine/credit/return')
    expect(returned.status()).toBe(200)
    expect(await returned.json()).toEqual({ returned: 1 })

    const machine = await (await request.get('/api/machine')).json()
    expect(machine.credit).toBe(0)
  })

  test('rejects a purchase without credit as an RFC 9457 problem', async ({ request }) => {
    const response = await request.post('/api/machine/purchase', {
      data: { items: [{ productId: 2, quantity: 1 }] },
    })

    expect(response.status()).toBe(409)
    expect(response.headers()['content-type']).toContain('application/problem+json')
    const problem = await response.json()
    expect(problem).toMatchObject({
      code: 'INSUFFICIENT_CREDIT',
      status: 409,
      title: 'Conflict',
    })
    // The stable code is the shared contract; the prose is only a human hint and its
    // wording is free to differ from the Java backend.
    expect(typeof problem.detail).toBe('string')
    expect(problem.detail.length).toBeGreaterThan(0)
  })

  test('rejects a coin the machine does not accept', async ({ request }) => {
    const response = await request.post('/api/machine/credit', {
      data: { amount: 0.03 },
    })

    expect(response.status()).toBe(400)
    expect((await response.json()).code).toBe('INVALID_COIN')
  })

  test('rejects a refill that tries to overfill a slot', async ({ request }) => {
    const response = await request.post('/api/machine/refill', {
      data: { items: [{ productId: 1, quantity: 999 }] },
    })

    expect([400, 409]).toContain(response.status())
    expect((await response.json()).code).toBeTruthy()
  })
})

test.describe('coin guard', () => {
  test('the flood demo trips the rate guard and keeps every accepted insert', async ({
    request,
  }) => {
    const before = await (await request.get('/api/monitoring/summary')).json()

    const flood = await request.post('/api/monitoring/simulate/flood', {
      data: { count: 25 },
    })
    expect(flood.status()).toBe(200)
    const result = await flood.json()
    expect(result.attempted).toBe(25)
    expect(result.accepted).toBeGreaterThan(0)
    expect(result.rejected).toBeGreaterThan(0)
    expect(result.code).toBe('COIN_RATE_EXCEEDED')

    const after = await (await request.get('/api/monitoring/summary')).json()
    expect(after.coins.hopperInserted).toBe(
      Math.round((before.coins.hopperInserted + result.accepted * 0.05) * 100) / 100,
    )

    // the window is now full: the very next coin is refused by the real guard
    const blocked = await request.post('/api/machine/credit', { data: { amount: 0.05 } })
    expect(blocked.status()).toBe(409)
    expect((await blocked.json()).code).toBe('COIN_RATE_EXCEEDED')
  })

  test('collecting the coin box empties it and logs the handover', async ({ request }) => {
    const collected = await request.post('/api/machine/collect')
    expect(collected.status()).toBe(200)
    expect((await collected.json()).hopper.inserted).toBe(0)

    // Events go through the buffered writer, which flushes on an interval, so the
    // handover is not queryable until the next flush. Poll instead of racing it.
    await expect
      .poll(
        async () => {
          const events = await (await request.get('/api/monitoring/events?limit=100')).json()
          return events.events.some(
            (event: { type: string }) => event.type === 'hopper_collected',
          )
        },
        { timeout: 10_000, message: 'the collect event should be flushed to Influx' },
      )
      .toBe(true)
  })
})

test.describe('monitoring read model', () => {
  test('reports the capabilities and the storage budget', async ({ request }) => {
    const response = await request.get('/api/monitoring/capabilities')
    expect(response.status()).toBe(200)

    const capabilities = await response.json()
    expect(capabilities.backend).toBe('nestjs')
    expect(capabilities.signals).toEqual(
      expect.arrayContaining(['temperature', 'coin_rate', 'events']),
    )
    expect(capabilities.databases).toEqual({
      vitals: { retention: '1h' },
      events: { retention: '7d' },
    })
    expect(capabilities.tsdb).toMatchObject({
      reachable: true,
      level: expect.stringMatching(/^(ok|warning|exceeded)$/),
      maxBytes: 67_108_864,
    })
  })

  test('summarises the fridge, the coins and the machine', async ({ request }) => {
    await expect
      .poll(
        async () => {
          const summary = await (await request.get('/api/monitoring/summary')).json()
          return summary.temperature?.temperatureC
        },
        { timeout: 20_000, message: 'the temperature simulator should store a sample' },
      )
      .toEqual(expect.any(Number))

    const summary = await (await request.get('/api/monitoring/summary')).json()
    expect(summary.coins.hopperCapacity).toBe(50)
    expect(summary.coins.hopperInserted).toBe(0)
    expect(summary.tsdb.reachable).toBe(true)
    expect(summary.streamSubscribers).toBeGreaterThanOrEqual(0)
  })

  test('returns the temperature and coin-rate series', async ({ request }) => {
    const temperature = await (
      await request.get('/api/monitoring/series?signal=temperature&range=15m')
    ).json()
    expect(temperature.signal).toBe('temperature')
    expect(temperature.rangeSeconds).toBe(900)
    expect(temperature.points.length).toBeGreaterThan(0)
    for (const point of temperature.points) {
      expect(point.value).toBeGreaterThan(-10)
      expect(point.value).toBeLessThan(20)
    }

    const coins = await (
      await request.get('/api/monitoring/series?signal=coin_rate&range=15m')
    ).json()
    const total = coins.points.reduce(
      (sum: number, point: { value: number }) => sum + point.value,
      0,
    )
    expect(total).toBeGreaterThan(0)

    const badSignal = await request.get('/api/monitoring/series?signal=pressure')
    expect(badSignal.status()).toBe(400)
  })

  test('reports the rejected inserts and the alerts as business events', async ({
    request,
  }) => {
    const events = await (await request.get('/api/monitoring/events?limit=200')).json()
    expect(events.events.length).toBeGreaterThan(0)
    expect(
      events.events.some(
        (event: { type: string; code?: string }) =>
          event.type === 'insert_rejected' && event.code === 'COIN_RATE_EXCEEDED',
      ),
    ).toBe(true)
    expect(
      events.events.some((event: { type: string }) => event.type === 'purchase'),
    ).toBe(true)
  })

  test('raises a temperature alert after a simulated excursion', async ({ request }) => {
    test.setTimeout(60_000)

    const excursion = await request.post('/api/monitoring/simulate/excursion', {
      data: { seconds: 20 },
    })
    expect(excursion.status()).toBe(200)
    expect(await excursion.json()).toMatchObject({ seconds: 20 })

    await expect
      .poll(
        async () => {
          const summary = await (await request.get('/api/monitoring/summary')).json()
          return summary.alert?.code
        },
        { timeout: 30_000, message: 'the fridge should report the excursion as an alert' },
      )
      .toBe('TEMP_HIGH')
  })
})

test.describe('monitoring tab', () => {
  test('shows the live telemetry in the browser', async ({ page }) => {
    const frontend = process.env.E2E_FRONTEND_URL ?? 'http://127.0.0.1:5174'
    await page.goto(frontend)

    await expect(page.getByText('Balea shower gel')).toBeVisible()
    await page.getByRole('button', { name: 'Monitoring' }).click()

    await expect(page.getByRole('region', { name: 'Telemetry health' })).toBeVisible()
    await expect(page.getByText('nestjs')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Temperature history' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Coin rate history' })).toBeVisible()
    await expect(page.getByText(/°C/).first()).toBeVisible()

    const events = page.getByRole('list', { name: 'Recent machine events' })
    await expect(events.getByRole('listitem').first()).toBeVisible()
  })
})
