import { InventoryMovementType } from '@premiumchef/database';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateInventoryMovementDto {
  @IsUUID()
  product_id!: string;

  @IsEnum(InventoryMovementType)
  type!: InventoryMovementType;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(-100000000)
  @Max(100000000)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}