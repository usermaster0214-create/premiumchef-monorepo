import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from './auth.types';

export interface CurrentTenantContext {
  tenantId: string;
  unitId: string;
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentTenantContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.tenant_id || !request.user.unit_id) {
      throw new UnauthorizedException('Tenant and unit context are required');
    }

    return {
      tenantId: request.user.tenant_id,
      unitId: request.user.unit_id,
    };
  },
);