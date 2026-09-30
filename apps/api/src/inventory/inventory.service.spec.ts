import { BadRequestException } from '@nestjs/common';
import { InventoryMovementType } from '@premiumchef/database';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any;

  beforeEach(() => {
    prisma = { tenantScoped: { inventory: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() }, product: { findFirst: jest.fn() }, inventoryMovement: { create: jest.fn() }, $transaction: jest.fn() } };
    prisma.tenantScoped.$transaction.mockImplementation((callback: (client: any) => Promise<unknown>) => callback(prisma.tenantScoped));
    service = new InventoryService(prisma);
  });

  it('moves stock down for a loss and records the previous/new quantities', async () => {
    prisma.tenantScoped.product.findFirst.mockResolvedValue({ id: 'product-1' });
    prisma.tenantScoped.inventory.findFirst.mockResolvedValue({ id: 'inventory-1', quantity: 10 });

    await service.move({ product_id: 'product-1', type: InventoryMovementType.LOSS, quantity: 2, reason: 'Avaria' }, { tenantId: 'tenant-1', unitId: 'unit-1', userId: 'user-1' });

    expect(prisma.tenantScoped.inventory.update).toHaveBeenCalledWith({ where: { id: 'inventory-1' }, data: { quantity: 8 } });
    expect(prisma.tenantScoped.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantity: -2, previousQuantity: 10, newQuantity: 8 }) });
  });

  it('rejects a movement that would make stock negative', async () => {
    prisma.tenantScoped.product.findFirst.mockResolvedValue({ id: 'product-1' });
    prisma.tenantScoped.inventory.findFirst.mockResolvedValue({ id: 'inventory-1', quantity: 1 });

    await expect(service.move({ product_id: 'product-1', type: InventoryMovementType.LOSS, quantity: 2 }, { tenantId: 'tenant-1', unitId: 'unit-1', userId: 'user-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenantScoped.inventory.update).not.toHaveBeenCalled();
  });
});