import type { INestApplication } from '@nestjs/common'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'

/**
 * JSON parsing with the machine's own problem shape. Nest's default parser answers a
 * malformed body with `{statusCode, message}`, which the frontend cannot branch on, so the
 * parser is installed manually and its errors are translated before the routes run.
 */
export function configureHttp(app: INestApplication): void {
  app.enableCors({ origin: true })
  app.use(express.json({ limit: '64kb' }))
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    const parseError = error as { type?: string; status?: number; message?: string }
    if (parseError.type === 'entity.parse.failed' || parseError.status === 400) {
      response
        .status(400)
        .type('application/problem+json')
        .json({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          detail: 'Request body is missing or malformed',
          instance: _request.originalUrl ?? _request.url,
          code: 'INVALID_REQUEST',
        })
      return
    }
    next(error)
  })
}
