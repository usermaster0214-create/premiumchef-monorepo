import {
  getTenantContext,
  runWithTenantContext,
} from '@premiumchef/database';

describe('tenant context', () => {
  it('isolates tenant and unit context across asynchronous tasks', async () => {
    const first = runWithTenantContext(
      { tenantId: 'tenant-a', unitId: 'unit-a' },
      async () => {
        await Promise.resolve();
        return getTenantContext();
      },
    );
    const second = runWithTenantContext(
      { tenantId: 'tenant-b', unitId: 'unit-b' },
      async () => {
        await Promise.resolve();
        return getTenantContext();
      },
    );

    await expect(first).resolves.toEqual({
      tenantId: 'tenant-a',
      unitId: 'unit-a',
    });
    await expect(second).resolves.toEqual({
      tenantId: 'tenant-b',
      unitId: 'unit-b',
    });
    expect(getTenantContext()).toBeUndefined();
  });
});