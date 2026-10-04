import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@premiumchef/database';
import { UsersService } from './users.service';

const admin = { userId: 'admin-1', tenantId: 'tenant-1', permissions: ['users.read', 'users.create', 'users.update', 'orders.pay', 'cash.open'] };
const manager = { userId: 'manager-1', tenantId: 'tenant-1', permissions: ['users.read', 'users.update', 'orders.read'] };
const roleWith = (id: string, ...names: string[]) => ({
  id,
  name: id === 'role-admin' ? 'ADMIN' : id === 'role-2' ? 'CAIXA' : id,
  rolePermissions: names.map((name) => ({ permission: { name } })),
});
const userView = { id: 'user-1', userRoles: [], userUnits: [] };

describe('UsersService', () => {
  let service: UsersService;
  let db: any;

  beforeEach(() => {
    db = {
      user: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn().mockResolvedValue(userView), update: jest.fn().mockResolvedValue(userView) },
      role: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      unit: { findMany: jest.fn().mockResolvedValue([{ id: 'unit-1' }]) },
      permission: { findMany: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
    };
    service = new UsersService({ tenantScoped: db } as any);
  });

  const input = { name: 'Ana', email: ' Ana@Loja.com ', password: 'senha-forte-1', role_ids: ['role-1'], unit_ids: ['unit-1'] };

  it('creates a user with a hashed password and normalized email', async () => {
    db.role.findMany.mockResolvedValue([roleWith('role-1', 'orders.pay')]);

    await service.createUser(input, admin);

    const data = db.user.create.mock.calls[0][0].data;
    expect(data.email).toBe('ana@loja.com');
    expect(data.tenantId).toBe('tenant-1');
    expect(data.passwordHash).not.toBe(input.password);
    expect(data).not.toHaveProperty('isPlatformAdmin');
    expect(data.userRoles).toEqual({ create: [{ roleId: 'role-1' }] });
  });

  it('refuses to assign a role holding permissions the actor lacks', async () => {
    db.role.findMany.mockResolvedValue([roleWith('role-1', 'orders.pay', 'inventory.adjust')]);

    await expect(service.createUser(input, admin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('rejects roles or units outside the tenant', async () => {
    db.role.findMany.mockResolvedValue([]);
    await expect(service.createUser(input, admin)).rejects.toBeInstanceOf(BadRequestException);

    db.role.findMany.mockResolvedValue([roleWith('role-1', 'orders.pay')]);
    db.unit.findMany.mockResolvedValue([]);
    await expect(service.createUser(input, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a duplicate e-mail as a conflict', async () => {
    db.role.findMany.mockResolvedValue([roleWith('role-1', 'orders.pay')]);
    db.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.createUser(input, admin)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not let an actor edit a user whose roles exceed the actor permissions', async () => {
    db.user.findFirst.mockResolvedValue({
      id: 'user-9',
      isPlatformAdmin: false,
      userRoles: [{ role: roleWith('r', 'cash.open') }],
    });

    await expect(service.updateUser('user-9', { password: 'nova-senha-123' }, manager)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('protects platform administrator accounts from other users', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'owner', isPlatformAdmin: true, userRoles: [] });

    await expect(service.updateUser('owner', { status: 'INACTIVE' }, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks self-service changes to status, roles and units', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'admin-1', isPlatformAdmin: false, userRoles: [] });

    await expect(service.updateUser('admin-1', { status: 'INACTIVE' }, admin)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateUser('admin-1', { role_ids: ['role-1'] }, admin)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes refresh tokens when another user is deactivated', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'user-2', isPlatformAdmin: false, userRoles: [] });

    await service.updateUser('user-2', { status: 'INACTIVE' }, admin);

    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-2', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('returns not found for users outside the tenant', async () => {
    db.user.findFirst.mockResolvedValue(null);

    await expect(service.updateUser('ghost', { name: 'X Y' }, admin)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to create a role with permissions the actor lacks', async () => {
    db.role.findFirst.mockResolvedValue(null);

    await expect(
      service.createRole({ name: 'Super', permissions: ['inventory.adjust'] }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.role.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate role names regardless of case', async () => {
    db.role.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.createRole({ name: 'caixa', permissions: ['orders.pay'] }, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps the ADMIN role immutable', async () => {
    db.role.findFirst.mockResolvedValue(roleWith('role-admin', 'orders.pay'));

    await expect(service.updateRole('role-admin', { description: 'x' }, admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.role.update).not.toHaveBeenCalled();
  });

  it('replaces role permissions with the requested set', async () => {
    db.role.findFirst.mockResolvedValue(roleWith('role-2', 'orders.pay'));
    db.permission.findMany.mockResolvedValue([{ id: 'perm-1' }]);
    db.role.findMany.mockResolvedValue([{ ...roleWith('role-2', 'orders.pay'), description: null, _count: { userRoles: 1 } }]);

    await service.updateRole('role-2', { permissions: ['orders.pay'] }, admin);

    expect(db.role.update.mock.calls[0][0].data.rolePermissions).toEqual({
      deleteMany: {},
      create: [{ permissionId: 'perm-1' }],
    });
  });
});
