import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, Body } from '@nestjs/common';
import { KitchenTicketStatus } from '@premiumchef/database';
import { RequirePermissions } from '../auth/permissions.guard';
import { KitchenService } from './kitchen.service';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@Controller('kitchen-tickets')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get()
  @RequirePermissions('kitchen.view')
  list(@Query('status') status?: string): Promise<unknown> {
    const statuses = status?.split(',').filter((value): value is KitchenTicketStatus =>
      Object.values(KitchenTicketStatus).includes(value as KitchenTicketStatus),
    );
    return this.kitchenService.list(statuses);
  }

  @Patch(':id/status')
  @RequirePermissions('kitchen.update')
  updateStatus(
    @Param('id', ParseUUIDPipe) ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
  ): Promise<unknown> {
    return this.kitchenService.updateStatus(ticketId, dto.status);
  }
}