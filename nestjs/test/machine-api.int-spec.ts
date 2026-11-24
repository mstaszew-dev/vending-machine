import { createTestApp, type TestApp } from './create-test-app'

let context: TestApp

beforeEach(async () => {
  context = await createTestApp()
})

afterEach(async () => {
  await context.close()
})

function problem(response: { body: unknown }): Record<string, unknown> {
  return response.body as Record<string, unknown>
}

describe('machine API', () => {
  it('answers the Java machine shape', async () => {
    const response = await context.http().get('/api/machine').expect(200)
    const state = response.body as {
      credit: number
      products: { id: number; name: string; group: string; price: number; stock: number; capacity: number; unitsSold: number }[]
      acceptedCoins: number[]
      totalRevenue: number
      hopper: unknown
      coinWindow: unknown
    }

    expect(state.credit).toBe(0)
    expect(state.products).toHaveLength(8)
    expect(state.products[0]).toEqual({
      id: 1,
      name: 'Balea shower gel',
      group: 'PERSONAL_HYGIENE',
      price: 0.55,
      stock: 3,
      capacity: 10,
      unitsSold: 0,
    })
    expect(state.acceptedCoins).toEqual([0.05, 0.1, 0.2, 0.5, 1, 2])
    expect(state.totalRevenue).toBe(0)
    expect(state.hopper).toEqual({ inserted: 0, capacity: 50 })
    expect(state.coinWindow).toEqual({ inserts: 0, value: 0, windowSeconds: 60 })
  })

  it('accepts a coin and reflects it in credit and hopper', async () => {
    const response = await context.http().post('/api/machine/credit').send({ amount: 0.5 }).expect(200)

    expect(response.body).toMatchObject({
      credit: 0.5,
      hopper: { inserted: 0.5 },
    })
  })

  it('answers an invalid coin with a 400 problem and a stable code', async () => {
    const response = await context.http().post('/api/machine/credit').send({ amount: 0.03 }).expect(400)

    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(problem(response)).toMatchObject({
      status: 400,
      code: 'INVALID_COIN',
      instance: '/api/machine/credit',
      title: 'Bad Request',
    })
  })

  it('answers a missing amount with the Java validation wording', async () => {
    const response = await context.http().post('/api/machine/credit').send({}).expect(400)

    expect(problem(response)).toMatchObject({
      code: 'VALIDATION_ERROR',
      detail: 'amount must not be null',
    })
  })

  it('answers malformed JSON as an INVALID_REQUEST problem', async () => {
    const response = await context
      .http()
      .post('/api/machine/credit')
      .set('Content-Type', 'application/json')
      .send('{"amount":')
      .expect(400)

    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(problem(response)).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('sells a cart and returns change', async () => {
    await context.http().post('/api/machine/credit').send({ amount: 2 }).expect(200)

    const response = await context
      .http()
      .post('/api/machine/purchase')
      .send({ items: [{ productId: 1, quantity: 2 }] })
      .expect(200)

    expect(response.body).toEqual({
      total: 1.1,
      change: 0.9,
      items: [
        { productId: 1, name: 'Balea shower gel', quantity: 2, unitPrice: 0.55, lineTotal: 1.1 },
      ],
      remainingCredit: 0,
    })
  })

  it('rejects a cart that exceeds stock with 409 INSUFFICIENT_STOCK', async () => {
    await context.http().post('/api/machine/credit').send({ amount: 2 }).expect(200)

    const response = await context
      .http()
      .post('/api/machine/purchase')
      .send({ items: [{ productId: 1, quantity: 4 }] })
      .expect(409)

    expect(problem(response)).toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  it('rejects a duplicate-line purchase with 409 INSUFFICIENT_STOCK and no state change', async () => {
    await context.http().post('/api/machine/credit').send({ amount: 2 }).expect(200)
    await context.http().post('/api/machine/credit').send({ amount: 1 }).expect(200)

    const response = await context
      .http()
      .post('/api/machine/purchase')
      .send({
        items: [
          { productId: 1, quantity: 2 },
          { productId: 1, quantity: 2 },
        ],
      })
      .expect(409)

    expect(problem(response)).toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      instance: '/api/machine/purchase',
    })

    const state = (await context.http().get('/api/machine').expect(200)).body as {
      credit: number
      products: { id: number; stock: number; unitsSold: number }[]
    }
    expect(state.credit).toBe(3)
    expect(state.products[0]).toMatchObject({ id: 1, stock: 3, unitsSold: 0 })
  })

  it('rejects a purchase the credit does not cover with 409 INSUFFICIENT_CREDIT', async () => {
    const response = await context
      .http()
      .post('/api/machine/purchase')
      .send({ items: [{ productId: 1, quantity: 1 }] })
      .expect(409)

    expect(problem(response)).toMatchObject({ code: 'INSUFFICIENT_CREDIT' })
  })

  it('answers an unknown product with 404 UNKNOWN_PRODUCT', async () => {
    const response = await context
      .http()
      .post('/api/machine/purchase')
      .send({ items: [{ productId: 99, quantity: 1 }] })
      .expect(404)

    expect(problem(response)).toMatchObject({ code: 'UNKNOWN_PRODUCT' })
  })

  it('rejects an empty cart with 400 VALIDATION_ERROR', async () => {
    const response = await context
      .http()
      .post('/api/machine/purchase')
      .send({ items: [] })
      .expect(400)

    expect(problem(response)).toMatchObject({
      code: 'VALIDATION_ERROR',
      detail: 'items must not be empty',
    })
  })

  it('refills and rejects an overflow with 409 SLOT_CAPACITY_EXCEEDED', async () => {
    const refilled = await context
      .http()
      .post('/api/machine/refill')
      .send({ items: [{ productId: 1, quantity: 7 }] })
      .expect(200)

    expect((refilled.body as { products: { stock: number }[] }).products[0]?.stock).toBe(10)

    const overflow = await context
      .http()
      .post('/api/machine/refill')
      .send({ items: [{ productId: 1, quantity: 1 }] })
      .expect(409)

    expect(problem(overflow)).toMatchObject({ code: 'SLOT_CAPACITY_EXCEEDED' })
  })

  it('returns inserted credit', async () => {
    await context.http().post('/api/machine/credit').send({ amount: 1 }).expect(200)
    await context.http().post('/api/machine/credit').send({ amount: 0.5 }).expect(200)

    const response = await context.http().post('/api/machine/credit/return').expect(200)

    expect(response.body).toEqual({ returned: 1.5 })
  })

  it('trips the rolling coin guard on the twenty-first insert', async () => {
    for (let index = 0; index < 20; index += 1) {
      await context.http().post('/api/machine/credit').send({ amount: 0.05 }).expect(200)
    }

    const response = await context.http().post('/api/machine/credit').send({ amount: 0.05 }).expect(409)

    expect(problem(response)).toMatchObject({
      code: 'COIN_RATE_EXCEEDED',
      retryAfterSeconds: 60,
    })
  })

  it('rejects an insert that would overflow the hopper', async () => {
    await context.close()
    context = await createTestApp({ HOPPER_CAPACITY_EUROS: '1' })

    await context.http().post('/api/machine/credit').send({ amount: 1 }).expect(200)

    const response = await context.http().post('/api/machine/credit').send({ amount: 0.05 }).expect(409)

    expect(problem(response)).toMatchObject({ code: 'HOPPER_FULL' })
  })

  it('empties the hopper through the staff collect endpoint', async () => {
    await context.http().post('/api/machine/credit').send({ amount: 2 }).expect(200)

    const response = await context.http().post('/api/machine/collect').expect(200)

    expect(response.body).toMatchObject({ credit: 2, hopper: { inserted: 0 } })
  })
})
