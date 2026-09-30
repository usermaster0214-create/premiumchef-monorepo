import { BadRequestException, ConflictException } from '@nestjs/common';
import { DeliveryStatus, OrderStatus } from '@premiumchef/database';
import { DeliveryOperationsService } from './delivery-operations.service';

describe('DeliveryOperationsService', () => {
  let service: DeliveryOperationsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        deliveryDriver: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
        delivery: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
        order: { update: jest.fn() },
        $transaction: jest.fn(),
      },
    };
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: any) => Promise<unknown>) => callback(prisma.tenantScoped),
    );
    service = new DeliveryOperationsService(prisma);
  });

  it('assigns only an active driver from the current tenant', async () => {
    prisma.tenantScoped.delivery.findFirst.mockResolvedValue({ id: 'delivery-1', status: DeliveryStatus.READY });
    prisma.tenantScoped.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-1' });

    await service.assignDriver('delivery-1', 'driver-1', { tenantId: 'tenant-1', unitId: 'unit-1' });

    expect(prisma.tenantScoped.delivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { driverId: 'driver-1' },
      include: { driver: true },
    });
  });

  it('requires an assigned driver before starting the route', async () => {
    prisma.tenantScoped.delivery.findFirst.mockResolvedValue({
      id: 'delivery-1', orderId: 'order-1', status: DeliveryStatus.READY, driverId: null,
    });

    await expect(service.updateStatus('delivery-1', DeliveryStatus.OUT_FOR_DELIVERY))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('synchronizes delivery and order status through the allowed flow', async () => {
    prisma.tenantScoped.delivery.findFirst.mockResolvedValue({
      id: 'delivery-1', orderId: 'order-1', status: DeliveryStatus.OUT_FOR_DELIVERY, driverId: 'driver-1',
    });
    prisma.tenantScoped.delivery.update.mockResolvedValue({ id: 'delivery-1', status: DeliveryStatus.DELIVERED });

    const result = await service.updateStatus('delivery-1', DeliveryStatus.DELIVERED) as { orderStatus: OrderStatus };

    expect(prisma.tenantScoped.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: OrderStatus.DELIVERED },
    });
    expect(result.orderStatus).toBe(OrderStatus.DELIVERED);
  });

  it('rejects skipping delivery states', async () => {
    prisma.tenantScoped.delivery.findFirst.mockResolvedValue({
      id: 'delivery-1', orderId: 'order-1', status: DeliveryStatus.PENDING, driverId: null,
    });

    await expect(service.updateStatus('delivery-1', DeliveryStatus.OUT_FOR_DELIVERY))
      .rejects.toBeInstanceOf(ConflictException);
  });
});