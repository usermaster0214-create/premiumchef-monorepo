export interface AuthPrincipal {
  sub: string;
  name: string;
  email: string;
  tenant_id: string;
  units: string[];
  roles: string[];
  permissions: string[];
  token_type: 'access';
  unit_id?: string;
}

export interface RefreshTokenClaims {
  sub: string;
  tenant_id: string;
  token_type: 'refresh';
  jti: string;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthPrincipal;
}