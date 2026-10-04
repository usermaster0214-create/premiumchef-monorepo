import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { CurrentTenant, CurrentTenantContext } from '../auth/current-tenant.decorator';
import { RequirePermissions } from '../auth/permissions.guard';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { toActor, UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(): Promise<unknown> {
    return this.usersService.listUsers();
  }

  @Get('units')
  @RequirePermissions('users.read')
  units(): Promise<unknown> {
    return this.usersService.listUnits();
  }

  @Post()
  @RequirePermissions('users.create')
  create(
    @Body() dto: CreateUserDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.usersService.createUser(dto, toActor(request, tenant));
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.usersService.updateUser(id, dto, toActor(request, tenant));
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(): Promise<unknown> {
    return this.usersService.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('users.read')
  permissions(): string[] {
    return this.usersService.listPermissions();
  }

  @Post()
  @RequirePermissions('users.create')
  create(
    @Body() dto: CreateRoleDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.usersService.createRole(dto, toActor(request, tenant));
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<unknown> {
    return this.usersService.updateRole(id, dto, toActor(request, tenant));
  }
}
