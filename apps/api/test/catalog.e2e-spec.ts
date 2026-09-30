import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { runWithTenantContext } from '@premiumchef/database';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { CatalogModule } from '../src/catalog/catalog.module';
import { PrismaService } from '../src/database/prisma.service';

describe('Catalog API (e2e)', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const unitId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const secret = 'catalog-test-access-secret-with-at-least-32-chars';
  let app: INestApplication;
  let jwtService: JwtService;
  const prismaMock = {
    tenantScoped: {
      category: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: 'category-1',
          name: 'Bebidas',
        }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'product-1', name: 'Suco' }),
      },
      addon: { findMany: jest.fn().mockResolvedValue([]) },
    },
  };

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
      providers: [
        JwtAuthGuard,
        PermissionsGuard,
        { provide: JwtService, useValue: new JwtService({}) },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    jwtService = moduleRef.get(JwtService);
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const requestTenantId = req.header('x-tenant-id');
      const requestUnitId = req.header('x-unit-id');
      if (requestTenantId && requestUnitId) {
        runWithTenantContext(
          { tenantId: requestTenantId, unitId: requestUnitId },
          next,
        );
        return;
      }
      next();
    });
    app.useGlobalGuards(
      moduleRef.get(JwtAuthGuard),
      moduleRef.get(PermissionsGuard),
    );
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app?.close();
  });

  async function token(permissions: string[]) {
    return jwtService.signAsync(
      {
        sub: userId,
        name: 'Gerente',
        email: 'gerente@example.com',
        tenant_id: tenantId,
        units: [unitId],
        roles: ['GERENTE'],
        permissions,
        token_type: 'access',
      },
      { secret },
    );
  }

  function withContext(accessToken: string, requestTenantId = tenantId) {
    return (testRequest: request.Test) =>
      testRequest
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', requestTenantId)
        .set('X-Unit-ID', unitId);
  }

  it('lists products and creates categories/products for the selected unit', async () => {
    const accessToken = await token(['products.read', 'products.create']);

    await withContext(accessToken)(
      request(app.getHttpServer()).get('/api/v1/products'),
    ).expect(200, []);

    await withContext(accessToken)(
      request(app.getHttpServer())
        .post('/api/v1/categories')
        .send({ name: 'Bebidas' }),
    ).expect(201);

    await withContext(accessToken)(
      request(app.getHttpServer())
        .post('/api/v1/products')
        .send({ name: 'Suco', price: 12.5 }),
    ).expect(201);

    expect(prismaMock.tenantScoped.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          productUnits: {
            create: expect.objectContaining({ unitId, price: 12.5 }),
          },
        }),
      }),
    );
  });

  it('requires the requested product permission and rejects another tenant', async () => {
    const readOnlyToken = await token(['products.read']);
    await withContext(readOnlyToken)(
      request(app.getHttpServer())
        .post('/api/v1/categories')
        .send({ name: 'Bloqueada' }),
    ).expect(403);

    const writerToken = await token(['products.create']);
    await withContext(writerToken, '44444444-4444-4444-8444-444444444444')(
      request(app.getHttpServer()).get('/api/v1/products'),
    ).expect(401);
  });
});