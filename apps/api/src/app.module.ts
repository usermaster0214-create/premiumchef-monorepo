import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { AuditInterceptor } from './common/audit.interceptor';
import { TenantContextMiddleware } from './common/tenant-context.middleware';
import { DatabaseModule } from './database/database.module';
import { CatalogModule } from './catalog/catalog.module';
import { CashModule } from './cash/cash.module';
import { PaymentsModule } from './payments/payments.module';
import { OrdersModule } from './orders/orders.module';
import { TablesModule } from './tables/tables.module';
import { SplitsModule } from './splits/splits.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { DeliveryModule } from './delivery/delivery.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasesModule } from './purchases/purchases.module';
import { ReportsModule } from './reports/reports.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuthModule,
    CatalogModule,
    CashModule,
    PaymentsModule,
    OrdersModule,
    TablesModule,
    SplitsModule,
    KitchenModule,
    DeliveryModule,
    InventoryModule,
    PurchasesModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    TenantContextMiddleware,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
