import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { DeliveryStatus } from '@premiumchef/database';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CreateDriverDto, UpdateDriverDto } from './dto/driver.dto';
import { AssignDriverDto, UpdateDeliveryStatusDto } from './dto/delivery-operation.dto';
import { DeliveryOperationsService } from './delivery-operations.service';

@Controller()
export class DeliveryOperationsController {
  constructor(private readonly service: DeliveryOperationsService) {}

  @Get('delivery-drivers')
  @RequirePermissions('delivery.drivers.read')
  drivers(): Promise<unknown> { return this.service.listDrivers(); }

  @Post('delivery-drivers')
  @RequirePermissions('delivery.drivers.create')
  createDriver(@Body() dto: CreateDriverDto, @CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> {
    return this.service.createDriver(dto, tenant.tenantId);
  }

  @Patch('delivery-drivers/:id')
  @RequirePermissions('delivery.drivers.update')
  updateDriver(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverDto): Promise<unknown> {
    return this.service.updateDriver(id, dto);
  }

  @Get('deliveries')
  @RequirePermissions('delivery.read')
  deliveries(@CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> {
    return this.service.listDeliveries(tenant);
  }

  @Patch('deliveries/:id/driver')
  @RequirePermissions('delivery.assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDriverDto, @CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> {
    return this.service.assignDriver(id, dto.driver_id, tenant);
  }

  @Patch('deliveries/:id/status')
  @RequirePermissions('delivery.update')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDeliveryStatusDto): Promise<unknown> {
    return this.service.updateStatus(id, dto.status as DeliveryStatus);
  }
}