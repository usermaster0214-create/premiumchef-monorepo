import { PartialType } from '@nestjs/mapped-types';
import { ProductStatus } from '@premiumchef/database';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  image_url?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sort_order?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class UpdateCatalogStatusDto {
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}