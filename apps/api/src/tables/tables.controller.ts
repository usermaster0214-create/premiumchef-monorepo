import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  UpdateTableDto,
  UpdateTableStatusDto,
} from './dto/table.dto';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  @RequirePermissions('tables.read')
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Query('archived') archived?: string,
  ): Promise<unknown> {
    return this.tablesService.list(tenant, archived === 'true');
  }

  @Post()
  @RequirePermissions('tables.create')
  create(
    @Body() dto: CreateTableDto,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.tablesService.create(dto, tenant);
  }

  @Patch(':id')
  @RequirePermissions('tables.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ): Promise<unknown> {
    return this.tablesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('tables.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableStatusDto,
  ): Promise<unknown> {
    return this.tablesService.setStatus(id, dto.status);
  }

  @Patch(':id/archive')
  @RequirePermissions('tables.update')
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.tablesService.archive(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tables.update')
  restore(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.tablesService.restore(id);
  }
}