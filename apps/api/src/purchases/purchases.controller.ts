import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}

  @Get()
  @RequirePermissions('purchases.read')
  list(@CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> { return this.service.list(tenant); }

  @Post()
  @RequirePermissions('purchases.create')
  create(@Body() dto: CreatePurchaseDto, @Req() request: AuthenticatedRequest, @CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> {
    return this.service.create(dto, { ...tenant, userId: request.user!.sub });
  }
}