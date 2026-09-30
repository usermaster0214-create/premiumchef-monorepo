import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CategoriesController } from './categories.controller';
import { ProductsController, AddonsController } from './products.controller';
import { R2StorageService } from '../storage/r2-storage.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [CategoriesController, ProductsController, AddonsController],
  providers: [CatalogService, R2StorageService],
  exports: [CatalogService],
})
export class CatalogModule {}