import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminGuard],
})
export class PlatformModule {}
