import { PrismaClient, tenantPrismaExtension } from '@premiumchef/database';
import { runWithTenantContext } from '@premiumchef/database';

describe('tenant Prisma extension', () => {
  const prisma = new PrismaClient().$extends(tenantPrismaExtension);

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
});