import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderStatus } from '@premiumchef/database';
import { SplitsService } from './splits.service';

describe('SplitsService', () => {
  let service: SplitsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        order: { findFirst: jest.fn() },
        orderSplit: { findMany: jest.fn(), create: jest.fn() },
        $transaction: jest.fn(),
      },
    };
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(prisma.tenantScoped),
    );
    service = new SplitsService(prisma);
  });

  it('creates item-based and people/value-based splits totaling the order', async () => {
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      total: 30,
      status: OrderStatus.PENDING,
      orderItems: [
        { id: 'item-1', quantity: 1, total: 10 },
        { id: 'item-2', quantity: 1, total: 20 },
      ],
      splits: [],
    });
    prisma.tenantScoped.orderSplit.create.mockImplementation(async ({ data }: any) => data);

    const result = await service.create('order-1', {
      splits: [
        { name: 'Pessoa 1', item_ids: ['item-1'] },
        { name: 'Pessoa 2', amount: 20 },
      ],
    }, { tenantId: 'tenant-1', unitId: 'unit-1', userId: 'user-1' });

    expect(result).toHaveLength(2);
    expect(prisma.tenantScoped.orderSplit.create).toHaveBeenCalledTimes(2);
    expect(prisma.tenantScoped.orderSplit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 10 }) }),
    );
  });

  it('rejects duplicate items and totals that do not match the order', async () => {
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      total: 30,
      status: OrderStatus.PENDING,
      orderItems: [{ id: 'item-1', quantity: 1, total: 10 }],
      splits: [],
    });

    await expect(service.create('order-1', {
      splits: [{ name: 'A', item_ids: ['item-1'] }, { name: 'B', item_ids: ['item-1'] }],
    }, { tenantId: 'tenant-1', unitId: 'unit-1', userId: 'user-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not create a second division for the same order', async () => {
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      total: 10,
      status: OrderStatus.PENDING,
      orderItems: [],
      splits: [{ id: 'split-1' }],
    });

    await expect(service.create('order-1', { splits: [{ name: 'A', amount: 10 }] }, {
      tenantId: 'tenant-1', unitId: 'unit-1', userId: 'user-1',
    })).rejects.toBeInstanceOf(ConflictException);
  });
});