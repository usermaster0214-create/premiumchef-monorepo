import { Type } from 'class-transformer';
import { OrderStatus } from '@premiumchef/database';
import { IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class ListOrdersDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
