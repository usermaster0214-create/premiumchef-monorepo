import { Injectable, NotFoundException } from '@nestjs/common';
import { runWithTenantContext } from '@premiumchef/database';
import { PrismaService } from '../database/prisma.service';
import { ValidateCheckoutDto } from './dto/validate-checkout.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from '../orders/orders.service';
import { OrderType } from '@premiumchef/database';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  private async withUnit<T>(unitId: string, callback: () => Promise<T>): Promise<T> {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, status: 'ACTIVE' },
      select: { id: true, tenantId: true },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return runWithTenantContext(
      { tenantId: unit.tenantId, unitId: unit.id },
      async () => await callback(),
    );
  }

  catalog(unitId: string): Promise<unknown> {
    return this.withUnit(unitId, () =>
      this.prisma.tenantScoped.product.findMany({
        where: { status: 'ACTIVE', isDelivery: true },
        include: {
          category: { select: { id: true, name: true, imageUrl: true, sortOrder: true } },
          productUnits: {
            where: { unitId, active: true },
            select: { price: true },
          },
          variants: {
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, price: true },
            orderBy: { name: 'asc' },
          },
          productAddons: {
            where: { status: 'ACTIVE', addon: { status: 'ACTIVE' } },
            include: { addon: { select: { id: true, name: true, price: true } } },
            orderBy: { addon: { name: 'asc' } },
          },
        },
        orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      }),
    );
  }

  zones(unitId: string): Promise<unknown> {
    return this.withUnit(unitId, () =>
      this.prisma.tenantScoped.deliveryZone.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
    );
  }

  validateCheckout(unitId: string, dto: ValidateCheckoutDto): Promise<unknown> {
    return this.withUnit(unitId, async () => {
      const zone = await this.prisma.tenantScoped.deliveryZone.findFirst({
        where: { id: dto.zone_id, status: 'ACTIVE' },
      });
      if (!zone) throw new NotFoundException('Zona de entrega não encontrada nesta unidade');
      if (dto.subtotal <= 0) throw new NotFoundException('O pedido precisa conter itens');
      if (dto.neighborhood.trim().length < 2) {
        throw new NotFoundException('Informe um bairro válido para entrega');
      }
      return {
        accepted: true,
        zone_id: zone.id,
        zone_name: zone.name,
        delivery_fee: zone.deliveryFee,
        estimated_minutes: zone.estimatedMinutes,
        subtotal: dto.subtotal,
        total: dto.subtotal + Number(zone.deliveryFee),
      };
    });
  }

  async checkout(unitId: string, dto: CheckoutDto): Promise<unknown> {
    return this.withUnit(unitId, async () => {
      const zone = await this.prisma.tenantScoped.deliveryZone.findFirst({
        where: { id: dto.zone_id, status: 'ACTIVE' },
      });
      if (!zone) throw new NotFoundException('Zona de entrega não encontrada nesta unidade');
      if (dto.neighborhood.trim().length < 2) {
        throw new NotFoundException('Informe um bairro válido para entrega');
      }

      const tenant = (await this.prisma.unit.findFirst({
        where: { id: unitId },
        select: { tenantId: true },
      }))!;
      const existingCustomer = await this.prisma.tenantScoped.customer.findFirst({
        where: { email: dto.email.trim().toLowerCase() },
      });
      const customer = existingCustomer
        ? await this.prisma.tenantScoped.customer.update({
            where: { id: existingCustomer.id },
            data: { name: dto.name.trim(), phone: dto.phone.trim() },
          })
        : await this.prisma.tenantScoped.customer.create({
            data: {
              tenantId: tenant.tenantId,
              name: dto.name.trim(),
              email: dto.email.trim().toLowerCase(),
              phone: dto.phone.trim(),
            },
          });
      const address = await this.prisma.tenantScoped.customerAddress.create({
        data: {
          customerId: customer.id,
          label: 'Delivery',
          zipCode: dto.zip_code.trim(),
          street: dto.street.trim(),
          number: dto.number.trim(),
          complement: dto.complement?.trim(),
          neighborhood: dto.neighborhood.trim(),
          city: dto.city.trim(),
          state: dto.state.trim().toUpperCase(),
          reference: dto.reference?.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
        },
      });
      const order = await this.ordersService.create({
        order_type: OrderType.DELIVERY,
        customer_id: customer.id,
        notes: dto.notes,
        items: dto.items,
      }, {
        tenantId: tenant.tenantId,
        unitId,
        deliveryFee: Number(zone.deliveryFee),
      });
      const orderRecord = order as { id: string };
      const delivery = await this.prisma.tenantScoped.delivery.create({
        data: {
          orderId: orderRecord.id,
          unitId,
          addressId: address.id,
          deliveryFee: zone.deliveryFee,
          status: 'PENDING',
        },
      });
      return { order, delivery, payment_method: dto.payment_method, payment_status: 'PENDING' };
    });
  }
}