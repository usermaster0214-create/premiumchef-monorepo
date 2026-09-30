import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CreateSplitsDto } from './dto/create-splits.dto';
import { SplitsService } from './splits.service';

@Controller('orders/:id/splits')
export class SplitsController {
  constructor(private readonly splitsService: SplitsService) {}

  @Get()
  @RequirePermissions('orders.read')
  list(@Param('id', ParseUUIDPipe) orderId: string): Promise<unknown> {
    return this.splitsService.list(orderId);
  }

  @Post()
  @RequirePermissions('orders.update')
  create(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateSplitsDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.splitsService.create(orderId, dto, {
      ...tenant,
      userId: request.user!.sub,
    });
  }
}