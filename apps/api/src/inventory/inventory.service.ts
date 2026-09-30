import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType } from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { CreateInventoryMovementDto } from './dto/inventory.dto';

type InventoryActor = CurrentTenantContext & { userId: string };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenant: CurrentTenantContext, criticalOnly = false): Promise<unknown> {
    const inventories = await this.prisma.tenantScoped.inventory.findMany({
      where: { unitId: tenant.unitId },
      include: { product: { select: { id: true, name: true, sku: true, status: true } } },
      orderBy: { updatedAt: 'asc' },
    });
    return criticalOnly
      ? inventories.filter((inventory) => Number(inventory.quantity) <= Number(inventory.minimumQuantity))
      : inventories;
  }

  async move(dto: CreateInventoryMovementDto, actor: InventoryActor): Promise<unknown> {
    if ([InventoryMovementType.PURCHASE, InventoryMovementType.SALE, InventoryMovementType.CANCELLATION].some((type) => type === dto.type)) {
      throw new BadRequestException('Este tipo de movimento é gerado por fluxos internos');
    }
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const product = await transaction.product.findFirst({ where: { id: dto.product_id, status: 'ACTIVE' }, select: { id: true } });
      if (!product) throw new NotFoundException('Produto não encontrado nesta unidade');
      const inventory = await transaction.inventory.findFirst({ where: { productId: product.id, unitId: actor.unitId }, select: { id: true, quantity: true } });
      const previousQuantity = Number(inventory?.quantity ?? 0);
      const delta = dto.type === InventoryMovementType.LOSS || dto.type === InventoryMovementType.TRANSFER_OUT
        ? -Math.abs(dto.quantity)
        : dto.type === InventoryMovementType.TRANSFER_IN
          ? Math.abs(dto.quantity)
          : dto.quantity;
      const newQuantity = previousQuantity + delta;
      if (newQuantity < 0) throw new BadRequestException('Movimento deixaria o estoque negativo');
      const updatedInventory = inventory
        ? await transaction.inventory.update({ where: { id: inventory.id }, data: { quantity: newQuantity } })
        : await transaction.inventory.create({ data: { productId: product.id, unitId: actor.unitId, quantity: newQuantity } });
      const movement = await transaction.inventoryMovement.create({
        data: {
          unitId: actor.unitId,
          productId: product.id,
          userId: actor.userId,
          type: dto.type,
          quantity: delta,
          previousQuantity,
          newQuantity,
          reason: dto.reason?.trim(),
        },
      });
      return { inventory: updatedInventory, movement };
    });
  }
}