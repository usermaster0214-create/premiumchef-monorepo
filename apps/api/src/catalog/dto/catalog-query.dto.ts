import { ProductStatus } from '@premiumchef/database';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CatalogQueryDto {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}