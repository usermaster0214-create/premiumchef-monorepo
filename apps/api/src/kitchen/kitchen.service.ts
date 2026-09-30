import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KitchenTicketStatus,
  OrderItemStatus,
  OrderStatus,
} from '@premiumchef/database';
import { PrismaService } from '../database/prisma.service';

const itemStatusByTicket: Record<KitchenTicketStatus, OrderItemStatus> = {
  WAITING: OrderItemStatus.WAITING,
  PREPARING: OrderItemStatus.PREPARING,
  READY: OrderItemStatus.READY,
  DELIVERED: OrderItemStatus.DELIVERED,
  CANCELLED: OrderItemStatus.CANCELLED,
};

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: KitchenTicketStatus[]): Promise<unknown> {
    return this.prisma.tenantScoped.kitchenTicket.findMany({
      where: status?.length ? { status: { in: status } } : {},
      include: {
        order: {
          select: { id: true, orderNumber: true, orderType: true, notes: true },
        },
        kitchenTicketItems: {
          include: {
            orderItem: {
              select: { productName: true, quantity: true, notes: true, status: true },
            },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async updateStatus(ticketId: string, status: KitchenTicketStatus): Promise<unknown> {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const ticket = await transaction.kitchenTicket.findFirst({
        where: { id: ticketId },
        include: { kitchenTicketItems: true },
      });
      if (!ticket) throw new NotFoundException('Ticket de cozinha não encontrado');
      if (!this.isAllowedTransition(ticket.status, status)) {
        throw new BadRequestException(`Transição inválida: ${ticket.status} -> ${status}`);
      }

      const updated = await transaction.kitchenTicket.update({
        where: { id: ticket.id },
        data: {
          status,
          startedAt: status === KitchenTicketStatus.PREPARING ? new Date() : undefined,
          readyAt: status === KitchenTicketStatus.READY ? new Date() : undefined,
        },
        include: { kitchenTicketItems: true },
      });
      await Promise.all(
        ticket.kitchenTicketItems.map((item) =>
          transaction.kitchenTicketItem.update({
            where: { id: item.id },
            data: { status: itemStatusByTicket[status] },
          }),
        ),
      );

      const orderStatus = this.orderStatusForTicket(status);
      if (orderStatus) {
        await transaction.order.update({
          where: { id: ticket.orderId },
          data: { status: orderStatus },
        });
      }
      return { previousStatus: ticket.status, ticket: updated, orderStatus };
    });
  }

  private isAllowedTransition(
    current: KitchenTicketStatus,
    next: KitchenTicketStatus,
  ) {
    if (current === next) return true;
    const transitions: Record<KitchenTicketStatus, KitchenTicketStatus[]> = {
      WAITING: [KitchenTicketStatus.PREPARING, KitchenTicketStatus.CANCELLED],
      PREPARING: [KitchenTicketStatus.READY, KitchenTicketStatus.CANCELLED],
      READY: [KitchenTicketStatus.DELIVERED, KitchenTicketStatus.CANCELLED],
      DELIVERED: [],
      CANCELLED: [],
    };
    return transitions[current].includes(next);
  }

  private orderStatusForTicket(status: KitchenTicketStatus): OrderStatus | undefined {
    if (status === KitchenTicketStatus.PREPARING) return OrderStatus.PREPARING;
    if (status === KitchenTicketStatus.READY) return OrderStatus.READY;
    if (status === KitchenTicketStatus.DELIVERED) return OrderStatus.DELIVERED;
    if (status === KitchenTicketStatus.CANCELLED) return OrderStatus.CANCELLED;
    return undefined;
  }
}