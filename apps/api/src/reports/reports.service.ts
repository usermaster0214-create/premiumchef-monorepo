import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { ReportQueryDto } from './dto/report-query.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: ReportQueryDto, tenant: CurrentTenantContext): Promise<unknown> {
    const range = this.range(query);
    const orders = await this.prisma.tenantScoped.order.findMany({
      where: {
        ...range,
        status: { not: OrderStatus.CANCELLED },
        payments: { some: { status: 'PAID' } },
      },
      include: {
        orderItems: { select: { productName: true, quantity: true, total: true } },
        payments: { where: { status: 'PAID' }, select: { paymentMethod: true, amount: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const totalSales = orders.reduce((sum, order) => sum + Number(order.total), 0);
    const byChannel = this.groupBy(orders, (order) => order.orderType, (order) => Number(order.total));
    const byPayment = orders.flatMap((order) => order.payments).reduce<Record<string, number>>((result, payment) => {
      result[payment.paymentMethod] = (result[payment.paymentMethod] ?? 0) + Number(payment.amount);
      return result;
    }, {});
    const products = orders.flatMap((order) => order.orderItems).reduce<Record<string, { quantity: number; total: number }>>((result, item) => {
      const current = result[item.productName] ?? { quantity: 0, total: 0 };
      current.quantity += Number(item.quantity);
      current.total += Number(item.total);
      result[item.productName] = current;
      return result;
    }, {});
    const topProducts = Object.entries(products)
      .map(([name, values]) => ({ name, ...values }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
    const criticalStock = await this.prisma.tenantScoped.inventory.findMany({
      where: { unitId: tenant.unitId },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { quantity: 'asc' },
    });
    const cancellations = await this.prisma.tenantScoped.cancellation.count({
      where: { createdAt: range.createdAt },
    });
    return {
      period: { from: range.createdAt.gte, to: range.createdAt.lte },
      sales: { total: totalSales, orders: orders.length, averageTicket: orders.length ? totalSales / orders.length : 0 },
      byChannel,
      byPayment,
      topProducts,
      criticalStock: criticalStock
        .filter((item) => Number(item.quantity) <= Number(item.minimumQuantity))
        .map((item) => ({ product: item.product.name, sku: item.product.sku, quantity: item.quantity, minimum: item.minimumQuantity })),
      cancellations,
    };
  }

  private range(query: ReportQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    to.setHours(23, 59, 59, 999);
    return { createdAt: { gte: from, lte: to } };
  }

  private groupBy<T>(items: T[], key: (item: T) => string, value: (item: T) => number) {
    return items.reduce<Record<string, number>>((result, item) => {
      const group = key(item);
      result[group] = (result[group] ?? 0) + value(item);
      return result;
    }, {});
  }
}