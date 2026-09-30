import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  createTenantPrismaClient,
  PrismaClient,
  TenantPrismaClient,
} from '@premiumchef/database';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  readonly tenantScoped: TenantPrismaClient = createTenantPrismaClient(this);

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}