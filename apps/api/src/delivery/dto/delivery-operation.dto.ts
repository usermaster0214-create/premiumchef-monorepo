import { DeliveryStatus } from '@premiumchef/database';
import { IsEnum, IsNumber, IsUUID, Max, Min } from 'class-validator';

export class AssignDriverDto {
  @IsUUID()
  driver_id!: string;
}

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;
}

export class UpdateDriverLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}