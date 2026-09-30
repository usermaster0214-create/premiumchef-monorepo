import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, AuthPrincipal } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const tenantId = request.headers['x-tenant-id'];
    const unitId = request.headers['x-unit-id'];

    if (
      typeof authorization !== 'string' ||
      !authorization.startsWith('Bearer ') ||
      typeof tenantId !== 'string' ||
      typeof unitId !== 'string'
    ) {
      throw new UnauthorizedException('Valid token, tenant and unit are required');
    }

    try {
      const claims = await this.jwtService.verifyAsync<AuthPrincipal>(
        authorization.slice('Bearer '.length),
        { secret: process.env.JWT_SECRET },
      );

      if (
        !claims.sub ||
        claims.token_type !== 'access' ||
        claims.tenant_id !== tenantId ||
        !Array.isArray(claims.units) ||
        !claims.units.includes(unitId)
      ) {
        throw new UnauthorizedException('Token tenant or unit does not match');
      }

      request.user = { ...claims, unit_id: unitId };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}