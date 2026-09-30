import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from './auth.types';
import {
  PermissionsGuard,
  REQUIRED_PERMISSIONS_KEY,
} from './permissions.guard';

describe('PermissionsGuard', () => {
  const handler = () => undefined;
  const controller = class TestController {};
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let guard: PermissionsGuard;

  function createUser(permissions: string[]): AuthenticatedRequest['user'] {
    return {
      sub: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      tenant_id: 'tenant-1',
      units: ['unit-1'],
      roles: ['CAIXA'],
      permissions,
      token_type: 'access',
    };
  }

  function createContext(user?: AuthenticatedRequest['user']): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows routes without permission metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      REQUIRED_PERMISSIONS_KEY,
      [handler, controller],
    );
  });

  it('requires every declared permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'orders.create',
      'orders.pay',
    ]);

    expect(
      guard.canActivate(
        createContext(createUser(['orders.create', 'orders.pay'])),
      ),
    ).toBe(true);
    expect(
      guard.canActivate(createContext(createUser(['orders.create']))),
    ).toBe(false);
    expect(guard.canActivate(createContext())).toBe(false);
  });
});