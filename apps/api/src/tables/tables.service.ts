import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, TableStatus } from '@premiumchef/database';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { CreateTableDto, UpdateTableDto } from './dto/table.dto';

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenant: CurrentTenantContext, archived = false): Promise<unknown> {
    return this.prisma.tenantScoped.restaurantTable.findMany({
      where: { unitId: tenant.unitId, isActive: !archived },
      include: {
        orderTables: {
          where: {
            order: {
              status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
            },
          },
          include: {
            order: {
              select: { id: true, orderNumber: true, status: true, total: true },
            },
          },
        },
      },
      orderBy: { number: 'asc' },
    });
  }

  create(dto: CreateTableDto, tenant: CurrentTenantContext): Promise<unknown> {
    return this.prisma.tenantScoped.restaurantTable.create({
      data: {
        unitId: tenant.unitId,
        number: dto.number,
        name: dto.name?.trim(),
        capacity: dto.capacity,
        status: dto.status ?? TableStatus.AVAILABLE,
      },
    });
  }

  async update(id: string, dto: UpdateTableDto) {
    await this.requireTable(id);
    return this.prisma.tenantScoped.restaurantTable.update({
      where: { id },
      data: { name: dto.name?.trim(), capacity: dto.capacity },
    });
  }

  async setStatus(id: string, status: TableStatus) {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const table = await transaction.restaurantTable.findFirst({
        where: { id },
        include: {
          orderTables: {
            where: {
              order: {
                status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
              },
            },
            select: { orderId: true },
          },
        },
      });
      if (!table) {
        throw new NotFoundException('Mesa não encontrada nesta unidade');
      }
      if (status === TableStatus.AVAILABLE && table.orderTables.length) {
        throw new ConflictException('A mesa possui uma comanda aberta');
      }
      if (status === TableStatus.OCCUPIED && table.status === TableStatus.BLOCKED) {
        throw new BadRequestException('Desbloqueie a mesa antes de ocupá-la');
      }
      return transaction.restaurantTable.update({
        where: { id },
        data: { status },
      });
    });
  }

  async archive(id: string) {
    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      const table = await transaction.restaurantTable.findFirst({
        where: { id, isActive: true },
        include: {
          orderTables: {
            where: {
              order: {
                status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
              },
            },
            select: { orderId: true },
          },
        },
      });
      if (!table) {
        throw new NotFoundException('Mesa ativa não encontrada nesta unidade');
      }
      if (table.orderTables.length) {
        throw new ConflictException('Não é possível excluir uma mesa com comanda aberta');
      }
      return transaction.restaurantTable.update({
        where: { id },
        data: { isActive: false },
      });
    });
  }

  async restore(id: string) {
    const table = await this.prisma.tenantScoped.restaurantTable.findFirst({
      where: { id, isActive: false },
      select: { id: true },
    });
    if (!table) {
      throw new NotFoundException('Mesa arquivada não encontrada nesta unidade');
    }
    return this.prisma.tenantScoped.restaurantTable.update({
      where: { id },
      data: { isActive: true },
    });
  }

  private async requireTable(id: string) {
    const table = await this.prisma.tenantScoped.restaurantTable.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!table) {
      throw new NotFoundException('Mesa não encontrada nesta unidade');
    }
    return table;
  }
}