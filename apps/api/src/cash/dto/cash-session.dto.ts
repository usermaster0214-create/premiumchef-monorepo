import { CashMovementType } from '@premiumchef/database';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class OpenCashSessionDto {
  @IsUUID()
  cash_register_id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  opening_amount!: number;
}

export class CreateCashMovementDto {
  @IsEnum(CashMovementType)
  type!: CashMovementType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000000)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CloseCashSessionDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  counted_amount!: number;
}