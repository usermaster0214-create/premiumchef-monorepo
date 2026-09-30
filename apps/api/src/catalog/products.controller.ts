import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductStatus } from '@premiumchef/database';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { R2StorageService } from '../storage/r2-storage.service';
import { CatalogImageFile } from '../storage/r2-storage.service';
import { CatalogService } from './catalog.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import {
  CreateAddonDto,
  UpdateAddonDto,
  UpdateAddonStatusDto,
} from './dto/addon.dto';
import { UpdateCatalogStatusDto } from './dto/category.dto';
import {
  CreateProductDto,
  ProductVariantDto,
  ProductVariantStatusDto,
  SetRecipeDto,
  UpdateProductVariantDto,
  UpdateProductDto,
} from './dto/product.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly storage: R2StorageService,
  ) {}

  @Get()
  @RequirePermissions('products.read')
  list(
    @Query() query: CatalogQueryDto,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.catalogService.listProducts(
      {
        status: query.status,
        categoryId: query.category_id,
        search: query.search,
      },
      tenant.unitId,
    );
  }

  @Get(':id')
  @RequirePermissions('products.read')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.catalogService.getProduct(id, tenant.unitId);
  }

  @Post()
  @RequirePermissions('products.create')
  create(
    @Body() dto: CreateProductDto,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.catalogService.createProduct(dto, tenant.tenantId, tenant.unitId);
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.catalogService.updateProduct(id, dto, tenant.unitId);
  }

  @Patch(':id/status')
  @RequirePermissions('products.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogStatusDto,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.catalogService.setProductStatus(id, dto.status, tenant.unitId);
  }

  @Put(':id/recipe')
  @RequirePermissions('products.update')
  setRecipe(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecipeDto,
  ): Promise<unknown> {
    return this.catalogService.setRecipe(id, dto);
  }

  @Post(':id/variants')
  @RequirePermissions('products.create')
  createVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProductVariantDto,
  ): Promise<unknown> {
    return this.catalogService.createVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  @RequirePermissions('products.update')
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ): Promise<unknown> {
    return this.catalogService.updateVariant(id, variantId, dto);
  }

  @Patch(':id/variants/:variantId/status')
  @RequirePermissions('products.update')
  setVariantStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: ProductVariantStatusDto,
  ): Promise<unknown> {
    return this.catalogService.setVariantStatus(id, variantId, dto.status);
  }

  @Post(':id/image')
  @RequirePermissions('products.update')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
      },
    }),
  )
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: CatalogImageFile | undefined,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    if (!file) {
      throw new BadRequestException('A imagem JPEG, PNG ou WebP é obrigatória');
    }
    await this.catalogService.getProduct(id, tenant.unitId);
    const imageUrl = await this.storage.uploadCatalogImage(
      file,
      tenant.tenantId,
      tenant.unitId,
    );
    return this.catalogService.setProductImage(id, imageUrl, tenant.unitId);
  }
}

@Controller('addons')
export class AddonsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @RequirePermissions('products.read')
  list(@Query() query: CatalogQueryDto): Promise<unknown> {
    return this.catalogService.listAddons(query.status);
  }

  @Post()
  @RequirePermissions('products.create')
  create(
    @Body() dto: CreateAddonDto,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.catalogService.createAddon(dto, tenant.tenantId);
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddonDto,
  ): Promise<unknown> {
    return this.catalogService.updateAddon(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('products.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddonStatusDto,
  ): Promise<unknown> {
    return this.catalogService.setAddonStatus(id, dto.status);
  }
}