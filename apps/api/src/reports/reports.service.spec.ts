import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  it('aggregates sales by channel, payment method and product', async () => {
    const prisma: any = {
      tenantScoped: {
        order: { findMany: jest.fn().mockResolvedValue([
          {
            orderType: 'COUNTER', total: 30,
            orderItems: [{ productName: 'X-Bacon', quantity: 2, total: 30 }],
            payments: [{ paymentMethod: 'PIX', amount: 30 }],
          },
        ]) },
        inventory: { findMany: jest.fn().mockResolvedValue([]) },
        cancellation: { count: jest.fn().mockResolvedValue(1) },
      },
    };
    const service = new ReportsService(prisma);

    const result = await service.summary({}, { tenantId: 'tenant-1', unitId: 'unit-1' }) as any;

    expect(result.sales).toMatchObject({ total: 30, orders: 1, averageTicket: 30 });
    expect(result.byChannel).toEqual({ COUNTER: 30 });
    expect(result.byPayment).toEqual({ PIX: 30 });
    expect(result.topProducts).toEqual([{ name: 'X-Bacon', quantity: 2, total: 30 }]);
    expect(result.cancellations).toBe(1);
  });
});