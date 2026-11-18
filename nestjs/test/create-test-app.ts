import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import type { AppConfig } from '../src/config/app-config'
import { loadAppConfig } from '../src/config/app-config'
import { configureHttp } from '../src/http-config'
import { FakeTimeSeriesStore } from './fake-time-series-store'

export interface TestApp {
  readonly app: INestApplication
  readonly store: FakeTimeSeriesStore
  readonly config: AppConfig
  http(): ReturnType<typeof request>
  close(): Promise<void>
}

export async function createTestApp(
  env: Record<string, string> = {},
  prepare?: (store: FakeTimeSeriesStore) => void,
): Promise<TestApp> {
  const store = new FakeTimeSeriesStore()
  prepare?.(store)
  const config = loadAppConfig({
    TEMPERATURE_SIMULATION: 'false',
    TSDB_DATA_DIR: '/definitely/not/here',
    ...env,
  })
  const app = await NestFactory.create(AppModule.register({ config, store }), {
    logger: false,
    bodyParser: false,
  })
  configureHttp(app)
  await app.init()

  return {
    app,
    store,
    config,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  }
}
