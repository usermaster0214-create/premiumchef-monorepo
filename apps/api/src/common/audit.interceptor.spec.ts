import { ExecutionContext } from '@nestjs/common';
import { Prisma } from '@premiumchef/database';
import { lastValueFrom, of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor', () => {
  it('records mutations and redacts credentials from the payload', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const findFirst = jest.fn().mockResolvedValue({
      id: 'order-1',
      total: 20,
      passwordHash: 'do-not-store',
    });
    const interceptor = new AuditInterceptor({
      tenantScoped: { auditLog: { create }, order: { findFirst } },
      auditLog: { create },
      order: { findFirst },
    } as never);
    const request = {
      method: 'PATCH',
      originalUrl: '/api/v1/orders/order-1',
      params: { id: 'order-1' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
      body: { total: 25, password: 'do-not-store', refresh_token: 'secret' },
      user: {
        sub: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
        tenant_id: 'tenant-1',
        unit_id: 'unit-1',
        units: ['unit-1'],
        roles: ['CAIXA'],
        permissions: ['orders.create'],
        token_type: 'access' as const,
      },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      await interceptor.intercept(context, {
        handle: () => of({ id: 'order-1' }),
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        unitId: 'unit-1',
        userId: 'user-1',
        action: 'PATCH /api/v1/orders/order-1',
        entity: 'orders',
        entityId: 'order-1',
        oldData: { id: 'order-1', total: 20 },
        newData: { total: 25 },
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    });
  });
});