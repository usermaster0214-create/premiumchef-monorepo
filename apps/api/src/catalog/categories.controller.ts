import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductStatus } from '@premiumchef/database';
import { RequirePermissions } from '../auth/permissions.guard';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { R2StorageService } from '../storage/r2-storage.service';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  UpdateCatalogStatusDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { CatalogQueryDto } from './dto/catalog-query.dto';
import { CatalogImageFile } from '../storage/r2-storage.service';

@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly storage: R2StorageService,
  ) {}

  @Get()
  @RequirePermissions('products.read')
  list(@Query() query: CatalogQueryDto) {
    return this.catalogService.listCategories(query.status);
  }

  @Post()
  @RequirePermissions('products.create')
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentTenant() tenant: CurrentTenantContext,
  ) {
    return this.catalogService.createCategory(dto, tenant.tenantId);
  }

  @Get(':id')
  @RequirePermissions('products.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogService.getCategory(id);
  }

  @Patch(':id')
  @RequirePermissions('products.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('products.update')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogStatusDto,
  ) {
    return this.catalogService.setCategoryStatus(id, dto.status);
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
  ) {
    if (!file) {
      throw new BadRequestException('A imagem JPEG, PNG ou WebP é obrigatória');
    }
    await this.catalogService.getCategory(id);
    const imageUrl = await this.storage.uploadCatalogImage(
      file,
      tenant.tenantId,
      tenant.unitId,
    );
    return this.catalogService.setCategoryImage(id, imageUrl);
  }
}