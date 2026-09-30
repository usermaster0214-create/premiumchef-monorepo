import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class PurchaseItemDto {
  @IsUUID()
  product_id!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  unit_cost!: number;
}

export class CreatePurchaseDto {
  @IsOptional()
  @IsUUID()
  supplier_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  invoice_number?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items!: PurchaseItemDto[];
}