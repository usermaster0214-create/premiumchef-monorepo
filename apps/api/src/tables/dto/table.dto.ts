import { TableStatus } from '@premiumchef/database';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTableDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  number!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  capacity?: number;

  @IsOptional()
  @IsEnum(TableStatus)
  status?: TableStatus;
}

export class UpdateTableDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  capacity?: number;
}

export class UpdateTableStatusDto {
  @IsEnum(TableStatus)
  status!: TableStatus;
}