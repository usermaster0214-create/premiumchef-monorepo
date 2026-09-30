import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import { TransferOrderTableDto } from './dto/table-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @RequirePermissions('orders.create')
  create(
    @Body() dto: CreateOrderDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.ordersService.create(dto, {
      ...tenant,
      userId: request.user!.sub,
    });
  }

  @Post(':id/items')
  @RequirePermissions('orders.update')
  addItem(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() item: OrderItemDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.ordersService.addItem(orderId, item, {
      ...tenant,
      userId: request.user!.sub,
    });
  }

  @Patch(':id/table')
  @RequirePermissions('orders.update')
  transferTable(
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body() dto: TransferOrderTableDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.ordersService.transferTable(orderId, dto, {
      ...tenant,
      userId: request.user!.sub,
    });
  }
}