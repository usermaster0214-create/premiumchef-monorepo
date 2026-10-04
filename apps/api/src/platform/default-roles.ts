export const ALL_PERMISSIONS = [
  'products.read', 'products.create', 'products.update',
  'orders.read', 'orders.create', 'orders.update', 'orders.pay',
  'cash.read', 'cash.open', 'cash.close', 'cash.movement',
  'tables.read', 'tables.create', 'tables.update',
  'kitchen.view', 'kitchen.update',
  'delivery.read', 'delivery.assign', 'delivery.update',
  'delivery.drivers.read', 'delivery.drivers.create', 'delivery.drivers.update',
  'inventory.read', 'inventory.adjust', 'purchases.read', 'purchases.create',
  'reports.view',
  'users.read', 'users.create', 'users.update',
] as const;

export interface DefaultRole {
  name: string;
  description: string;
  permissions: readonly string[];
}

export const DEFAULT_ROLES: readonly DefaultRole[] = [
  { name: 'ADMIN', description: 'Administrador da empresa', permissions: ALL_PERMISSIONS },
  {
    name: 'GERENTE',
    description: 'Gerente de operação',
    permissions: ALL_PERMISSIONS.filter((permission) => !['users.create', 'users.update'].includes(permission)),
  },
  {
    name: 'CAIXA',
    description: 'Operador de caixa',
    permissions: [
      'products.read', 'orders.read', 'orders.create', 'orders.update', 'orders.pay',
      'cash.read', 'cash.open', 'cash.close', 'cash.movement', 'tables.read',
    ],
  },
  {
    name: 'GARCOM',
    description: 'Garçom',
    permissions: ['products.read', 'orders.read', 'orders.create', 'orders.update', 'tables.read', 'tables.update'],
  },
  {
    name: 'ATENDENTE',
    description: 'Atendente de balcão',
    permissions: ['products.read', 'orders.read', 'orders.create', 'orders.update', 'tables.read'],
  },
  { name: 'COZINHA', description: 'Cozinha / KDS', permissions: ['kitchen.view', 'kitchen.update'] },
  { name: 'ENTREGADOR', description: 'Entregador', permissions: ['delivery.read', 'delivery.update'] },
];
