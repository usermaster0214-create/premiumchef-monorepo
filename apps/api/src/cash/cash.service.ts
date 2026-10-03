import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  Prisma,
} from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import {
  CloseCashSessionDto,
  CreateCashMovementDto,
  OpenCashSessionDto,
} from './dto/cash-session.dto';

type CashActor = CurrentTenantContext & { userId: string };

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  listRegisters(unitId: string): Promise<unknown> {
    return this.prisma.tenantScoped.cashRegister.findMany({
      where: { unitId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true },
    });
  }

  async open(dto: OpenCashSessionDto, actor: CashActor) {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const register = await transaction.cashRegister.findFirst({
        where: { id: dto.cash_register_id },
        select: { id: true, status: true },
      });
      if (!register) {
        throw new NotFoundException('Caixa não encontrado nesta unidade');
      }
      if (register.status === 'OPEN') {
        throw new ConflictException('Este caixa já possui uma sessão aberta');
      }

      const existingOpenSession = await transaction.cashSession.findFirst({
        where: {
          cashRegisterId: register.id,
          status: CashSessionStatus.OPEN,
        },
        select: { id: true },
      });
      if (existingOpenSession) {
        throw new ConflictException('Este caixa já possui uma sessão aberta');
      }

      const session = await transaction.cashSession.create({
        data: {
          cashRegisterId: register.id,
          userId: actor.userId,
          openingAmount: dto.opening_amount,
          status: CashSessionStatus.OPEN,
        },
        include: {
          cashRegister: true,
          cashMovements: true,
        },
      });

      await transaction.cashRegister.update({
        where: { id: register.id },
        data: { status: 'OPEN' },
      });

      return session;
    });
  }

  async getOpen(actor: CashActor) {
    return this.prisma.tenantScoped.cashSession.findFirst({
      where: {
        userId: actor.userId,
        status: CashSessionStatus.OPEN,
      },
      include: {
        cashRegister: true,
        cashMovements: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async addMovement(
    sessionId: string,
    dto: CreateCashMovementDto,
    actor: CashActor,
  ) {
    if (dto.type === CashMovementType.SALE || dto.type === CashMovementType.REFUND) {
      throw new BadRequestException(
        'Movimentações SALE e REFUND são geradas pelo fluxo de pedidos',
      );
    }

    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const session = await transaction.cashSession.findFirst({
        where: {
          id: sessionId,
          userId: actor.userId,
          status: CashSessionStatus.OPEN,
        },
        include: { cashMovements: true },
      });
      if (!session) {
        throw new NotFoundException('Sessão de caixa aberta não encontrada');
      }

      const expectedBefore = this.calculateExpected(session.openingAmount, session.cashMovements);
      if (dto.type === CashMovementType.WITHDRAWAL && dto.amount > expectedBefore) {
        throw new BadRequestException('A sangria não pode exceder o saldo disponível em caixa');
      }

      return transaction.cashMovement.create({
        data: {
          cashSessionId: session.id,
          userId: actor.userId,
          type: dto.type,
          amount: dto.amount,
          description: dto.description?.trim(),
        },
      });
    });
  }

  async close(
    sessionId: string,
    dto: CloseCashSessionDto,
    actor: CashActor,
  ) {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const session = await transaction.cashSession.findFirst({
        where: {
          id: sessionId,
          userId: actor.userId,
          status: CashSessionStatus.OPEN,
        },
        include: { cashMovements: true },
      });
      if (!session) {
        throw new NotFoundException('Sessão de caixa aberta não encontrada');
      }

      const expectedAmount = this.calculateExpected(
        session.openingAmount,
        session.cashMovements,
      );
      const difference = dto.counted_amount - expectedAmount;
      const closed = await transaction.cashSession.update({
        where: { id: session.id },
        data: {
          status: CashSessionStatus.CLOSED,
          closedAt: new Date(),
          expectedAmount,
          countedAmount: dto.counted_amount,
          difference,
        },
      });

      await transaction.cashRegister.update({
        where: { id: session.cashRegisterId },
        data: { status: 'CLOSED' },
      });

      return {
        ...closed,
        reconciliation: {
          expected_amount: expectedAmount,
          counted_amount: dto.counted_amount,
          difference,
        },
      };
    });
  }

  private calculateExpected(
    openingAmount: Prisma.Decimal,
    movements: { type: CashMovementType; amount: Prisma.Decimal }[],
  ): number {
    return Number(openingAmount) + movements.reduce((total, movement) => {
      const amount = Number(movement.amount);
      if (
        movement.type === CashMovementType.WITHDRAWAL ||
        movement.type === CashMovementType.REFUND
      ) {
        return total - amount;
      }
      return total + amount;
    }, 0);
  }
}