import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryOperationsController } from './delivery-operations.controller';
import { DeliveryOperationsService } from './delivery-operations.service';
import { DeliveryGateway } from './delivery.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, OrdersModule, AuthModule],
  controllers: [DeliveryController, DeliveryOperationsController],
  providers: [DeliveryService, DeliveryOperationsService, DeliveryGateway],
  exports: [DeliveryService],
})
export class DeliveryModule {}