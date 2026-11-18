import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { parseInsertCredit, parsePositions } from './dto'
import { MachineService } from './machine.service'
import type { MachineView, PurchaseReceipt } from './vending-machine'
import type { ReturnedCredit } from './machine.service'

/**
 * The wire contract is identical to the Java backend, plus `POST /collect`. Every mutating
 * call answers with the resulting machine state, so the frontend never needs a follow-up
 * request to refresh.
 */
@Controller('api/machine')
export class MachineController {
  constructor(private readonly machine: MachineService) {}

  @Get()
  state(): MachineView {
    return this.machine.view()
  }

  @Post('credit')
  @HttpCode(200)
  insertCredit(@Body() body: unknown): MachineView {
    return this.machine.insertCredit(parseInsertCredit(body))
  }

  @Post('credit/return')
  @HttpCode(200)
  returnCredit(): ReturnedCredit {
    return this.machine.returnCredit()
  }

  @Post('purchase')
  @HttpCode(200)
  purchase(@Body() body: unknown): PurchaseReceipt {
    return this.machine.purchase(parsePositions(body))
  }

  @Post('refill')
  @HttpCode(200)
  refill(@Body() body: unknown): MachineView {
    return this.machine.refill(parsePositions(body))
  }

  @Post('collect')
  @HttpCode(200)
  collect(): MachineView {
    return this.machine.collect()
  }
}
