import { Injectable, NestMiddleware } from '@nestjs/common';
import { runWithTenantContext } from '@premiumchef/database';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const tenantId = request.header('x-tenant-id');
    const unitId = request.header('x-unit-id');

    if (tenantId && unitId) {
      runWithTenantContext({ tenantId, unitId }, next);
      return;
    }

    next();
  }
}