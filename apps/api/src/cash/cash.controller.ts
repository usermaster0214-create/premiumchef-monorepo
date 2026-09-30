import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CashService } from './cash.service';
import {
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
} from './dto/cash-session.dto';

@Controller('cash-sessions')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('cash.open')
  open(
    @Body() dto: OpenCashSessionDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.cashService.open(dto, {
      ...tenant,
      userId: request.user!.sub,
    });
  }

  @Get('current')
  @RequirePermissions('cash.read')
  current(
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.cashService.getOpen({
      ...tenant,
      userId: request.user!.sub,
    });
  }

  @Post(':id/movements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('cash.movement')
  movement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCashMovementDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.cashService.addMovement(id, dto, {
      ...tenant,
      userId: request.user!.sub,
    });
  }

  @Patch(':id/close')
  @RequirePermissions('cash.close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseCashSessionDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.cashService.close(id, dto, {
      ...tenant,
      userId: request.user!.sub,
    });
  }
}