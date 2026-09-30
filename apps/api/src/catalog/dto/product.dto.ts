import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ProductType, ProductStatus } from '@premiumchef/database';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProductVariantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price!: number;
}

export class RecipeItemDto {
  @IsUUID()
  ingredient_product_id!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1000000)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;
}

export class ProductAddonDto {
  @IsUUID()
  addon_id!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  max_quantity?: number;
}

export class CreateProductDto {
  @IsOptional()
  @IsUUID()
  category_id?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  image_url?: string;

  @IsOptional()
  @IsEnum(ProductType)
  type?: ProductType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  cost_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000000)
  stock_min?: number;

  @IsOptional()
  @IsBoolean()
  track_stock?: boolean;

  @IsOptional()
  @IsBoolean()
  is_delivery?: boolean;

  @IsOptional()
  @IsBoolean()
  is_pos?: boolean;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ArrayUnique((addon: ProductAddonDto) => addon.addon_id)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @IsArray()
  @ArrayMaxSize(40)
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductAddonDto)
  addons?: ProductAddonDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipe_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1000000)
  recipe_yield?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  recipe_items?: RecipeItemDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateProductStatusDto {
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}

export class SetRecipeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1000000)
  yield_quantity?: number;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RecipeItemDto)
  items!: RecipeItemDto[];
}

export class UpdateProductVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price?: number;
}

export class ProductVariantStatusDto {
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}