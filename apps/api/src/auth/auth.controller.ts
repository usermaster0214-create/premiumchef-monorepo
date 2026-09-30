import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { AuthenticatedRequest } from './auth.types';
import { AuthService } from './auth.service';
import { CurrentTenant, CurrentTenantContext } from './current-tenant.decorator';
import { LoginDto } from './login.dto';
import { Public } from './public.decorator';
import { RefreshTokenDto } from './refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Get('me')
  me(
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ) {
    return this.authService.getProfile({
      ...request.user!,
      tenant_id: tenant.tenantId,
      unit_id: tenant.unitId,
    });
  }
}