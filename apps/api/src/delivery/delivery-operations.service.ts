import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, OrderStatus } from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { CreateDriverDto, UpdateDriverDto } from './dto/driver.dto';

const orderStatusByDelivery: Partial<Record<DeliveryStatus, OrderStatus>> = {
  CONFIRMED: OrderStatus.CONFIRMED,
  PREPARING: OrderStatus.PREPARING,
  READY: OrderStatus.READY,
  OUT_FOR_DELIVERY: OrderStatus.OUT_FOR_DELIVERY,
  DELIVERED: OrderStatus.DELIVERED,
  CANCELLED: OrderStatus.CANCELLED,
};

const transitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: [DeliveryStatus.CONFIRMED, DeliveryStatus.CANCELLED],
  CONFIRMED: [DeliveryStatus.PREPARING, DeliveryStatus.CANCELLED],
  PREPARING: [DeliveryStatus.READY, DeliveryStatus.CANCELLED],
  READY: [DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.CANCELLED],
  OUT_FOR_DELIVERY: [DeliveryStatus.DELIVERED],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class DeliveryOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  listDrivers(): Promise<unknown> {
    return this.prisma.tenantScoped.deliveryDriver.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  createDriver(dto: CreateDriverDto, tenantId: string): Promise<unknown> {
    return this.prisma.tenantScoped.deliveryDriver.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        document: dto.document?.trim(),
        vehicle: dto.vehicle?.trim(),
        plate: dto.plate?.trim(),
        status: 'ACTIVE',
      },
    });
  }

  async updateDriver(id: string, dto: UpdateDriverDto): Promise<unknown> {
    await this.requireDriver(id);
    return this.prisma.tenantScoped.deliveryDriver.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        document: dto.document?.trim(),
        vehicle: dto.vehicle?.trim(),
        plate: dto.plate?.trim(),
      },
    });
  }

  listDeliveries(tenant: CurrentTenantContext): Promise<unknown> {
    return this.prisma.tenantScoped.delivery.findMany({
      where: { unitId: tenant.unitId },
      include: {
        driver: true,
        order: { select: { id: true, orderNumber: true, status: true, total: true } },
        address: true,
      },
      orderBy: { status: 'asc' },
    });
  }

  async assignDriver(deliveryId: string, driverId: string, tenant: CurrentTenantContext): Promise<unknown> {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findFirst({
        where: { id: deliveryId },
        select: { id: true, status: true },
      });
      if (!delivery) throw new NotFoundException('Entrega não encontrada nesta unidade');
      const driver = await transaction.deliveryDriver.findFirst({
        where: { id: driverId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!driver) throw new BadRequestException('Entregador não pertence a este tenant ou está inativo');
      return transaction.delivery.update({
        where: { id: delivery.id },
        data: { driverId: driver.id },
        include: { driver: true },
      });
    });
  }

  async updateStatus(deliveryId: string, nextStatus: DeliveryStatus): Promise<unknown> {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const delivery = await transaction.delivery.findFirst({
        where: { id: deliveryId },
        select: { id: true, orderId: true, status: true, driverId: true },
      });
      if (!delivery) throw new NotFoundException('Entrega não encontrada nesta unidade');
      if (delivery.status === nextStatus) return delivery;
      if (!transitions[delivery.status].includes(nextStatus)) {
        throw new ConflictException(`Transição inválida: ${delivery.status} -> ${nextStatus}`);
      }
      if (nextStatus === DeliveryStatus.OUT_FOR_DELIVERY && !delivery.driverId) {
        throw new BadRequestException('Atribua um entregador antes de iniciar a rota');
      }
      const updated = await transaction.delivery.update({
        where: { id: delivery.id },
        data: {
          status: nextStatus,
          acceptedAt: nextStatus === DeliveryStatus.CONFIRMED ? new Date() : undefined,
          pickedUpAt: nextStatus === DeliveryStatus.OUT_FOR_DELIVERY ? new Date() : undefined,
          deliveredAt: nextStatus === DeliveryStatus.DELIVERED ? new Date() : undefined,
        },
      });
      const orderStatus = orderStatusByDelivery[nextStatus];
      if (orderStatus) {
        await transaction.order.update({ where: { id: delivery.orderId }, data: { status: orderStatus } });
      }
      return { delivery: updated, orderStatus };
    });
  }

  async updateLocation(deliveryId: string, latitude: number, longitude: number): Promise<unknown> {
    const delivery = await this.prisma.tenantScoped.delivery.findFirst({
      where: { id: deliveryId },
      select: { id: true, status: true, driverId: true },
    });
    if (!delivery) throw new NotFoundException('Entrega não encontrada nesta unidade');
    if (!delivery.driverId || delivery.status !== DeliveryStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException('A entrega precisa estar em rota com entregador atribuído');
    }
    return this.prisma.tenantScoped.delivery.update({
      where: { id: delivery.id },
      data: { latitude, longitude },
      include: { driver: true },
    });
  }

  private async requireDriver(id: string) {
    const driver = await this.prisma.tenantScoped.deliveryDriver.findFirst({ where: { id } });
    if (!driver) throw new NotFoundException('Entregador não encontrado');
    return driver;
  }
}