import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { CreateSplitsDto } from './dto/create-splits.dto';

type SplitActor = CurrentTenantContext & { userId: string };

function cents(value: number | { toString(): string }) {
  return Math.round(Number(value) * 100);
}

@Injectable()
export class SplitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orderId: string): Promise<unknown> {
    const order = await this.prisma.tenantScoped.order.findFirst({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return this.prisma.tenantScoped.orderSplit.findMany({
      where: { orderId },
      include: { splitItems: true, payments: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(orderId: string, dto: CreateSplitsDto, _actor: SplitActor): Promise<unknown> {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: {
          id: orderId,
          status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
        },
        include: { orderItems: true, splits: true },
      });
      if (!order) throw new NotFoundException('Pedido aberto não encontrado');
      if (order.splits.length) {
        throw new ConflictException('Este pedido já possui uma divisão de conta');
      }

      const itemMap = new Map(order.orderItems.map((item) => [item.id, item]));
      const claimedItems = new Set<string>();
      let totalCents = 0;
      const prepared = dto.splits.map((split) => {
        const itemIds = split.item_ids ?? [];
        if (!itemIds.length && split.amount === undefined) {
          throw new BadRequestException(`Informe itens ou valor para ${split.name}`);
        }
        let amountCents = split.amount === undefined ? 0 : cents(split.amount);
        const splitItems = [];
        for (const itemId of itemIds) {
          const item = itemMap.get(itemId);
          if (!item) throw new BadRequestException('Item não pertence ao pedido');
          if (claimedItems.has(itemId)) throw new BadRequestException('Item repetido em mais de uma divisão');
          claimedItems.add(itemId);
          const itemAmount = cents(item.total);
          amountCents += itemAmount;
          splitItems.push({ orderItemId: item.id, quantity: item.quantity, amount: itemAmount / 100 });
        }
        totalCents += amountCents;
        return { name: split.name.trim(), amountCents, splitItems };
      });

      if (totalCents !== cents(order.total)) {
        throw new BadRequestException('A divisão deve totalizar exatamente o pedido');
      }

      return Promise.all(
        prepared.map((split) =>
          transaction.orderSplit.create({
            data: {
              orderId: order.id,
              name: split.name,
              amount: split.amountCents / 100,
              splitItems: split.splitItems.length ? { create: split.splitItems } : undefined,
            },
            include: { splitItems: true },
          }),
        ),
      );
    });
  }
}