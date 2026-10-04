import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@premiumchef/database';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from './default-roles';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformService } from './platform.service';

const dto = {
  name: 'Restaurante B',
  document: '12.345.678/0001-90',
  admin_name: 'Dona do B',
  admin_email: ' Dona@B.com ',
  admin_password: 'senha-forte-123',
};

describe('PlatformService', () => {
  let service: PlatformService;
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    let roleSeq = 0;
    tx = {
      tenant: { create: jest.fn().mockResolvedValue({ id: 'tenant-b', name: 'Restaurante B', status: 'ACTIVE' }) },
      unit: { create: jest.fn().mockResolvedValue({ id: 'unit-b', name: 'Unidade Principal' }) },
      cashRegister: { create: jest.fn() },
      permission: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue(ALL_PERMISSIONS.map((name, index) => ({ id: `p${index}`, name }))),
      },
      role: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: `role-${++roleSeq}`, ...data })) },
      rolePermission: { createMany: jest.fn() },
      user: { create: jest.fn().mockResolvedValue({ id: 'user-b', name: 'Dona do B', email: 'dona@b.com' }) },
      userUnit: { create: jest.fn() },
      userRole: { create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn().mockImplementation((callback: (client: any) => unknown) => callback(tx)),
      tenant: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    service = new PlatformService(prisma);
  });

  it('creates tenant, unit, cash register, default roles and a non-platform admin in one transaction', async () => {
    await service.create(dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Restaurante B', document: '12345678000190' }),
    });
    expect(tx.cashRegister.create).toHaveBeenCalledWith({ data: { unitId: 'unit-b', name: 'Caixa Principal' } });
    expect(tx.role.create).toHaveBeenCalledTimes(DEFAULT_ROLES.length);

    const userData = tx.user.create.mock.calls[0][0].data;
    expect(userData.email).toBe('dona@b.com');
    expect(userData.tenantId).toBe('tenant-b');
    expect(userData.passwordHash).not.toBe(dto.admin_password);
    expect(userData).not.toHaveProperty('isPlatformAdmin');
    expect(tx.userRole.create).toHaveBeenCalledWith({ data: { userId: 'user-b', roleId: 'role-1' } });
  });

  it('rejects malformed documents before touching the database', async () => {
    await expect(service.create({ ...dto, document: '123.456' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['tenants_document_key', 'Já existe uma empresa com este documento'],
    ['users_email_key', 'Este e-mail de administrador já está em uso'],
  ])('reports duplicate %s as a conflict', async (target, message) => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test', meta: { target } }),
    );

    const error: any = await service.create(dto).catch((caught) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe(message);
  });

  it('does not let the platform admin change the status of their own tenant', async () => {
    await expect(service.setStatus('tenant-a', TenantStatus.SUSPENDED, 'tenant-a')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});

describe('PlatformAdminGuard', () => {
  const contextFor = (user?: { sub: string }) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

  it('allows an active platform administrator checked against the database', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: 'owner' }) } };
    const guard = new PlatformAdminGuard(prisma as any);

    await expect(guard.canActivate(contextFor({ sub: 'owner' }))).resolves.toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'owner', isPlatformAdmin: true }) }),
    );
  });

  it('forbids tenant administrators even when their token claims platform_admin', async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
    const guard = new PlatformAdminGuard(prisma as any);

    await expect(guard.canActivate(contextFor({ sub: 'tenant-admin' }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids requests without an authenticated user', async () => {
    const prisma = { user: { findFirst: jest.fn() } };
    const guard = new PlatformAdminGuard(prisma as any);

    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
