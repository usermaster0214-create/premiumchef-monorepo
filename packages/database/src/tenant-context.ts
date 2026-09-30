import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, PrismaClient } from '@prisma/client';

export interface TenantContext {
  tenantId: string;
  unitId: string;
}

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  context: TenantContext,
  callback: () => T,
): T {
  return tenantContextStorage.run(context, callback);
}

export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

type ScopeBuilder = (context: TenantContext) => Record<string, unknown>;

const scopeBuilders: Record<string, ScopeBuilder> = {
  Tenant: ({ tenantId }) => ({ id: tenantId }),
  Unit: ({ tenantId }) => ({ tenantId }),
  User: ({ tenantId }) => ({ tenantId }),
  UserUnit: ({ tenantId, unitId }) => ({
    unitId,
    unit: { tenantId },
  }),
  Role: ({ tenantId }) => ({ tenantId }),
  Permission: () => ({}),
  RolePermission: ({ tenantId }) => ({ role: { tenantId } }),
  UserRole: ({ tenantId }) => ({
    user: { tenantId },
    role: { tenantId },
  }),
  Customer: ({ tenantId }) => ({ tenantId }),
  CustomerAddress: ({ tenantId }) => ({ customer: { tenantId } }),
  Category: ({ tenantId }) => ({ tenantId }),
  Product: ({ tenantId }) => ({ tenantId }),
  ProductUnit: ({ tenantId, unitId }) => ({
    unitId,
    product: { tenantId },
  }),
  ProductVariant: ({ tenantId }) => ({ product: { tenantId } }),
  Addon: ({ tenantId }) => ({ tenantId }),
  ProductAddon: ({ tenantId }) => ({
    product: { tenantId },
    addon: { tenantId },
  }),
  RestaurantTable: ({ unitId }) => ({ unitId }),
  OrderTable: ({ tenantId, unitId }) => ({
    order: { tenantId, unitId },
    table: { unitId },
  }),
  Order: ({ tenantId, unitId }) => ({ tenantId, unitId }),
  OrderItem: ({ tenantId, unitId }) => ({
    order: { tenantId, unitId },
  }),
  OrderItemOption: ({ tenantId, unitId }) => ({
    orderItem: { order: { tenantId, unitId } },
  }),
  Payment: ({ tenantId, unitId }) => ({ order: { tenantId, unitId } }),
  OrderSplit: ({ tenantId, unitId }) => ({ order: { tenantId, unitId } }),
  OrderSplitItem: ({ tenantId, unitId }) => ({
    split: { order: { tenantId, unitId } },
    orderItem: { order: { tenantId, unitId } },
  }),
  CashRegister: ({ unitId }) => ({ unitId }),
  CashSession: ({ tenantId, unitId }) => ({
    cashRegister: { unitId },
    user: { tenantId },
  }),
  CashMovement: ({ tenantId, unitId }) => ({
    cashSession: { cashRegister: { unitId }, user: { tenantId } },
  }),
  Delivery: ({ tenantId, unitId }) => ({
    unitId,
    order: { tenantId, unitId },
  }),
  DeliveryDriver: ({ tenantId }) => ({ tenantId }),
  DeliveryZone: ({ unitId }) => ({ unitId }),
  Inventory: ({ tenantId, unitId }) => ({
    unitId,
    product: { tenantId },
  }),
  InventoryMovement: ({ tenantId, unitId }) => ({
    unitId,
    product: { tenantId },
  }),
  Recipe: ({ tenantId }) => ({ product: { tenantId } }),
  RecipeItem: ({ tenantId }) => ({
    recipe: { product: { tenantId } },
    ingredientProduct: { tenantId },
  }),
  Supplier: ({ tenantId }) => ({ tenantId }),
  Purchase: ({ tenantId, unitId }) => ({ tenantId, unitId }),
  PurchaseItem: ({ tenantId, unitId }) => ({
    purchase: { tenantId, unitId },
  }),
  KitchenTicket: ({ tenantId, unitId }) => ({
    unitId,
    order: { tenantId, unitId },
  }),
  KitchenTicketItem: ({ tenantId, unitId }) => ({
    kitchenTicket: { unitId, order: { tenantId, unitId } },
  }),
  Cancellation: ({ tenantId, unitId }) => ({ tenantId, unitId }),
  AuditLog: ({ tenantId, unitId }) => ({ tenantId, unitId }),
  Notification: ({ tenantId }) => ({ tenantId }),
  RefreshToken: ({ tenantId }) => ({ tenantId }),
};

type CreatePolicy = {
  tenantField?: 'id' | 'tenantId';
  unitField?: 'unitId';
};

const createPolicies: Record<string, CreatePolicy> = {
  Tenant: { tenantField: 'id' },
  Unit: { tenantField: 'tenantId' },
  User: { tenantField: 'tenantId' },
  Role: { tenantField: 'tenantId' },
  Customer: { tenantField: 'tenantId' },
  Category: { tenantField: 'tenantId' },
  Product: { tenantField: 'tenantId' },
  ProductUnit: { unitField: 'unitId' },
  ProductVariant: {},
  Addon: { tenantField: 'tenantId' },
  ProductAddon: {},
  Recipe: {},
  RecipeItem: {},
  RestaurantTable: { unitField: 'unitId' },
  Order: { tenantField: 'tenantId', unitField: 'unitId' },
  CashRegister: { unitField: 'unitId' },
  Delivery: { unitField: 'unitId' },
  DeliveryDriver: { tenantField: 'tenantId' },
  DeliveryZone: { unitField: 'unitId' },
  Inventory: { unitField: 'unitId' },
  InventoryMovement: { unitField: 'unitId' },
  Supplier: { tenantField: 'tenantId' },
  Purchase: { tenantField: 'tenantId', unitField: 'unitId' },
  KitchenTicket: { unitField: 'unitId' },
  Cancellation: { tenantField: 'tenantId', unitField: 'unitId' },
  AuditLog: { tenantField: 'tenantId', unitField: 'unitId' },
  Notification: { tenantField: 'tenantId' },
  RefreshToken: { tenantField: 'tenantId' },
};

function scopedCreateData(
  model: string,
  data: unknown,
  context: TenantContext,
): Record<string, unknown> {
  const policy = createPolicies[model];
  if (!policy) {
    throw new Error(`Direct create is not supported for scoped model ${model}`);
  }

  const record = data as Record<string, unknown>;
  const scopedData = { ...record };
  const expectedValues: Record<string, string> = {};

  if (policy.tenantField) {
    expectedValues[policy.tenantField] = context.tenantId;
  }
  if (policy.unitField) {
    expectedValues[policy.unitField] = context.unitId;
  }

  for (const [field, expectedValue] of Object.entries(expectedValues)) {
    if (scopedData[field] !== undefined && scopedData[field] !== expectedValue) {
      throw new Error(`Tenant scope mismatch for ${model}.${field}`);
    }
    scopedData[field] = expectedValue;
  }

  return scopedData;
}

function addScopeToWhere(
  args: unknown,
  scope: Record<string, unknown>,
): Record<string, unknown> {
  const scopedArgs = { ...(args as Record<string, unknown>) };
  const where = (scopedArgs.where ?? {}) as Record<string, unknown>;
  const existingAnd = Array.isArray(where.AND) ? where.AND : [];
  scopedArgs.where = { ...where, AND: [...existingAnd, scope] };
  return scopedArgs;
}

function addScopeToData(
  args: unknown,
  model: string,
  context: TenantContext,
  operation: string,
): Record<string, unknown> {
  const scopedArgs = { ...(args as Record<string, unknown>) };
  const apply = (data: unknown) => scopedCreateData(model, data, context);

  if (operation === 'createMany') {
    scopedArgs.data = Array.isArray(scopedArgs.data)
      ? scopedArgs.data.map(apply)
      : apply(scopedArgs.data);
    return scopedArgs;
  }

  if (operation === 'upsert') {
    scopedArgs.create = apply(scopedArgs.create);
    if (createPolicies[model]) {
      scopedArgs.update = apply(scopedArgs.update);
    }
    return scopedArgs;
  }

  scopedArgs.data = apply(scopedArgs.data);
  return scopedArgs;
}

export const tenantPrismaExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (operation === 'delete' || operation === 'deleteMany') {
          throw new Error('Physical deletion is not allowed');
        }

        const context = getTenantContext();
        if (!context) {
          throw new Error('Tenant context is required for database operations');
        }

        const scopeBuilder = scopeBuilders[model];
        if (!scopeBuilder) {
          throw new Error(`No tenant scope is defined for model ${model}`);
        }

        const scope = scopeBuilder(context);
        let scopedArgs: unknown = args;

        if (operation === 'create' || operation === 'createMany') {
          scopedArgs = addScopeToData(args, model, context, operation);
        } else if (operation === 'upsert') {
          scopedArgs = addScopeToWhere(args, scope);
          scopedArgs = addScopeToData(scopedArgs, model, context, operation);
        } else if (operation === 'update' || operation === 'updateMany') {
          scopedArgs = addScopeToWhere(args, scope);
          if (createPolicies[model]) {
            scopedArgs = addScopeToData(scopedArgs, model, context, operation);
          }
        } else if (Object.keys(scope).length > 0) {
          scopedArgs = addScopeToWhere(args, scope);
        }

        return query(scopedArgs as typeof args);
      },
    },
  },
});

export function createTenantPrismaClient(client: PrismaClient) {
  return client.$extends(tenantPrismaExtension);
}

export type TenantPrismaClient = ReturnType<typeof createTenantPrismaClient>;