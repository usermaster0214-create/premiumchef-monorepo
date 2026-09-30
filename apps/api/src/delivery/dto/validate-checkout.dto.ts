import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ValidateCheckoutDto {
  @IsUUID()
  zone_id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  subtotal!: number;

  @IsString()
  @MaxLength(120)
  neighborhood!: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}