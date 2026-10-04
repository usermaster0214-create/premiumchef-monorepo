import { TenantStatus } from '@premiumchef/database';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  legal_name?: string;

  @IsOptional()
  @Matches(/^[\d./-]{11,18}$/, { message: 'Informe um CPF ou CNPJ válido' })
  document?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  unit_name?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  admin_name!: string;

  @IsEmail()
  @MaxLength(254)
  admin_email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  admin_password!: string;
}

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatus)
  status!: TenantStatus;
}
