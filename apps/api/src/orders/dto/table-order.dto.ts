import { IsUUID } from 'class-validator';

export class TransferOrderTableDto {
  @IsUUID()
  table_id!: string;
}