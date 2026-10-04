import { BadRequestException } from '@nestjs/common';
import { ProductStatus } from '@premiumchef/database';
import { runWithTenantContext } from '@premiumchef/database';
import { PrismaService } from '../database/prisma.service';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: {
    tenantScoped: {
      category: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      product: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      productUnit: { findFirst: jest.Mock };
      addon: { findMany: jest.Mock; findFirst: jest.Mock };
      productAddon: { findMany: jest.Mock };
      $transaction: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      tenantScoped: {
        category: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
          update: jest.fn(),
        },
        product: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        productUnit: { findFirst: jest.fn() },
        addon: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
        },
        productAddon: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn(),
      },
    } as typeof prisma;
    service = new CatalogService(prisma as unknown as PrismaService);
  });

  it('rejects a category that is not available in the active tenant', async () => {
    await expect(
      service.createProduct(
        {
          name: 'Produto cruzado',
          price: 15,
          category_id: 'another-tenant-category',
        },
        'tenant-1',
        'unit-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenantScoped.product.create).not.toHaveBeenCalled();
  });

  it('stores the price and cost against the authenticated unit', async () => {
    prisma.tenantScoped.product.create.mockResolvedValue({ id: 'product-1' });

    await service.createProduct(
      { name: 'Produto', price: 15.5, cost_price: 6.25, stock_min: 3 },
      'tenant-1',
      'unit-2',
    );

    expect(prisma.tenantScoped.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          productUnits: {
            create: {
              unitId: 'unit-2',
              price: 15.5,
              costPrice: 6.25,
              stockMin: 3,
            },
          },
        }),
      }),
    );
  });

  it('inactivates products without issuing physical deletes', async () => {
    prisma.tenantScoped.product.findFirst.mockResolvedValue({
      id: 'product-1',
      name: 'Produto',
    });
    prisma.tenantScoped.product.update.mockResolvedValue({
      id: 'product-1',
      status: ProductStatus.INACTIVE,
    });

    await service.setProductStatus(
      'product-1',
      ProductStatus.INACTIVE,
      'unit-1',
    );

    expect(prisma.tenantScoped.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ProductStatus.INACTIVE } }),
    );
  });

  it('reactivates an inactive category belonging to the current tenant', async () => {
    prisma.tenantScoped.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.tenantScoped.category.update.mockResolvedValue({
      id: 'category-1',
      status: ProductStatus.ACTIVE,
    });

    await service.setCategoryStatus('category-1', ProductStatus.ACTIVE);

    expect(prisma.tenantScoped.category.findFirst).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      select: { id: true },
    });
    expect(prisma.tenantScoped.category.update).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      data: { status: ProductStatus.ACTIVE },
    });
  });

  it('requires a sale price when adding a product to a new unit', async () => {
    prisma.tenantScoped.product.findFirst.mockResolvedValue({
      id: 'product-1',
      name: 'Produto',
    });
    prisma.tenantScoped.productUnit.findFirst.mockResolvedValue(null);

    await expect(
      service.updateProduct('product-1', { cost_price: 4 }, 'unit-2'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.tenantScoped.product.update).not.toHaveBeenCalled();
  });

  it('writes recipe versions through the tenant-scoped transaction client', async () => {
    prisma.tenantScoped.product.findFirst.mockResolvedValue({
      id: 'product-1',
      name: 'Produto acabado',
    });
    const transaction = {
      recipe: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'recipe-2' }),
      },
    };
    prisma.tenantScoped.$transaction.mockImplementation(
      (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );

    await runWithTenantContext(
      { tenantId: 'tenant-1', unitId: 'unit-1' },
      () => service.setRecipe('product-1', {
        name: 'Ficha principal',
        items: [],
      }),
    );

    expect(prisma.tenantScoped.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.recipe.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: { id: 'product-1', tenantId: 'tenant-1' },
        }),
      }),
    );
  });
});