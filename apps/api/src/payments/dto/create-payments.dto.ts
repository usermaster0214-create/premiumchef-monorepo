import { PaymentMethod } from '@premiumchef/database';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaymentPartDto {
  @IsEnum(PaymentMethod)
  payment_method!: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000000)
  amount!: number;

  @IsOptional()
  @IsString()
  transaction_id?: string;
}

export class CreatePaymentsDto {
  @IsOptional()
  @IsUUID()
  split_id?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentPartDto)
  payments!: PaymentPartDto[];
}