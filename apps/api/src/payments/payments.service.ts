import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  InventoryMovementType,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { CreatePaymentsDto } from './dto/create-payments.dto';

type PaymentActor = CurrentTenantContext & { userId: string };

function cents(value: Prisma.Decimal | number): number {
  return Math.round(Number(value) * 100);
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    orderId: string,
    dto: CreatePaymentsDto,
    actor: PaymentActor,
  ) {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: { id: orderId },
        include: {
          payments: true,
          splits: true,
          orderTables: true,
          orderItems: {
            include: {
              product: {
                include: {
                  recipes: {
                    where: { status: 'ACTIVE' },
                    include: { recipeItems: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!order) {
        throw new NotFoundException('Pedido não encontrado nesta unidade');
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new ConflictException('Não é possível pagar um pedido cancelado');
      }

      const split = dto.split_id
        ? order.splits.find((candidate) => candidate.id === dto.split_id)
        : undefined;
      if (dto.split_id && (!split || split.status !== 'OPEN')) {
        throw new BadRequestException('Divisão não encontrada ou já quitada');
      }
      if (!dto.split_id && order.splits.some((candidate) => candidate.status === 'OPEN')) {
        throw new BadRequestException('Informe a divisão que será quitada');
      }

      const paidCents = order.payments
        .filter((payment) => payment.status === PaymentStatus.PAID)
        .filter((payment) => (dto.split_id ? payment.splitId === dto.split_id : true))
        .reduce((sum, payment) => sum + cents(payment.amount), 0);
      const requestedCents = dto.payments.reduce(
        (sum, payment) => sum + cents(payment.amount),
        0,
      );
      const remainingCents = (split ? cents(split.amount) : cents(order.total)) - paidCents;
      if (requestedCents !== remainingCents) {
        throw new BadRequestException(
          `Os pagamentos devem totalizar exatamente R$ ${(remainingCents / 100).toFixed(2)}`,
        );
      }

      const cashAmount = dto.payments
        .filter((payment) => payment.payment_method === 'CASH')
        .reduce((sum, payment) => sum + payment.amount, 0);
      let cashSessionId: string | undefined;
      if (cashAmount > 0) {
        const cashSession = await transaction.cashSession.findFirst({
          where: {
            userId: actor.userId,
            status: CashSessionStatus.OPEN,
          },
          select: { id: true },
        });
        if (!cashSession) {
          throw new BadRequestException(
            'Abra uma sessão de caixa antes de receber dinheiro',
          );
        }
        cashSessionId = cashSession.id;
      }

      const payments = await Promise.all(
        dto.payments.map((payment) =>
          transaction.payment.create({
            data: {
              orderId: order.id,
              splitId: dto.split_id,
              paymentMethod: payment.payment_method,
              amount: payment.amount,
              transactionId: payment.transaction_id?.trim(),
              status: PaymentStatus.PAID,
            },
          }),
        ),
      );

      if (cashSessionId) {
        await transaction.cashMovement.create({
          data: {
            cashSessionId,
            userId: actor.userId,
            type: CashMovementType.SALE,
            amount: cashAmount,
            description: `Pagamento do pedido ${order.orderNumber}`,
          },
        });
      }

      if (split) {
        await transaction.orderSplit.update({
          where: { id: split.id },
          data: { status: 'PAID' },
        });
      }
      const completesOrder = split
        ? order.splits.every((candidate) => candidate.id === split.id || candidate.status === 'PAID')
        : true;
      if (completesOrder) {
        await this.deductInventory(transaction, order, actor);
        await transaction.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        await this.releaseTables(transaction, order.orderTables);
      }

      const updatedOrder = completesOrder
        ? { ...order, status: OrderStatus.COMPLETED }
        : order;

      return { order: updatedOrder, payments };
    });
  }

  private async releaseTables(
    transaction: any,
    orderTables: { tableId: string }[],
  ): Promise<void> {
    for (const orderTable of orderTables) {
      const otherOpenOrder = await transaction.orderTable.findFirst({
        where: {
          tableId: orderTable.tableId,
          order: {
            status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
          },
        },
        select: { id: true },
      });
      if (!otherOpenOrder) {
        await transaction.restaurantTable.update({
          where: { id: orderTable.tableId },
          data: { status: 'AVAILABLE' },
        });
      }
    }
  }

  private async deductInventory(
    transaction: any,
    order: any,
    actor: PaymentActor,
  ): Promise<void> {
    for (const orderItem of order.orderItems) {
      if (!orderItem.product?.trackStock || !orderItem.product.recipes.length) {
        continue;
      }

      const recipe = orderItem.product.recipes[0];
      for (const recipeItem of recipe.recipeItems) {
        const requiredQuantity =
          (Number(recipeItem.quantity) / Number(recipe.yieldQuantity)) *
          Number(orderItem.quantity);
        const inventory = await transaction.inventory.findFirst({
          where: {
            productId: recipeItem.ingredientProductId,
            unitId: actor.unitId,
          },
          select: { id: true, quantity: true },
        });
        if (!inventory || Number(inventory.quantity) < requiredQuantity) {
          throw new BadRequestException(
            `Estoque insuficiente para o insumo ${recipeItem.ingredientProductId}`,
          );
        }

        const previousQuantity = Number(inventory.quantity);
        const newQuantity = previousQuantity - requiredQuantity;
        const updated = await transaction.inventory.updateMany({
          where: {
            id: inventory.id,
            unitId: actor.unitId,
            quantity: { gte: requiredQuantity },
          },
          data: { quantity: { decrement: requiredQuantity } },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            `Estoque insuficiente para o insumo ${recipeItem.ingredientProductId}`,
          );
        }

        await transaction.inventoryMovement.create({
          data: {
            unitId: actor.unitId,
            productId: recipeItem.ingredientProductId,
            userId: actor.userId,
            type: InventoryMovementType.SALE,
            quantity: -requiredQuantity,
            previousQuantity,
            newQuantity,
            referenceType: 'ORDER',
            referenceId: order.id,
            reason: 'Baixa automática por ficha técnica',
          },
        });
      }
    }
  }
}