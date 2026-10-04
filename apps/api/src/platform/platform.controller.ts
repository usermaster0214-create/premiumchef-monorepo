import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { CreateTenantDto, UpdateTenantStatusDto } from './dto/tenant.dto';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformService } from './platform.service';

@Controller('platform/tenants')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get()
  list(): Promise<unknown> {
    return this.platformService.list();
  }

  @Post()
  create(@Body() dto: CreateTenantDto): Promise<unknown> {
    return this.platformService.create(dto);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentTenant() actor: CurrentTenantContext,
  ): Promise<unknown> {
    return this.platformService.setStatus(id, dto.status, actor.tenantId);
  }
}
