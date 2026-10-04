import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RolesController, UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController, RolesController],
  providers: [UsersService],
})
export class UsersModule {}
