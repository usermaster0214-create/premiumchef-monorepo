import { PaymentMethod } from '@premiumchef/database';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
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
import { OrderItemDto } from '../../orders/dto/create-order.dto';

export class CheckoutDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(40)
  phone!: string;

  @IsUUID()
  zone_id!: string;

  @IsString()
  @MaxLength(20)
  zip_code!: string;

  @IsString()
  @MaxLength(180)
  street!: string;

  @IsString()
  @MaxLength(30)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complement?: string;

  @IsString()
  @MaxLength(120)
  neighborhood!: string;

  @IsString()
  @MaxLength(120)
  city!: string;

  @IsString()
  @MaxLength(2)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reference?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsEnum(PaymentMethod)
  payment_method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}