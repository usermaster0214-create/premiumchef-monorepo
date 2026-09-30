import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { PrismaService } from '../src/database/prisma.service';

describe('Authentication (e2e)', () => {
  const tenantId = 'tenant-1';
  const unitId = 'unit-1';
  const userId = 'user-1';
  let app: INestApplication;
  let passwordHash: string;
  let refreshRecords: Map<
    string,
    {
      id: string;
      tenantId: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
    }
  >;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-access-secret-that-is-long-enough-32';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough-32';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    passwordHash = await argon2.hash('correct-password');
  });

  beforeEach(async () => {
    refreshRecords = new Map();
    const authUser = {
      id: userId,
      tenantId,
      name: 'Operador de Teste',
      email: 'operador@example.com',
      status: 'ACTIVE',
      tenant: { status: 'ACTIVE' },
      userUnits: [{ unitId }],
      userRoles: [
        {
          role: {
            name: 'CAIXA',
            rolePermissions: [
              { permission: { name: 'orders.create' } },
            ],
          },
        },
      ],
    };

    const transaction = {
      user: {
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(authUser),
      },
      refreshToken: {
        create: jest.fn(
          async ({
            data,
          }: {
            data: Omit<
              (typeof refreshRecords extends Map<string, infer T> ? T : never),
              'id' | 'revokedAt'
            >;
          }) => {
            const row = {
              ...data,
              id: `refresh-${refreshRecords.size + 1}`,
              revokedAt: null,
            };
            refreshRecords.set(data.tokenHash, row);
            return row;
          },
        ),
        findUnique: jest.fn(
          async ({ where }: { where: { tokenHash: string } }) =>
            refreshRecords.get(where.tokenHash) ?? null,
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; revokedAt: null; expiresAt: { gt: Date } };
            data: { revokedAt: Date };
          }) => {
            const entry = [...refreshRecords.entries()].find(
              ([, token]) => token.id === where.id,
            );
            if (
              !entry ||
              entry[1].revokedAt ||
              entry[1].expiresAt <= where.expiresAt.gt
            ) {
              return { count: 0 };
            }
            entry[1].revokedAt = data.revokedAt;
            return { count: 1 };
          },
        ),
      },
    };

    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: userId,
          tenantId,
          passwordHash,
          status: 'ACTIVE',
        }),
        findFirst: jest.fn().mockResolvedValue(authUser),
      },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtAuthGuard,
        PermissionsGuard,
        Reflector,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: new JwtService({}) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalGuards(
      moduleRef.get(JwtAuthGuard),
      moduleRef.get(PermissionsGuard),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('logs in, validates unit context, returns profile, and rotates refresh tokens', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'operador@example.com', password: 'wrong-password' })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'operador@example.com', password: 'correct-password' })
      .expect(200);

    expect(login.body.user).toMatchObject({
      id: userId,
      tenant_id: tenantId,
      units: [unitId],
      roles: ['CAIXA'],
      permissions: ['orders.create'],
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .set('X-Tenant-ID', 'other-tenant')
      .set('X-Unit-ID', unitId)
      .expect(401);

    const profile = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .set('X-Tenant-ID', tenantId)
      .set('X-Unit-ID', unitId)
      .expect(200);

    expect(profile.body).toMatchObject({
      id: userId,
      tenant_id: tenantId,
      unit_id: unitId,
    });

    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: login.body.refresh_token })
      .expect(200);

    expect(refresh.body.refresh_token).not.toBe(login.body.refresh_token);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: login.body.refresh_token })
      .expect(401);
  });
});