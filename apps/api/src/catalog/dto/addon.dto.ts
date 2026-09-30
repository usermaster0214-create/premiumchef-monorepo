import { ProductStatus } from '@premiumchef/database';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAddonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price!: number;
}

export class UpdateAddonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price?: number;
}

export class UpdateAddonStatusDto {
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}