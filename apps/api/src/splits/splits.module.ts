import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SplitsController } from './splits.controller';
import { SplitsService } from './splits.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SplitsController],
  providers: [SplitsService],
})
export class SplitsModule {}