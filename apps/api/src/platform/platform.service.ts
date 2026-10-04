import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantStatus, UserStatus } from '@premiumchef/database';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { CreateTenantDto } from './dto/tenant.dto';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from './default-roles';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<unknown> {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        legalName: true,
        document: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        _count: { select: { units: true, users: true } },
      },
    });
  }

  async create(dto: CreateTenantDto): Promise<unknown> {
    const document = this.normalizeDocument(dto.document);
    const adminEmail = dto.admin_email.trim().toLowerCase();
    const passwordHash = await argon2.hash(dto.admin_password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const tenant = await transaction.tenant.create({
          data: {
            name: dto.name.trim(),
            legalName: dto.legal_name?.trim() || undefined,
            document,
            email: dto.email?.trim().toLowerCase(),
            phone: dto.phone?.trim() || undefined,
          },
        });
        const unit = await transaction.unit.create({
          data: { tenantId: tenant.id, name: dto.unit_name?.trim() || 'Unidade Principal' },
        });
        await transaction.cashRegister.create({
          data: { unitId: unit.id, name: 'Caixa Principal' },
        });

        await transaction.permission.createMany({
          data: ALL_PERMISSIONS.map((name) => ({ name })),
          skipDuplicates: true,
        });
        const permissions = await transaction.permission.findMany({
          where: { name: { in: [...ALL_PERMISSIONS] } },
          select: { id: true, name: true },
        });
        const permissionIds = new Map(permissions.map(({ id, name }) => [name, id]));

        let adminRoleId = '';
        for (const preset of DEFAULT_ROLES) {
          const role = await transaction.role.create({
            data: { tenantId: tenant.id, name: preset.name, description: preset.description },
          });
          await transaction.rolePermission.createMany({
            data: preset.permissions.map((name) => ({
              roleId: role.id,
              permissionId: permissionIds.get(name)!,
            })),
          });
          if (preset.name === 'ADMIN') adminRoleId = role.id;
        }

        const admin = await transaction.user.create({
          data: {
            tenantId: tenant.id,
            name: dto.admin_name.trim(),
            email: adminEmail,
            passwordHash,
            status: UserStatus.ACTIVE,
          },
          select: { id: true, name: true, email: true },
        });
        await transaction.userUnit.create({ data: { userId: admin.id, unitId: unit.id } });
        await transaction.userRole.create({ data: { userId: admin.id, roleId: adminRoleId } });

        return {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          unit: { id: unit.id, name: unit.name },
          admin,
        };
      });
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  async setStatus(id: string, status: TenantStatus, actorTenantId: string): Promise<unknown> {
    if (id === actorTenantId) {
      throw new BadRequestException('Não é possível alterar o status da sua própria empresa');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Empresa não encontrada');
    return this.prisma.tenant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, status: true },
    });
  }

  private normalizeDocument(document?: string): string | undefined {
    if (!document) return undefined;
    const digits = document.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) {
      throw new BadRequestException('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido');
    }
    return digits;
  }

  private translateUniqueViolation(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String(error.meta?.target ?? '');
      if (target.includes('document')) {
        return new ConflictException('Já existe uma empresa com este documento');
      }
      if (target.includes('email')) {
        return new ConflictException('Este e-mail de administrador já está em uso');
      }
      return new ConflictException('Registro duplicado');
    }
    return error;
  }
}
