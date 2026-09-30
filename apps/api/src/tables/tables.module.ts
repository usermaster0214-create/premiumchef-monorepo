import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}