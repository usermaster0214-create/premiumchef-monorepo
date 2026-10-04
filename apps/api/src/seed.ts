import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient, UserStatus } from '@premiumchef/database';
import { ALL_PERMISSIONS, DEFAULT_ROLES } from './platform/default-roles';

const prisma = new PrismaClient();

const permissions = ALL_PERMISSIONS;

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be configured with at least 12 characters');
  }
  const tenantId = process.env.SEED_TENANT_ID || '00000000-0000-4000-8000-000000000001';
  const unitId = process.env.SEED_UNIT_ID || '00000000-0000-4000-8000-000000000002';
  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@premiumchef.local').toLowerCase();
  const tenant = await prisma.tenant.upsert({
    where: { id: tenantId },
    update: { name: process.env.SEED_TENANT_NAME || 'PremiumChef Staging' },
    create: { id: tenantId, name: process.env.SEED_TENANT_NAME || 'PremiumChef Staging' },
  });
  const unit = await prisma.unit.upsert({
    where: { id: unitId },
    update: { name: process.env.SEED_UNIT_NAME || 'Unidade Principal', status: 'ACTIVE' },
    create: { id: unitId, tenantId: tenant.id, name: process.env.SEED_UNIT_NAME || 'Unidade Principal' },
  });
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: process.env.SEED_ADMIN_NAME || 'Administrador', passwordHash: await argon2.hash(password), status: UserStatus.ACTIVE, tenantId: tenant.id, isPlatformAdmin: true },
    create: { tenantId: tenant.id, name: process.env.SEED_ADMIN_NAME || 'Administrador', email, passwordHash: await argon2.hash(password), status: UserStatus.ACTIVE, isPlatformAdmin: true },
  });
  await prisma.userUnit.upsert({ where: { userId_unitId: { userId: user.id, unitId: unit.id } }, update: {}, create: { userId: user.id, unitId: unit.id } });
  const role = await prisma.role.findFirst({ where: { tenantId: tenant.id, name: 'ADMIN' } }) || await prisma.role.create({ data: { tenantId: tenant.id, name: 'ADMIN', description: 'Administrador de staging' } });
  for (const permissionName of permissions) {
    const permission = await prisma.permission.upsert({ where: { name: permissionName }, update: {}, create: { name: permissionName } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
  }
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  for (const preset of DEFAULT_ROLES.filter((candidate) => candidate.name !== 'ADMIN')) {
    if (await prisma.role.findFirst({ where: { tenantId: tenant.id, name: preset.name } })) continue;
    const created = await prisma.role.create({ data: { tenantId: tenant.id, name: preset.name, description: preset.description } });
    const found = await prisma.permission.findMany({ where: { name: { in: [...preset.permissions] } }, select: { id: true } });
    await prisma.rolePermission.createMany({ data: found.map(({ id }) => ({ roleId: created.id, permissionId: id })) });
  }
  await prisma.cashRegister.upsert({ where: { id: '00000000-0000-4000-8000-000000000003' }, update: { name: 'Caixa Principal', unitId: unit.id }, create: { id: '00000000-0000-4000-8000-000000000003', unitId: unit.id, name: 'Caixa Principal' } });
  await prisma.restaurantTable.upsert({ where: { id: '00000000-0000-4000-8000-000000000004' }, update: { number: 1, unitId: unit.id }, create: { id: '00000000-0000-4000-8000-000000000004', unitId: unit.id, number: 1, capacity: 4 } });
  await prisma.deliveryZone.upsert({
    where: { unitId_name: { unitId: unit.id, name: 'Centro' } },
    update: { deliveryFee: 7.5, estimatedMinutes: 35, status: 'ACTIVE' },
    create: { unitId: unit.id, name: 'Centro', deliveryFee: 7.5, estimatedMinutes: 35 },
  });
  console.log(`Seed complete: tenant=${tenant.id} unit=${unit.id} admin=${user.email}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());