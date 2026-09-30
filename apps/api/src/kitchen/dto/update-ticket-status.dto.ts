import { KitchenTicketStatus } from '@premiumchef/database';
import { IsEnum } from 'class-validator';

export class UpdateTicketStatusDto {
  @IsEnum(KitchenTicketStatus)
  status!: KitchenTicketStatus;
}