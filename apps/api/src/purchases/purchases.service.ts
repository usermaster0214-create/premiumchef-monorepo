import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType } from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { CreatePurchaseDto } from './dto/purchase.dto';

type PurchaseActor = CurrentTenantContext & { userId: string };

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePurchaseDto, actor: PurchaseActor): Promise<unknown> {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      if (dto.supplier_id) {
        const supplier = await transaction.supplier.findFirst({ where: { id: dto.supplier_id, status: 'ACTIVE' }, select: { id: true } });
        if (!supplier) throw new BadRequestException('Fornecedor não pertence a este tenant');
      }
      const prepared = [];
      let total = 0;
      for (const item of dto.items) {
        const product = await transaction.product.findFirst({ where: { id: item.product_id, status: 'ACTIVE' }, select: { id: true } });
        if (!product) throw new NotFoundException('Produto do item não encontrado');
        const itemTotal = item.quantity * item.unit_cost;
        total += itemTotal;
        prepared.push({ ...item, itemTotal });
      }
      const purchase = await transaction.purchase.create({
        data: {
          tenantId: actor.tenantId,
          unitId: actor.unitId,
          supplierId: dto.supplier_id,
          userId: actor.userId,
          invoiceNumber: dto.invoice_number?.trim(),
          subtotal: total,
          total,
          status: 'COMPLETED',
          purchaseItems: { create: prepared.map((item) => ({ productId: item.product_id, quantity: item.quantity, unitCost: item.unit_cost, total: item.itemTotal })) },
        },
      });

      for (const item of prepared) {
        const inventory = await transaction.inventory.findFirst({ where: { productId: item.product_id, unitId: actor.unitId }, select: { id: true, quantity: true } });
        const previousQuantity = Number(inventory?.quantity ?? 0);
        const newQuantity = previousQuantity + item.quantity;
        if (inventory) await transaction.inventory.update({ where: { id: inventory.id }, data: { quantity: newQuantity } });
        else await transaction.inventory.create({ data: { productId: item.product_id, unitId: actor.unitId, quantity: newQuantity } });
        await transaction.inventoryMovement.create({ data: { unitId: actor.unitId, productId: item.product_id, userId: actor.userId, type: InventoryMovementType.PURCHASE, quantity: item.quantity, previousQuantity, newQuantity, referenceType: 'PURCHASE', referenceId: purchase.id, reason: 'Entrada por compra' } });

        const productUnit = await transaction.productUnit.findFirst({ where: { productId: item.product_id, unitId: actor.unitId }, select: { id: true, costPrice: true } });
        const oldCost = Number(productUnit?.costPrice ?? item.unit_cost);
        const averageCost = newQuantity > 0 ? ((previousQuantity * oldCost) + (item.quantity * item.unit_cost)) / newQuantity : item.unit_cost;
        if (productUnit) await transaction.productUnit.update({ where: { id: productUnit.id }, data: { costPrice: averageCost } });
      }
      return purchase;
    });
  }

  list(tenant: CurrentTenantContext): Promise<unknown> {
    return this.prisma.tenantScoped.purchase.findMany({ where: { unitId: tenant.unitId }, include: { supplier: true, purchaseItems: true }, orderBy: { purchasedAt: 'desc' } });
  }
}