import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TableStatus } from '@premiumchef/database';
import { TablesService } from './tables.service';

const tenant = { tenantId: 'tenant-1', unitId: 'unit-1' };

describe('TablesService', () => {
  let service: TablesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        restaurantTable: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({ id: 'table-1' }),
        },
        $transaction: jest.fn(),
      },
    };
    service = new TablesService(prisma);
  });

  it('lists active tables scoped to the selected unit by default', async () => {
    prisma.tenantScoped.restaurantTable.findMany.mockResolvedValue([]);

    await service.list(tenant);

    expect(prisma.tenantScoped.restaurantTable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unitId: 'unit-1', isActive: true } }),
    );
  });

  it('lists archived tables separately', async () => {
    prisma.tenantScoped.restaurantTable.findMany.mockResolvedValue([]);

    await service.list(tenant, true);

    expect(prisma.tenantScoped.restaurantTable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unitId: 'unit-1', isActive: false } }),
    );
  });

  it('archives a table without an open command', async () => {
    const transaction = prisma.tenantScoped;
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    prisma.tenantScoped.restaurantTable.findFirst.mockResolvedValue({
      id: 'table-1',
      orderTables: [],
    });

    await service.archive('table-1');

    expect(prisma.tenantScoped.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { isActive: false },
    });
  });

  it('does not archive a table with an open command', async () => {
    const transaction = prisma.tenantScoped;
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    prisma.tenantScoped.restaurantTable.findFirst.mockResolvedValue({
      id: 'table-1',
      orderTables: [{ orderId: 'order-1' }],
    });

    await expect(service.archive('table-1')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenantScoped.restaurantTable.update).not.toHaveBeenCalled();
  });

  it('does not release a table with an open command', async () => {
    const transaction = prisma.tenantScoped;
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    prisma.tenantScoped.restaurantTable.findFirst.mockResolvedValue({
      id: 'table-1',
      status: TableStatus.OCCUPIED,
      orderTables: [{ orderId: 'order-1' }],
    });

    await expect(
      service.setStatus('table-1', TableStatus.AVAILABLE),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tenantScoped.restaurantTable.update).not.toHaveBeenCalled();
  });

  it('does not occupy a blocked table directly', async () => {
    const transaction = prisma.tenantScoped;
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    prisma.tenantScoped.restaurantTable.findFirst.mockResolvedValue({
      id: 'table-1',
      status: TableStatus.BLOCKED,
      orderTables: [],
    });

    await expect(
      service.setStatus('table-1', TableStatus.OCCUPIED),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores completed orders when checking whether a table is free', async () => {
    const transaction = prisma.tenantScoped;
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    prisma.tenantScoped.restaurantTable.findFirst.mockResolvedValue({
      id: 'table-1',
      status: TableStatus.OCCUPIED,
      orderTables: [],
    });

    await service.setStatus('table-1', TableStatus.AVAILABLE);

    expect(prisma.tenantScoped.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: TableStatus.AVAILABLE },
    });
  });
});