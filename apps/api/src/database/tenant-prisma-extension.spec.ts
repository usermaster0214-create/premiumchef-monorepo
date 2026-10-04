import { Prisma, PrismaClient, tenantPrismaExtension } from '@premiumchef/database';
import { runWithTenantContext } from '@premiumchef/database';

describe('tenant Prisma extension', () => {
  const capturedOperations: Array<{
    model: string;
    operation: string;
    args: Record<string, unknown>;
  }> = [];
  const captureExtension = Prisma.defineExtension({
    name: 'capture-tenant-args',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          capturedOperations.push({
            model,
            operation,
            args: args as Record<string, unknown>,
          });
          return {};
        },
      },
    },
  });
  const prisma = new PrismaClient()
    .$extends(tenantPrismaExtension)
    .$extends(captureExtension);

  beforeEach(() => {
    capturedOperations.length = 0;
  });

  it('rejects database operations without tenant and unit context', async () => {
    await expect(prisma.user.findMany()).rejects.toThrow(
      'Tenant context is required for database operations',
    );
  });

  it('rejects physical deletion even with a valid tenant context', async () => {
    await expect(
      runWithTenantContext(
        { tenantId: 'tenant-1', unitId: 'unit-1' },
        () => prisma.product.delete({ where: { id: 'product-1' } }),
      ),
    ).rejects.toThrow('Physical deletion is not allowed');
  });

  it('scopes product updates in the where clause without adding tenantId to update data', async () => {
    await runWithTenantContext(
      { tenantId: 'tenant-1', unitId: 'unit-1' },
      async () => await prisma.product.update({
        where: { id: 'product-1' },
        data: { imageUrl: 'https://cdn.example/product.png' },
      }),
    );

    expect(capturedOperations[0]).toMatchObject({
      model: 'Product',
      operation: 'update',
      args: {
        where: { id: 'product-1', AND: [{ tenantId: 'tenant-1' }] },
        data: { imageUrl: 'https://cdn.example/product.png' },
      },
    });
  });

  it('scopes upsert updates without mutating their update data', async () => {
    await runWithTenantContext(
      { tenantId: 'tenant-1', unitId: 'unit-1' },
      async () => await prisma.product.upsert({
        where: { id: 'product-1' },
        create: {
          name: 'Produto',
          tenant: { connect: { id: 'tenant-1' } },
        },
        update: { imageUrl: 'https://cdn.example/product.png' },
      }),
    );

    expect(capturedOperations[0]).toMatchObject({
      model: 'Product',
      operation: 'upsert',
      args: {
        where: { id: 'product-1', AND: [{ tenantId: 'tenant-1' }] },
        create: { name: 'Produto', tenantId: 'tenant-1' },
        update: { imageUrl: 'https://cdn.example/product.png' },
      },
    });
  });
});