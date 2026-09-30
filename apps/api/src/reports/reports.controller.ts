import { Controller, Get, Query } from '@nestjs/common';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @RequirePermissions('reports.view')
  summary(@Query() query: ReportQueryDto, @CurrentTenant() tenant: CurrentTenantContext): Promise<unknown> {
    return this.reportsService.summary(query, tenant);
  }
}