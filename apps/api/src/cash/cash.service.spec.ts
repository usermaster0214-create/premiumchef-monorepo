import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  Prisma,
} from '@premiumchef/database';
import { CashService } from './cash.service';

const actor = {
  tenantId: 'tenant-1',
  unitId: 'unit-1',
  userId: 'user-1',
};

describe('CashService', () => {
  let service: CashService;
  let prisma: {
    tenantScoped: {
      cashRegister: { findFirst: jest.Mock; update: jest.Mock };
      cashSession: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      cashMovement: { create: jest.Mock };
      $transaction: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        cashRegister: {
          findFirst: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        cashSession: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        cashMovement: { create: jest.fn() },
        $transaction: jest.fn(),
      },
    };
    service = new CashService(prisma as never);
  });

  function transactionClient(): any {
    return {
      cashRegister: {
        update: prisma.tenantScoped.cashRegister.update,
      },
      cashSession: {
        findFirst: prisma.tenantScoped.cashSession.findFirst,
        create: prisma.tenantScoped.cashSession.create,
        update: prisma.tenantScoped.cashSession.update,
      },
      cashMovement: prisma.tenantScoped.cashMovement,
    };
  }

  it('opens a register and marks it open in one tenant-scoped transaction', async () => {
    const transaction = transactionClient();
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    transaction.cashRegister = {
      findFirst: jest.fn().mockResolvedValue({ id: 'register-1', status: 'CLOSED' }),
      update: prisma.tenantScoped.cashRegister.update,
    };
    transaction.cashSession.create.mockResolvedValue({
      id: 'session-1',
      status: CashSessionStatus.OPEN,
    });
    transaction.cashSession.findFirst.mockResolvedValue(null);

    await service.open(
      { cash_register_id: 'register-1', opening_amount: 200 },
      actor,
    );

    expect(prisma.tenantScoped.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.cashSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cashRegisterId: 'register-1',
          userId: 'user-1',
          openingAmount: 200,
        }),
      }),
    );
    expect(prisma.tenantScoped.cashRegister.update).toHaveBeenCalledWith({
      where: { id: 'register-1' },
      data: { status: 'OPEN' },
    });
  });

  it('rejects a second opening for an already open register', async () => {
    const transaction = transactionClient();
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    transaction.cashRegister = {
      findFirst: jest.fn().mockResolvedValue({ id: 'register-1', status: 'OPEN' }),
      update: prisma.tenantScoped.cashRegister.update,
    };

    await expect(
      service.open(
        { cash_register_id: 'register-1', opening_amount: 100 },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a withdrawal larger than the available cash', async () => {
    const transaction = transactionClient();
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    transaction.cashSession.findFirst.mockResolvedValue({
      id: 'session-1',
      openingAmount: new Prisma.Decimal(100),
      cashMovements: [],
    });

    await expect(
      service.addMovement(
        'session-1',
        { type: CashMovementType.WITHDRAWAL, amount: 101 },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenantScoped.cashMovement.create).not.toHaveBeenCalled();
  });

  it('closes the session with expected amount and difference', async () => {
    const transaction = transactionClient();
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(transaction),
    );
    transaction.cashSession.findFirst.mockResolvedValue({
      id: 'session-1',
      cashRegisterId: 'register-1',
      openingAmount: new Prisma.Decimal(100),
      cashMovements: [
        { type: CashMovementType.DEPOSIT, amount: new Prisma.Decimal(50) },
        { type: CashMovementType.WITHDRAWAL, amount: new Prisma.Decimal(20) },
      ],
    });
    transaction.cashSession.update.mockResolvedValue({
      id: 'session-1',
      status: CashSessionStatus.CLOSED,
    });

    const result = await service.close(
      'session-1',
      { counted_amount: 130 },
      actor,
    );

    expect(transaction.cashSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({
        status: CashSessionStatus.CLOSED,
        expectedAmount: 130,
        countedAmount: 130,
        difference: 0,
      }),
    });
    expect(result.reconciliation).toEqual({
      expected_amount: 130,
      counted_amount: 130,
      difference: 0,
    });
  });
});