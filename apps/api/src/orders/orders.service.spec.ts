import { BadRequestException } from '@nestjs/common';
import {
  KitchenTicketStatus,
  OrderStatus,
  OrderType,
  TableStatus,
} from '@premiumchef/database';
import { OrdersService } from './orders.service';

const actor = {
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  userId: 'user-1',
};

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        customer: { findFirst: jest.fn() },
        restaurantTable: {
          findFirst: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        product: { findFirst: jest.fn() },
        order: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'order-1',
            orderNumber: 1,
            status: OrderStatus.PENDING,
          }),
          update: jest.fn().mockResolvedValue({ id: 'order-1', total: 12 }),
        },
        orderItem: {
          create: jest.fn().mockImplementation(async ({ data }) => ({
            id: `item-${data.productId}`,
            ...data,
          })),
        },
        orderItemOption: { create: jest.fn() },
        kitchenTicket: {
          create: jest.fn().mockResolvedValue({
            id: 'ticket-1',
            status: KitchenTicketStatus.WAITING,
            kitchenTicketItems: [],
          }),
        },
        orderTable: {
          create: jest.fn(),
          update: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        $transaction: jest.fn(),
      },
    };
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) =>
        callback(prisma.tenantScoped),
    );
    service = new OrdersService(prisma);
  });

  it('uses database prices for immutable order snapshots and creates KDS ticket', async () => {
    prisma.tenantScoped.product.findFirst.mockResolvedValue({
      id: 'product-1',
      name: 'X-Bacon',
      productUnits: [{ unitId: 'unit-1', price: 10, active: true }],
      variants: [],
      productAddons: [
        {
          addonId: 'addon-1',
          maxQuantity: 2,
          addon: { id: 'addon-1', name: 'Bacon extra', price: 2 },
        },
      ],
    });

    await service.create(
      {
        order_type: OrderType.COUNTER,
        items: [
          {
            product_id: 'product-1',
            quantity: 2,
            unit_price: 999,
            options: [{ addon_id: 'addon-1', quantity: 1, unit_price: 0 }],
          },
        ],
      },
      actor,
    );

    expect(prisma.tenantScoped.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          unitId: 'unit-1',
          subtotal: 24,
          total: 24,
        }),
      }),
    );
    expect(prisma.tenantScoped.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productName: 'X-Bacon',
          unitPrice: 10,
          quantity: 2,
          total: 24,
        }),
      }),
    );
    expect(prisma.tenantScoped.orderItemOption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          addonName: 'Bacon extra',
          unitPrice: 2,
          total: 4,
        }),
      }),
    );
    expect(prisma.tenantScoped.kitchenTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitId: 'unit-1',
          status: KitchenTicketStatus.WAITING,
        }),
      }),
    );
  });

  it('requires a table for dine-in orders and occupies it atomically', async () => {
    prisma.tenantScoped.restaurantTable.findFirst.mockResolvedValue({
      id: 'table-1',
      status: TableStatus.AVAILABLE,
    });
    prisma.tenantScoped.product.findFirst.mockResolvedValue({
      id: 'product-1',
      name: 'Suco',
      productUnits: [{ price: 8, active: true }],
      variants: [],
      productAddons: [],
    });

    await expect(
      service.create(
        { order_type: OrderType.DINE_IN, items: [] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.create(
      {
        order_type: OrderType.DINE_IN,
        table_id: 'table-1',
        items: [{ product_id: 'product-1', quantity: 1 }],
      },
      actor,
    );
    expect(prisma.tenantScoped.orderTable.create).toHaveBeenCalledWith({
      data: { orderId: 'order-1', tableId: 'table-1' },
    });
    expect(prisma.tenantScoped.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: TableStatus.OCCUPIED },
    });
  });

  it('adds an item to an open command and creates a new kitchen ticket', async () => {
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      subtotal: 10,
    });
    prisma.tenantScoped.product.findFirst.mockResolvedValue({
      id: 'product-1',
      name: 'Suco',
      productUnits: [{ price: 8, active: true }],
      variants: [],
      productAddons: [],
    });

    await service.addItem(
      'order-1',
      { product_id: 'product-1', quantity: 1 },
      actor,
    );

    expect(prisma.tenantScoped.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { subtotal: 18, total: 18 },
    });
    expect(prisma.tenantScoped.kitchenTicket.create).toHaveBeenCalled();
  });

  it('transfers a command and frees the previous table when no other command remains', async () => {
    prisma.tenantScoped.order.findFirst
      .mockResolvedValueOnce({
        id: 'order-1',
        orderTables: [{ id: 'order-table-1', tableId: 'table-1' }],
      })
      .mockResolvedValueOnce({
        id: 'order-1',
        orderTables: [{ id: 'order-table-1', tableId: 'table-2' }],
      });
    prisma.tenantScoped.restaurantTable.findFirst.mockResolvedValue({
      id: 'table-2',
      status: TableStatus.AVAILABLE,
    });

    await service.transferTable(
      'order-1',
      { table_id: 'table-2' },
      actor,
    );

    expect(prisma.tenantScoped.orderTable.update).toHaveBeenCalledWith({
      where: { id: 'order-table-1' },
      data: { tableId: 'table-2' },
    });
    expect(prisma.tenantScoped.restaurantTable.update).toHaveBeenCalledWith({
      where: { id: 'table-1' },
      data: { status: TableStatus.AVAILABLE },
    });
  });
});