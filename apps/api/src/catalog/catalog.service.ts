import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Addon,
  Category,
  Prisma,
  ProductStatus,
  ProductType,
  ProductVariant,
  getTenantContext,
} from '@premiumchef/database';
import { PrismaService } from '../database/prisma.service';
import { CreateAddonDto, UpdateAddonDto } from './dto/addon.dto';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import {
  CreateProductDto,
  ProductAddonDto,
  ProductVariantDto,
  RecipeItemDto,
  SetRecipeDto,
  UpdateProductVariantDto,
  UpdateProductDto,
} from './dto/product.dto';

const productInclude = (unitId: string) => ({
  category: true,
  productUnits: { where: { unitId } },
  variants: { where: { status: ProductStatus.ACTIVE }, orderBy: { name: 'asc' as const } },
  productAddons: {
    where: {
      status: ProductStatus.ACTIVE,
      addon: { status: ProductStatus.ACTIVE },
    },
    include: { addon: true },
    orderBy: { addon: { name: 'asc' as const } },
  },
  recipes: {
    where: { status: ProductStatus.ACTIVE },
    include: {
      recipeItems: {
        include: {
          ingredientProduct: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  },
});

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories(status?: ProductStatus): Promise<Category[]> {
    return this.prisma.tenantScoped.category.findMany({
      where: status ? { status } : {},
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getCategory(id: string): Promise<Category> {
    const category = await this.prisma.tenantScoped.category.findFirst({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }
    return category;
  }

  createCategory(
    dto: CreateCategoryDto,
    tenantId: string,
  ): Promise<Category> {
    return this.prisma.tenantScoped.category.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        imageUrl: dto.image_url,
        status: dto.status ?? ProductStatus.ACTIVE,
        sortOrder: dto.sort_order ?? 0,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.requireCategory(id);
    return this.prisma.tenantScoped.category.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        imageUrl: dto.image_url,
        status: dto.status,
        sortOrder: dto.sort_order,
      },
    });
  }

  async setCategoryImage(id: string, imageUrl: string) {
    await this.requireCategory(id);
    return this.prisma.tenantScoped.category.update({
      where: { id },
      data: { imageUrl },
    });
  }

  async setCategoryStatus(id: string, status: ProductStatus) {
    await this.requireCategory(id);
    return this.prisma.tenantScoped.category.update({
      where: { id },
      data: { status },
    });
  }

  async listProducts(filters: {
    status?: ProductStatus;
    categoryId?: string;
    search?: string;
  }, unitId: string) {
    const search = filters.search?.trim();
    const where: Prisma.ProductWhereInput = {
      status: filters.status,
      categoryId: filters.categoryId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.tenantScoped.product.findMany({
      where,
      include: productInclude(unitId),
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  }

  async getProduct(id: string, unitId: string) {
    const product = await this.prisma.tenantScoped.product.findFirst({
      where: { id },
      include: productInclude(unitId),
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return product;
  }

  async createProduct(dto: CreateProductDto, tenantId: string, unitId: string) {
    await this.requireCategory(dto.category_id);
    const addons = dto.addons ?? [];
    const addonIds = [...new Set(addons.map((addon) => addon.addon_id))];
    const ingredientIds = this.getIngredientIds(dto.recipe_items ?? []);
    await Promise.all([
      this.assertAddons(addonIds),
      this.assertIngredients(ingredientIds),
    ]);

    return this.prisma.tenantScoped.product.create({
      data: {
        tenantId,
        categoryId: dto.category_id ?? undefined,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        sku: dto.sku?.trim(),
        barcode: dto.barcode?.trim(),
        imageUrl: dto.image_url,
        type: dto.type ?? ProductType.FOOD,
        status: dto.status ?? ProductStatus.ACTIVE,
        trackStock: dto.track_stock ?? true,
        isDelivery: dto.is_delivery ?? true,
        isPos: dto.is_pos ?? true,
        productUnits: {
          create: {
            unitId,
            price: dto.price,
            costPrice: dto.cost_price,
            stockMin: dto.stock_min,
          },
        },
        variants: dto.variants?.length
          ? {
              create: dto.variants.map((variant) => ({
                name: variant.name.trim(),
                sku: variant.sku?.trim(),
                price: variant.price,
                status: ProductStatus.ACTIVE,
              })),
            }
          : undefined,
        productAddons: addonIds.length
          ? {
              create: addons.map((addon) => ({
                addon: { connect: { id: addon.addon_id } },
                required: addon.required ?? false,
                maxQuantity: addon.max_quantity ?? 1,
                status: ProductStatus.ACTIVE,
              })),
            }
          : undefined,
        recipes: dto.recipe_items?.length
          ? {
              create: {
                name: dto.recipe_name?.trim() || `Ficha técnica de ${dto.name.trim()}`,
                yieldQuantity: dto.recipe_yield ?? 1,
                recipeItems: {
                  create: dto.recipe_items.map((item) => ({
                    ingredientProduct: {
                      connect: { id: item.ingredient_product_id },
                    },
                    quantity: item.quantity,
                    unit: item.unit.trim(),
                  })),
                },
              },
            }
          : undefined,
      },
      include: productInclude(unitId),
    });
  }

  async updateProduct(id: string, dto: UpdateProductDto, unitId: string) {
    const existing = await this.requireProduct(id);
    if (dto.category_id !== undefined) {
      await this.requireCategory(dto.category_id ?? undefined);
    }

    const addons = dto.addons;
    const addonIds = addons
      ? [...new Set(addons.map((addon) => addon.addon_id))]
      : undefined;
    const ingredientIds = dto.recipe_items
      ? this.getIngredientIds(dto.recipe_items)
      : [];
    await Promise.all([
      addonIds ? this.assertAddons(addonIds) : Promise.resolve(),
      this.assertIngredients(ingredientIds),
    ]);

    const data: Prisma.ProductUpdateInput = {
      category:
        dto.category_id === null
          ? { disconnect: true }
          : dto.category_id
            ? { connect: { id: dto.category_id } }
            : undefined,
      name: dto.name?.trim(),
      description: dto.description?.trim(),
      sku: dto.sku?.trim(),
      barcode: dto.barcode?.trim(),
      imageUrl: dto.image_url,
      type: dto.type,
      status: dto.status,
      trackStock: dto.track_stock,
      isDelivery: dto.is_delivery,
      isPos: dto.is_pos,
    };

    if (dto.price !== undefined || dto.cost_price !== undefined || dto.stock_min !== undefined) {
      const currentUnitPrice = await this.prisma.tenantScoped.productUnit.findFirst({
        where: { productId: id, unitId },
        select: { price: true, costPrice: true, stockMin: true },
      });
      if (!currentUnitPrice && dto.price === undefined) {
        throw new BadRequestException(
          'Informe o preço de venda ao cadastrar este produto para uma nova unidade',
        );
      }
      data.productUnits = {
        upsert: {
          where: { productId_unitId: { productId: id, unitId } },
          update: {
            price: dto.price,
            costPrice: dto.cost_price,
            stockMin: dto.stock_min,
          },
          create: {
            unitId,
            price: dto.price ?? Number(currentUnitPrice?.price),
            costPrice: dto.cost_price ?? currentUnitPrice?.costPrice,
            stockMin: dto.stock_min ?? currentUnitPrice?.stockMin,
          },
        },
      };
    }

    if (dto.variants) {
      data.variants = {
        updateMany: {
          where: { status: ProductStatus.ACTIVE },
          data: { status: ProductStatus.INACTIVE },
        },
        create: dto.variants.map((variant) => ({
          name: variant.name.trim(),
          sku: variant.sku?.trim(),
          price: variant.price,
          status: ProductStatus.ACTIVE,
        })),
      };
    }

    if (dto.recipe_items) {
      data.recipes = {
        updateMany: {
          where: { status: ProductStatus.ACTIVE },
          data: { status: ProductStatus.INACTIVE },
        },
        ...(dto.recipe_items.length
          ? {
              create: {
                name:
                  dto.recipe_name?.trim() ||
                  `Ficha técnica de ${dto.name?.trim() || existing.name}`,
                yieldQuantity: dto.recipe_yield ?? 1,
                recipeItems: {
                  create: dto.recipe_items.map((item) => ({
                    ingredientProduct: {
                      connect: { id: item.ingredient_product_id },
                    },
                    quantity: item.quantity,
                    unit: item.unit.trim(),
                  })),
                },
              },
            }
          : {}),
      };
    }

    if (addonIds) {
      const existingLinks = await this.prisma.tenantScoped.productAddon.findMany({
        where: { productId: id },
        select: { addonId: true, required: true, maxQuantity: true, status: true },
      });
      const existingById = new Map(
        existingLinks.map((link) => [link.addonId, link]),
      );
      const existingAddonIds = new Set(existingById.keys());
      const newAddonIds = addonIds.filter((addonId) => !existingAddonIds.has(addonId));
      const existingUpdates = (addons as ProductAddonDto[])
        .filter((addon) => existingById.has(addon.addon_id))
        .map((addon) => ({
          where: {
            productId_addonId: {
              productId: id,
              addonId: addon.addon_id,
            },
          },
          data: {
              status: ProductStatus.ACTIVE,
            required: addon.required ?? existingById.get(addon.addon_id)!.required,
            maxQuantity:
              addon.max_quantity ??
              existingById.get(addon.addon_id)!.maxQuantity,
          },
        }));
      const omittedAddonIds = [...existingById.keys()].filter(
        (addonId) => !addonIds.includes(addonId),
      );
      const omittedUpdates = omittedAddonIds
        .filter((addonId) => existingById.get(addonId)?.status === ProductStatus.ACTIVE)
        .map((addonId) => ({
          where: {
            productId_addonId: { productId: id, addonId },
          },
          data: { status: ProductStatus.INACTIVE },
        }));
      if (newAddonIds.length || existingUpdates.length || omittedUpdates.length) {
        data.productAddons = {
          ...([...existingUpdates, ...omittedUpdates].length
            ? { update: [...existingUpdates, ...omittedUpdates] }
            : {}),
          ...(newAddonIds.length
            ? {
                create: (addons as ProductAddonDto[])
                  .filter((addon) => newAddonIds.includes(addon.addon_id))
                  .map((addon) => ({
                    addon: { connect: { id: addon.addon_id } },
                    required: addon.required ?? false,
                    maxQuantity: addon.max_quantity ?? 1,
                    status: ProductStatus.ACTIVE,
                  })),
              }
            : {}),
        };
      }
    }

    return this.prisma.tenantScoped.product.update({
      where: { id },
      data,
      include: productInclude(unitId),
    });
  }

  async setProductImage(id: string, imageUrl: string, unitId: string) {
    await this.requireProduct(id);
    return this.prisma.tenantScoped.product.update({
      where: { id },
      data: { imageUrl },
      include: productInclude(unitId),
    });
  }

  async setProductStatus(id: string, status: ProductStatus, unitId: string) {
    await this.requireProduct(id);
    return this.prisma.tenantScoped.product.update({
      where: { id },
      data: { status },
      include: productInclude(unitId),
    });
  }

  async createVariant(
    productId: string,
    dto: ProductVariantDto,
  ): Promise<ProductVariant> {
    await this.requireProduct(productId);
    return this.prisma.tenantScoped.productVariant.create({
      data: {
        productId,
        name: dto.name.trim(),
        sku: dto.sku?.trim(),
        price: dto.price,
        status: ProductStatus.ACTIVE,
      },
    });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ) {
    await this.requireProduct(productId);
    const variant = await this.prisma.tenantScoped.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('Variação não encontrada');
    }
    return this.prisma.tenantScoped.productVariant.update({
      where: { id: variantId },
      data: {
        name: dto.name?.trim(),
        sku: dto.sku?.trim(),
        price: dto.price,
      },
    });
  }

  async setVariantStatus(
    productId: string,
    variantId: string,
    status: ProductStatus,
  ) {
    await this.requireProduct(productId);
    const variant = await this.prisma.tenantScoped.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('Variação não encontrada');
    }
    return this.prisma.tenantScoped.productVariant.update({
      where: { id: variantId },
      data: { status },
    });
  }

  async setRecipe(id: string, dto: SetRecipeDto) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new BadRequestException('Contexto tenant/unidade obrigatório');
    }
    await this.requireProduct(id);
    const ingredientIds = this.getIngredientIds(dto.items);
    await this.assertIngredients(ingredientIds);

    return this.prisma.tenantScoped.$transaction(async (transaction) => {
      await transaction.recipe.updateMany({
        where: {
          productId: id,
          status: ProductStatus.ACTIVE,
          product: { id, tenantId: tenantContext.tenantId },
        },
        data: { status: ProductStatus.INACTIVE },
      });
      return transaction.recipe.create({
        data: {
          product: { connect: { id } },
          name: dto.name.trim(),
          yieldQuantity: dto.yield_quantity ?? 1,
          recipeItems: {
            create: dto.items.map((item) => ({
              ingredientProductId: item.ingredient_product_id,
              quantity: item.quantity,
              unit: item.unit.trim(),
            })),
          },
        },
        include: { recipeItems: true },
      });
    });
  }

  async listAddons(status?: ProductStatus) {
    return this.prisma.tenantScoped.addon.findMany({
      where: status ? { status } : {},
      orderBy: { name: 'asc' },
    });
  }

  createAddon(dto: CreateAddonDto, tenantId: string): Promise<Addon> {
    return this.prisma.tenantScoped.addon.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        price: dto.price,
        status: ProductStatus.ACTIVE,
      },
    });
  }

  async updateAddon(id: string, dto: UpdateAddonDto) {
    await this.requireAddon(id);
    return this.prisma.tenantScoped.addon.update({
      where: { id },
      data: { name: dto.name?.trim(), price: dto.price },
    });
  }

  async setAddonStatus(id: string, status: ProductStatus) {
    await this.requireAddon(id);
    return this.prisma.tenantScoped.addon.update({
      where: { id },
      data: { status },
    });
  }

  private async requireCategory(id?: string | null) {
    if (!id) {
      return undefined;
    }
    const category = await this.prisma.tenantScoped.category.findFirst({
      where: { id, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('Categoria inexistente ou inativa neste tenant');
    }
    return category;
  }

  private async requireProduct(id: string) {
    const product = await this.prisma.tenantScoped.product.findFirst({
      where: { id },
      select: { id: true, name: true },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return product;
  }

  private async requireAddon(id: string) {
    const addon = await this.prisma.tenantScoped.addon.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!addon) {
      throw new NotFoundException('Adicional não encontrado');
    }
    return addon;
  }

  private async assertAddons(ids: string[]) {
    if (!ids.length) {
      return;
    }
    const addons = await this.prisma.tenantScoped.addon.findMany({
      where: { id: { in: ids }, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (addons.length !== ids.length) {
      throw new BadRequestException('Um ou mais adicionais não pertencem a este tenant ou estão inativos');
    }
  }

  private getIngredientIds(items: RecipeItemDto[]) {
    return [...new Set(items.map((item) => item.ingredient_product_id))];
  }

  private async assertIngredients(ids: string[]) {
    if (!ids.length) {
      return;
    }
    const products = await this.prisma.tenantScoped.product.findMany({
      where: { id: { in: ids }, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (products.length !== ids.length) {
      throw new BadRequestException('Um ou mais insumos não pertencem a este tenant ou estão inativos');
    }
  }
}