import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  document?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  vehicle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;
}

export class UpdateDriverDto extends CreateDriverDto {}