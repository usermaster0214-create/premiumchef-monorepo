import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@premiumchef/database';
import * as argon2 from 'argon2';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenantContext } from '../auth/current-tenant.decorator';
import { PrismaService } from '../database/prisma.service';
import { ALL_PERMISSIONS } from '../platform/default-roles';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

export interface AccessActor {
  userId: string;
  tenantId: string;
  permissions: readonly string[];
}

export function toActor(request: AuthenticatedRequest, tenant: CurrentTenantContext): AccessActor {
  return {
    userId: request.user!.sub,
    tenantId: tenant.tenantId,
    permissions: request.user!.permissions,
  };
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  isPlatformAdmin: true,
  lastLoginAt: true,
  userRoles: { select: { role: { select: { id: true, name: true } } } },
  userUnits: { select: { unitId: true } },
} satisfies Prisma.UserSelect;

const rolePermissionsSelect = {
  rolePermissions: { select: { permission: { select: { name: true } } } },
} satisfies Prisma.RoleSelect;

type UserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type RoleWithPermissions = { rolePermissions: { permission: { name: string } }[] };

function toUserView(user: UserRecord) {
  const { userRoles, userUnits, ...rest } = user;
  return {
    ...rest,
    roles: userRoles.map(({ role }) => role),
    unit_ids: userUnits.map(({ unitId }) => unitId),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(): Promise<unknown> {
    const users = await this.prisma.tenantScoped.user.findMany({
      select: userSelect,
      orderBy: { name: 'asc' },
    });
    return users.map(toUserView);
  }

  listUnits(): Promise<unknown> {
    return this.prisma.tenantScoped.unit.findMany({
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
    });
  }

  async createUser(dto: CreateUserDto, actor: AccessActor): Promise<unknown> {
    const roleIds = [...new Set(dto.role_ids)];
    const unitIds = [...new Set(dto.unit_ids)];
    await this.assertAssignableRoles(roleIds, actor);
    await this.assertUnits(unitIds);
    const passwordHash = await argon2.hash(dto.password);

    try {
      const user = await this.prisma.tenantScoped.user.create({
        data: {
          tenantId: actor.tenantId,
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone?.trim() || undefined,
          passwordHash,
          status: UserStatus.ACTIVE,
          userRoles: { create: roleIds.map((roleId) => ({ roleId })) },
          userUnits: { create: unitIds.map((unitId) => ({ unitId })) },
        },
        select: userSelect,
      });
      return toUserView(user);
    } catch (error) {
      throw this.translateUnique(error, 'Este e-mail já está em uso');
    }
  }

  async updateUser(id: string, dto: UpdateUserDto, actor: AccessActor): Promise<unknown> {
    const target = await this.prisma.tenantScoped.user.findFirst({
      where: { id },
      select: {
        id: true,
        isPlatformAdmin: true,
        userRoles: { select: { role: { select: rolePermissionsSelect } } },
      },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado');

    const isSelf = id === actor.userId;
    if (target.isPlatformAdmin && !isSelf) {
      throw new ForbiddenException('Esta conta só pode ser alterada pelo próprio administrador da plataforma');
    }
    if (isSelf && (dto.status !== undefined || dto.role_ids !== undefined || dto.unit_ids !== undefined)) {
      throw new BadRequestException('Você não pode alterar seu próprio status, perfis ou unidades');
    }
    if (!isSelf) {
      for (const { role } of target.userRoles) {
        this.assertWithinActor(this.permissionNames(role), actor, 'Você não pode alterar um usuário com permissões acima das suas');
      }
    }

    const data: Prisma.UserUncheckedUpdateInput = {
      name: dto.name?.trim(),
      phone: dto.phone?.trim(),
      status: dto.status,
    };
    if (dto.password) data.passwordHash = await argon2.hash(dto.password);
    // Remoção apenas de vínculos (tabelas de junção), nunca de registros de negócio.
    if (dto.role_ids) {
      const roleIds = [...new Set(dto.role_ids)];
      await this.assertAssignableRoles(roleIds, actor);
      data.userRoles = { deleteMany: {}, create: roleIds.map((roleId) => ({ roleId })) };
    }
    if (dto.unit_ids) {
      const unitIds = [...new Set(dto.unit_ids)];
      await this.assertUnits(unitIds);
      data.userUnits = { deleteMany: {}, create: unitIds.map((unitId) => ({ unitId })) };
    }

    const user = await this.prisma.tenantScoped.user.update({ where: { id }, data, select: userSelect });
    if (!isSelf && (dto.password || dto.status === 'INACTIVE')) {
      await this.prisma.tenantScoped.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return toUserView(user);
  }

  listPermissions(): string[] {
    return [...ALL_PERMISSIONS];
  }

  async listRoles(): Promise<unknown> {
    const roles = await this.prisma.tenantScoped.role.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        ...rolePermissionsSelect,
        _count: { select: { userRoles: true } },
      },
    });
    return roles.map(({ rolePermissions, _count, ...role }) => ({
      ...role,
      permissions: this.permissionNames({ rolePermissions }).sort(),
      user_count: _count.userRoles,
    }));
  }

  async createRole(dto: CreateRoleDto, actor: AccessActor): Promise<unknown> {
    const name = dto.name.trim();
    await this.assertRoleNameFree(name);
    const permissions = [...new Set(dto.permissions)];
    this.assertWithinActor(permissions, actor, 'Você só pode conceder permissões que possui');
    const permissionIds = await this.resolvePermissionIds(permissions);

    const role = await this.prisma.tenantScoped.role.create({
      data: {
        tenantId: actor.tenantId,
        name,
        description: dto.description?.trim() || undefined,
        rolePermissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      select: { id: true, name: true, description: true },
    });
    return { ...role, permissions: permissions.sort(), user_count: 0 };
  }

  async updateRole(id: string, dto: UpdateRoleDto, actor: AccessActor): Promise<unknown> {
    const role = await this.prisma.tenantScoped.role.findFirst({
      where: { id },
      select: { id: true, name: true, ...rolePermissionsSelect },
    });
    if (!role) throw new NotFoundException('Perfil não encontrado');
    if (role.name === 'ADMIN') throw new BadRequestException('O perfil ADMIN não pode ser alterado');
    this.assertWithinActor(this.permissionNames(role), actor, 'Você não pode alterar um perfil com permissões acima das suas');

    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== role.name.toLowerCase()) await this.assertRoleNameFree(name);

    const data: Prisma.RoleUncheckedUpdateInput = { name, description: dto.description?.trim() };
    if (dto.permissions) {
      const permissions = [...new Set(dto.permissions)];
      this.assertWithinActor(permissions, actor, 'Você só pode conceder permissões que possui');
      const permissionIds = await this.resolvePermissionIds(permissions);
      data.rolePermissions = {
        deleteMany: {},
        create: permissionIds.map((permissionId) => ({ permissionId })),
      };
    }
    await this.prisma.tenantScoped.role.update({ where: { id }, data });

    const roles = (await this.listRoles()) as { id: string }[];
    return roles.find((candidate) => candidate.id === id);
  }

  private permissionNames(role: RoleWithPermissions): string[] {
    return role.rolePermissions.map(({ permission }) => permission.name);
  }

  private assertWithinActor(permissions: readonly string[], actor: AccessActor, message: string): void {
    const held = new Set(actor.permissions);
    if (permissions.some((permission) => !held.has(permission))) {
      throw new ForbiddenException(message);
    }
  }

  private async assertAssignableRoles(roleIds: string[], actor: AccessActor): Promise<void> {
    const roles = await this.prisma.tenantScoped.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, ...rolePermissionsSelect },
    });
    if (roles.length !== roleIds.length) throw new BadRequestException('Perfil inválido para esta empresa');
    for (const role of roles) {
      this.assertWithinActor(this.permissionNames(role), actor, 'Você não pode atribuir um perfil com permissões que não possui');
    }
  }

  private async assertUnits(unitIds: string[]): Promise<void> {
    const units = await this.prisma.tenantScoped.unit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true },
    });
    if (units.length !== unitIds.length) throw new BadRequestException('Unidade inválida para esta empresa');
  }

  private async assertRoleNameFree(name: string): Promise<void> {
    const existing = await this.prisma.tenantScoped.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Já existe um perfil com este nome');
  }

  private async resolvePermissionIds(names: string[]): Promise<string[]> {
    const permissions = await this.prisma.tenantScoped.permission.findMany({
      where: { name: { in: names } },
      select: { id: true },
    });
    if (permissions.length !== names.length) throw new BadRequestException('Permissão inválida');
    return permissions.map(({ id }) => id);
  }

  private translateUnique(error: unknown, message: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException(message);
    }
    return error;
  }
}
