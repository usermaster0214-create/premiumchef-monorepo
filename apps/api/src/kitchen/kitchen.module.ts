import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { KitchenController } from './kitchen.controller';
import { KitchenGateway } from './kitchen.gateway';
import { KitchenService } from './kitchen.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [KitchenController],
  providers: [KitchenService, KitchenGateway],
  exports: [KitchenService],
})
export class KitchenModule {}