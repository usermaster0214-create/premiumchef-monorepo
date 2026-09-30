import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CreateInventoryMovementDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.read')
  list(@Query('critical') critical: string | undefined, @CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> {
    return this.service.list(tenant, critical === 'true');
  }

  @Post('movements')
  @RequirePermissions('inventory.adjust')
  move(@Body() dto: CreateInventoryMovementDto, @Req() request: AuthenticatedRequest, @CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> {
    return this.service.move(dto, { ...tenant, userId: request.user!.sub });
  }
}