import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { loadAppConfig } from './config/app-config'
import { configureHttp } from './http-config'

async function bootstrap(): Promise<void> {
  const config = loadAppConfig()
  const app = await NestFactory.create(AppModule.register({ config }), { bodyParser: false })
  configureHttp(app)

  await app.listen(config.port, '0.0.0.0')
  new Logger('bootstrap').log(
    `dm vending machine (NestJS) listening on http://localhost:${config.port}, ` +
      `InfluxDB at ${config.influx.url}`,
  )
}

void bootstrap().catch((error: unknown) => {
  new Logger('bootstrap').error(
    'startup failed',
    error instanceof Error ? error.stack : String(error),
  )
  process.exitCode = 1
})
