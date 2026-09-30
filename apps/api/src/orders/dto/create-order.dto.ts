import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderType } from '@premiumchef/database';

export class OrderOptionDto {
  @IsUUID()
  addon_id!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_price?: number;
}

export class OrderItemDto {
  @IsUUID()
  product_id!: string;

  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000)
  quantity!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unit_price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OrderOptionDto)
  options?: OrderOptionDto[];
}

export class CreateOrderDto {
  @IsEnum(OrderType)
  order_type!: OrderType;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsUUID()
  table_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}