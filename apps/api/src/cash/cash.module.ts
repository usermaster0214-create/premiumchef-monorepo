import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CashController } from './cash.controller';
import { CashService } from './cash.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}