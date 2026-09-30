import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KitchenTicketStatus,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  ProductStatus,
  TableStatus,
} from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { CreateOrderDto, OrderItemDto } from './dto/create-order.dto';
import { TransferOrderTableDto } from './dto/table-order.dto';

type OrderActor = CurrentTenantContext & { userId?: string; deliveryFee?: number };

function cents(value: number | { toString(): string }) {
  return Math.round(Number(value) * 100);
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto, actor: OrderActor): Promise<unknown> {
    if (!dto.items.length) {
      throw new BadRequestException('O pedido precisa conter ao menos um item');
    }
    if (dto.order_type === OrderType.DINE_IN && !dto.table_id) {
      throw new BadRequestException('Mesa é obrigatória para pedidos DINE_IN');
    }
    if (dto.order_type !== OrderType.DINE_IN && dto.table_id) {
      throw new BadRequestException('Mesa só pode ser informada em pedidos DINE_IN');
    }

    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      if (dto.customer_id) {
        const customer = await transaction.customer.findFirst({
          where: { id: dto.customer_id },
          select: { id: true },
        });
        if (!customer) {
          throw new BadRequestException('Cliente não pertence a este tenant');
        }
      }

      let tableId: string | undefined;
      if (dto.table_id) {
        const table = await transaction.restaurantTable.findFirst({
          where: { id: dto.table_id },
          select: { id: true, status: true },
        });
        if (!table) {
          throw new NotFoundException('Mesa não encontrada nesta unidade');
        }
        if (table.status === TableStatus.BLOCKED || table.status === TableStatus.RESERVED) {
          throw new BadRequestException('A mesa não está disponível para este pedido');
        }
        tableId = table.id;
      }

      const preparedItems = await Promise.all(
        dto.items.map((item) => this.prepareItem(transaction, item, actor.unitId)),
      );
      const subtotalCents = preparedItems.reduce(
        (sum, item) => sum + item.totalCents,
        0,
      );
      const lastOrder = await transaction.order.findFirst({
        where: { unitId: actor.unitId },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
      });
      const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

      const order = await transaction.order.create({
        data: {
          tenantId: actor.tenantId,
          unitId: actor.unitId,
          userId: actor.userId,
          customerId: dto.customer_id,
          orderNumber,
          orderType: dto.order_type,
          status: OrderStatus.PENDING,
          subtotal: subtotalCents / 100,
          deliveryFee: actor.deliveryFee ?? 0,
          total: subtotalCents / 100 + (actor.deliveryFee ?? 0),
          notes: dto.notes?.trim(),
        },
      });

      const createdItems = [];
      for (const item of preparedItems) {
        const createdItem = await transaction.orderItem.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPriceCents / 100,
            total: item.totalCents / 100,
            notes: item.notes,
            status: OrderItemStatus.WAITING,
          },
        });
        for (const option of item.options) {
          await transaction.orderItemOption.create({
            data: {
              orderItemId: createdItem.id,
              addonId: option.addonId,
              addonName: option.addonName,
              quantity: option.quantity,
              unitPrice: option.unitPriceCents / 100,
              total: option.totalCents / 100,
            },
          });
        }
        createdItems.push({ id: createdItem.id, quantity: item.quantity });
      }

      const ticket = await transaction.kitchenTicket.create({
        data: {
          orderId: order.id,
          unitId: actor.unitId,
          status: KitchenTicketStatus.WAITING,
          kitchenTicketItems: {
            create: createdItems.map((item) => ({
              orderItemId: item.id,
              quantity: item.quantity,
              status: OrderItemStatus.WAITING,
            })),
          },
        },
        include: { kitchenTicketItems: true },
      });

      if (tableId) {
        await transaction.orderTable.create({
          data: { orderId: order.id, tableId },
        });
        await transaction.restaurantTable.update({
          where: { id: tableId },
          data: { status: TableStatus.OCCUPIED },
        });
      }

      return { ...order, kitchenTickets: [ticket] };
    });
  }

  async addItem(
    orderId: string,
    item: OrderItemDto,
    actor: OrderActor,
  ): Promise<unknown> {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: {
          id: orderId,
          status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
        },
        select: { id: true, subtotal: true },
      });
      if (!order) {
        throw new NotFoundException('Comanda aberta não encontrada');
      }

      const prepared = await this.prepareItem(transaction, item, actor.unitId);
      const createdItem = await transaction.orderItem.create({
        data: {
          orderId: order.id,
          productId: prepared.productId,
          variantId: prepared.variantId,
          productName: prepared.productName,
          quantity: prepared.quantity,
          unitPrice: prepared.unitPriceCents / 100,
          total: prepared.totalCents / 100,
          notes: prepared.notes,
          status: OrderItemStatus.WAITING,
        },
      });
      for (const option of prepared.options) {
        await transaction.orderItemOption.create({
          data: {
            orderItemId: createdItem.id,
            addonId: option.addonId,
            addonName: option.addonName,
            quantity: option.quantity,
            unitPrice: option.unitPriceCents / 100,
            total: option.totalCents / 100,
          },
        });
      }

      const total = Number(order.subtotal) + prepared.totalCents / 100;
      const updatedOrder = await transaction.order.update({
        where: { id: order.id },
        data: { subtotal: total, total },
      });
      const ticket = await transaction.kitchenTicket.create({
        data: {
          orderId: order.id,
          unitId: actor.unitId,
          status: KitchenTicketStatus.WAITING,
          kitchenTicketItems: {
            create: {
              orderItemId: createdItem.id,
              quantity: prepared.quantity,
              status: OrderItemStatus.WAITING,
            },
          },
        },
      });
      return { order: updatedOrder, item: createdItem, kitchenTicket: ticket };
    });
  }

  async transferTable(
    orderId: string,
    dto: TransferOrderTableDto,
    actor: OrderActor,
  ): Promise<unknown> {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: {
          id: orderId,
          status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
        },
        include: { orderTables: { select: { id: true, tableId: true } } },
      });
      if (!order) {
        throw new NotFoundException('Comanda aberta não encontrada');
      }

      const target = await transaction.restaurantTable.findFirst({
        where: { id: dto.table_id },
        select: { id: true, status: true },
      });
      if (!target) {
        throw new NotFoundException('Mesa de destino não encontrada nesta unidade');
      }
      if (target.status === TableStatus.BLOCKED || target.status === TableStatus.RESERVED) {
        throw new BadRequestException('A mesa de destino não está disponível');
      }

      const current = order.orderTables[0];
      if (current?.tableId === target.id) {
        return order;
      }

      if (current) {
        await transaction.orderTable.update({
          where: { id: current.id },
          data: { tableId: target.id },
        });
      } else {
        await transaction.orderTable.create({
          data: { orderId: order.id, tableId: target.id },
        });
      }

      await transaction.restaurantTable.update({
        where: { id: target.id },
        data: { status: TableStatus.OCCUPIED },
      });

      if (current) {
        const otherOpenOrder = await transaction.orderTable.findFirst({
          where: {
            tableId: current.tableId,
            orderId: { not: order.id },
            order: {
              status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
            },
          },
          select: { id: true },
        });
        if (!otherOpenOrder) {
          await transaction.restaurantTable.update({
            where: { id: current.tableId },
            data: { status: TableStatus.AVAILABLE },
          });
        }
      }

      return transaction.order.findFirst({
        where: { id: order.id },
        include: { orderTables: true },
      });
    });
  }

  private async prepareItem(
    transaction: any,
    item: OrderItemDto,
    unitId: string,
  ) {
    const product = await transaction.product.findFirst({
      where: { id: item.product_id, status: ProductStatus.ACTIVE },
      include: {
        productUnits: { where: { unitId, active: true } },
        variants: { where: { status: ProductStatus.ACTIVE } },
        productAddons: {
          where: {
            status: ProductStatus.ACTIVE,
            addon: { status: ProductStatus.ACTIVE },
          },
          include: { addon: true },
        },
      },
    });
    if (!product || !product.productUnits[0]) {
      throw new BadRequestException('Produto não disponível nesta unidade');
    }

    const variant = item.variant_id
      ? product.variants.find((entry: { id: string }) => entry.id === item.variant_id)
      : undefined;
    if (item.variant_id && !variant) {
      throw new BadRequestException('Variação não pertence ao produto ou está inativa');
    }

    const unitPriceCents = cents(variant?.price ?? product.productUnits[0].price);
    const options = (item.options ?? []).map((option) => {
      const link = product.productAddons.find(
        (entry: { addonId: string }) => entry.addonId === option.addon_id,
      );
      if (!link) {
        throw new BadRequestException('Adicional não está disponível para este produto');
      }
      if (option.quantity > link.maxQuantity) {
        throw new BadRequestException(`Quantidade máxima excedida para ${link.addon.name}`);
      }
      const addonUnitPriceCents = cents(link.addon.price);
      return {
        addonId: link.addon.id,
        addonName: link.addon.name,
        quantity: option.quantity,
        unitPriceCents: addonUnitPriceCents,
        totalCents: addonUnitPriceCents * option.quantity * item.quantity,
      };
    });
    const totalCents =
      (unitPriceCents + options.reduce((sum, option) => sum + option.unitPriceCents * option.quantity, 0)) *
      item.quantity;

    return {
      productId: product.id,
      variantId: variant?.id,
      productName: variant ? `${product.name} - ${variant.name}` : product.name,
      quantity: item.quantity,
      unitPriceCents,
      totalCents,
      notes: item.notes?.trim(),
      options,
    };
  }
}