import { NotFoundException } from '@nestjs/common';
import { DeliveryService } from './delivery.service';

describe('DeliveryService', () => {
  let service: DeliveryService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      unit: { findFirst: jest.fn() },
      tenantScoped: {
        product: { findMany: jest.fn().mockResolvedValue([]) },
        deliveryZone: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        customer: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'customer-1' }),
          update: jest.fn(),
        },
        customerAddress: { create: jest.fn().mockResolvedValue({ id: 'address-1' }) },
        delivery: { create: jest.fn().mockResolvedValue({ id: 'delivery-1', status: 'PENDING' }) },
      },
    };
    service = new DeliveryService(prisma, {} as never);
  });

  it('rejects an inactive or unknown public unit', async () => {
    prisma.unit.findFirst.mockResolvedValue(null);

    await expect(service.catalog('unit-missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenantScoped.product.findMany).not.toHaveBeenCalled();
  });

  it('loads only delivery products after resolving the tenant context', async () => {
    prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1', tenantId: 'tenant-1' });

    await service.catalog('unit-1');

    expect(prisma.tenantScoped.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', isDelivery: true },
      }),
    );
  });

  it('loads active delivery zones for the selected unit context', async () => {
    prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1', tenantId: 'tenant-1' });

    await service.zones('unit-1');

    expect(prisma.tenantScoped.deliveryZone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
  });

  it('validates a checkout zone and calculates the delivery total', async () => {
    prisma.unit.findFirst.mockResolvedValue({ id: 'unit-1', tenantId: 'tenant-1' });
    prisma.tenantScoped.deliveryZone.findFirst.mockResolvedValue({
      id: 'zone-1',
      name: 'Centro',
      deliveryFee: 7.5,
      estimatedMinutes: 35,
    });

    await expect(service.validateCheckout('unit-1', {
      zone_id: 'zone-1',
      subtotal: 42,
      neighborhood: 'Centro',
    })).resolves.toMatchObject({
      accepted: true,
      delivery_fee: 7.5,
      total: 49.5,
      estimated_minutes: 35,
    });
  });

  it('creates a customer address, delivery order and pending delivery record', async () => {
    prisma.unit.findFirst
      .mockResolvedValueOnce({ id: 'unit-1', tenantId: 'tenant-1' })
      .mockResolvedValueOnce({ id: 'unit-1', tenantId: 'tenant-1' });
    prisma.tenantScoped.deliveryZone.findFirst.mockResolvedValue({
      id: 'zone-1', name: 'Centro', deliveryFee: 7.5, estimatedMinutes: 35,
    });
    const ordersService = {
      create: jest.fn().mockResolvedValue({ id: 'order-1', total: 49.5 }),
    };
    service = new DeliveryService(prisma, ordersService as never);

    const result = await service.checkout('unit-1', {
      name: 'Cliente',
      email: 'cliente@example.com',
      phone: '11999999999',
      zone_id: 'zone-1',
      zip_code: '01000000',
      street: 'Rua A',
      number: '10',
      neighborhood: 'Centro',
      city: 'Sao Paulo',
      state: 'SP',
      payment_method: 'PIX',
      items: [{ product_id: 'product-1', quantity: 1 }],
    });

    expect(ordersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ order_type: 'DELIVERY', customer_id: 'customer-1' }),
      expect.objectContaining({ tenantId: 'tenant-1', unitId: 'unit-1', deliveryFee: 7.5 }),
    );
    expect(prisma.tenantScoped.customerAddress.create).toHaveBeenCalled();
    expect(prisma.tenantScoped.delivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'order-1', unitId: 'unit-1', addressId: 'address-1', deliveryFee: 7.5 }),
    });
    expect(result).toMatchObject({ payment_method: 'PIX', payment_status: 'PENDING' });
  });
});