import { BadRequestException } from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@premiumchef/database';
import { PaymentsService } from './payments.service';

const actor = {
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  userId: 'user-1',
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        order: {
          findFirst: jest.fn(),
          update: jest.fn().mockResolvedValue({
            id: 'order-1',
            status: OrderStatus.COMPLETED,
          }),
        },
        payment: {
          create: jest.fn().mockImplementation(async ({ data }) => data),
        },
        cashSession: { findFirst: jest.fn() },
        cashMovement: { create: jest.fn() },
        inventory: {
          findFirst: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        inventoryMovement: { create: jest.fn() },
        $transaction: jest.fn(),
      },
    };
    service = new PaymentsService(prisma);
  });

  function useTransaction() {
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) =>
        callback(prisma.tenantScoped),
    );
  }

  it('accepts split payments and posts the cash part to the open session', async () => {
    useTransaction();
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      orderNumber: 42,
      total: new Prisma.Decimal(100),
      status: OrderStatus.CONFIRMED,
      payments: [],
      orderItems: [],
      splits: [],
      orderTables: [],
    });
    prisma.tenantScoped.cashSession.findFirst.mockResolvedValue({
      id: 'session-1',
      status: CashSessionStatus.OPEN,
    });

    const result = await service.create(
      'order-1',
      {
        payments: [
          { payment_method: 'PIX', amount: 60 },
          { payment_method: 'CASH', amount: 40 },
        ],
      },
      actor,
    );

    expect(prisma.tenantScoped.payment.create).toHaveBeenCalledTimes(2);
    expect(prisma.tenantScoped.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cashSessionId: 'session-1',
        userId: 'user-1',
        type: CashMovementType.SALE,
        amount: 40,
      }),
    });
    expect(prisma.tenantScoped.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({ status: OrderStatus.COMPLETED }),
    });
    expect(result.payments).toHaveLength(2);
  });

  it('rejects payments that do not settle the remaining balance', async () => {
    useTransaction();
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      total: new Prisma.Decimal(100),
      status: OrderStatus.CONFIRMED,
      payments: [],
      orderItems: [],
      splits: [],
      orderTables: [],
    });

    await expect(
      service.create(
        'order-1',
        { payments: [{ payment_method: 'PIX', amount: 99.99 }] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenantScoped.payment.create).not.toHaveBeenCalled();
  });

  it('requires an open cash session for cash payments', async () => {
    useTransaction();
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      total: new Prisma.Decimal(50),
      status: OrderStatus.CONFIRMED,
      payments: [],
      orderItems: [],
      splits: [],
      orderTables: [],
    });
    prisma.tenantScoped.cashSession.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        'order-1',
        { payments: [{ payment_method: 'CASH', amount: 50 }] },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenantScoped.payment.create).not.toHaveBeenCalled();
  });

  it('deducts recipe ingredients and records SALE inventory movements atomically', async () => {
    useTransaction();
    prisma.tenantScoped.order.findFirst.mockResolvedValue({
      id: 'order-1',
      total: new Prisma.Decimal(20),
      status: OrderStatus.CONFIRMED,
      payments: [],
      splits: [],
      orderTables: [],
      orderItems: [
        {
          quantity: new Prisma.Decimal(2),
          product: {
            trackStock: true,
            recipes: [
              {
                yieldQuantity: new Prisma.Decimal(1),
                recipeItems: [
                  {
                    ingredientProductId: 'ingredient-1',
                    quantity: new Prisma.Decimal(0.5),
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    prisma.tenantScoped.inventory.findFirst.mockResolvedValue({
      id: 'inventory-1',
      quantity: new Prisma.Decimal(5),
    });

    await service.create(
      'order-1',
      { payments: [{ payment_method: 'PIX', amount: 20 }] },
      actor,
    );

    expect(prisma.tenantScoped.inventory.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'inventory-1',
        unitId: 'unit-1',
        quantity: { gte: 1 },
      }),
      data: { quantity: { decrement: 1 } },
    });
    expect(prisma.tenantScoped.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        unitId: 'unit-1',
        productId: 'ingredient-1',
        type: 'SALE',
        quantity: -1,
        previousQuantity: 5,
        newQuantity: 4,
        referenceId: 'order-1',
      }),
    });
  });
});