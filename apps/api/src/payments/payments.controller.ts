import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CreatePaymentsDto } from './dto/create-payments.dto';
import { PaymentsService } from './payments.service';

@Controller('orders/:id/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @RequirePermissions('orders.pay')
  create(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: CreatePaymentsDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.paymentsService.create(orderId, dto, {
      ...tenant,
      userId: request.user!.sub,
    });
  }
}