import { BadRequestException } from '@nestjs/common';
import {
  KitchenTicketStatus,
  OrderItemStatus,
  OrderStatus,
} from '@premiumchef/database';
import { KitchenService } from './kitchen.service';

describe('KitchenService', () => {
  let service: KitchenService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        kitchenTicket: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn().mockResolvedValue({
            id: 'ticket-1',
            status: KitchenTicketStatus.PREPARING,
            kitchenTicketItems: [],
          }),
        },
        kitchenTicketItem: { update: jest.fn() },
        order: { update: jest.fn().mockResolvedValue({}) },
        $transaction: jest.fn(),
      },
    };
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(prisma.tenantScoped),
    );
    service = new KitchenService(prisma);
  });

  it('moves a ticket to preparation and synchronizes item/order statuses', async () => {
    prisma.tenantScoped.kitchenTicket.findFirst.mockResolvedValue({
      id: 'ticket-1',
      orderId: 'order-1',
      status: KitchenTicketStatus.WAITING,
      kitchenTicketItems: [{ id: 'ticket-item-1' }],
    });

    await service.updateStatus('ticket-1', KitchenTicketStatus.PREPARING);

    expect(prisma.tenantScoped.kitchenTicketItem.update).toHaveBeenCalledWith({
      where: { id: 'ticket-item-1' },
      data: { status: OrderItemStatus.PREPARING },
    });
    expect(prisma.tenantScoped.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: OrderStatus.PREPARING },
    });
  });

  it('rejects skipping directly from waiting to ready', async () => {
    prisma.tenantScoped.kitchenTicket.findFirst.mockResolvedValue({
      id: 'ticket-1',
      orderId: 'order-1',
      status: KitchenTicketStatus.WAITING,
      kitchenTicketItems: [],
    });

    await expect(
      service.updateStatus('ticket-1', KitchenTicketStatus.READY),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tenantScoped.kitchenTicket.update).not.toHaveBeenCalled();
  });
});