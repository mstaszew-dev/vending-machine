import { createTestApp, type TestApp } from './create-test-app'

let context: TestApp

beforeEach(async () => {
  context = await createTestApp()
})

afterEach(async () => {
  await context.close()
})

describe('health endpoints', () => {
  it('reports liveness', async () => {
    const response = await context.http().get('/health/live').expect(200)

    expect(response.body).toMatchObject({ status: 'ok' })
    expect(typeof (response.body as { uptimeSeconds: unknown }).uptimeSeconds).toBe('number')
  })

  it('reports readiness together with the database state', async () => {
    const response = await context.http().get('/health/ready').expect(200)

    expect(response.body).toEqual({ status: 'ready', tsdb: { reachable: true } })
  })

  it('stays ready when only the database is down', async () => {
    context.store.reachable = false

    const response = await context.http().get('/health/ready').expect(200)

    expect(response.body).toEqual({ status: 'ready', tsdb: { reachable: false } })
  })
})
