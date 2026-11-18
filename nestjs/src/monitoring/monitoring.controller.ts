import { Body, Controller, Get, HttpCode, Post, Query, Sse } from '@nestjs/common'
import type { MessageEvent } from '@nestjs/common'
import { Observable } from 'rxjs'
import { RequestError } from '../machine/problem-details'
import { MonitoringService } from './monitoring.service'
import { parseRange } from './range'
import type { StreamEvent } from './monitoring-stream'

function objectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RequestError('INVALID_REQUEST', 'Request body is missing or malformed')
  }
  return body as Record<string, unknown>
}

function numberFrom(body: Record<string, unknown>, key: string, fallback: number): number {
  const value = body[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RequestError('VALIDATION_ERROR', `${key} must be a number`)
  }
  return value
}

/**
 * Read model for the monitoring tab, plus two demo actions that run through the real
 * machine and the real guard. The endpoints are additive: the Java backend keeps answering
 * 404 here, which is exactly what the frontend's capability probe expects.
 */
@Controller('api/monitoring')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('capabilities')
  capabilities() {
    return this.monitoring.capabilities()
  }

  @Get('summary')
  summary() {
    return this.monitoring.summary()
  }

  @Get('series')
  series(
    @Query('signal') signal = 'temperature',
    @Query('range') range = '15m',
  ) {
    return this.monitoring.series(signal, parseRange(range))
  }

  @Get('events')
  async events(@Query('limit') limit = '50') {
    const parsed = Number(limit)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new RequestError('VALIDATION_ERROR', 'limit must be a positive number')
    }
    return this.monitoring.events(parsed)
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const send = (event: StreamEvent): void => {
        subscriber.next({ type: event.kind, data: event.data })
      }
      // a browser that connects between two samples still gets context immediately
      for (const event of this.monitoring.history(20)) {
        send(event)
      }
      const unsubscribe = this.monitoring.subscribe(send)
      // proxies and browsers close idle event streams; a comment keeps the socket alive
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'ping', data: { at: Date.now() } })
      }, 15_000)
      heartbeat.unref()

      return () => {
        unsubscribe()
        clearInterval(heartbeat)
      }
    })
  }

  @Post('simulate/flood')
  @HttpCode(200)
  async flood(@Body() body: unknown) {
    const count = numberFrom(objectBody(body), 'count', 25)
    return this.monitoring.simulateFlood(count)
  }

  @Post('simulate/excursion')
  @HttpCode(200)
  excursion(@Body() body: unknown) {
    const seconds = numberFrom(objectBody(body), 'seconds', 30)
    return this.monitoring.simulateExcursion(seconds)
  }
}
