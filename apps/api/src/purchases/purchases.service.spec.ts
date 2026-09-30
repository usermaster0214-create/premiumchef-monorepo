import { InventoryMovementType } from '@premiumchef/database';
import { PurchasesService } from './purchases.service';

describe('PurchasesService', () => {
  it('enters purchased quantity and creates a PURCHASE movement atomically', async () => {
    const prisma: any = { tenantScoped: { supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'supplier-1' }) }, product: { findFirst: jest.fn().mockResolvedValue({ id: 'product-1' }) }, purchase: { create: jest.fn().mockResolvedValue({ id: 'purchase-1' }) }, inventory: { findFirst: jest.fn().mockResolvedValue({ id: 'inventory-1', quantity: 5 }), update: jest.fn() }, inventoryMovement: { create: jest.fn() }, productUnit: { findFirst: jest.fn().mockResolvedValue({ id: 'pu-1', costPrice: 10 }), update: jest.fn() }, $transaction: jest.fn() } };
    prisma.tenantScoped.$transaction.mockImplementation((callback: (client: any) => Promise<unknown>) => callback(prisma.tenantScoped));
    const service = new PurchasesService(prisma);

    await service.create({ supplier_id: 'supplier-1', items: [{ product_id: 'product-1', quantity: 2, unit_cost: 12 }] }, { tenantId: 'tenant-1', unitId: 'unit-1', userId: 'user-1' });

    expect(prisma.tenantScoped.inventory.update).toHaveBeenCalledWith({ where: { id: 'inventory-1' }, data: { quantity: 7 } });
    expect(prisma.tenantScoped.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: InventoryMovementType.PURCHASE, quantity: 2, previousQuantity: 5, newQuantity: 7 }) });
    expect(prisma.tenantScoped.productUnit.update).toHaveBeenCalledWith({ where: { id: 'pu-1' }, data: { costPrice: expect.closeTo(10.5714, 3) } });
  });
});