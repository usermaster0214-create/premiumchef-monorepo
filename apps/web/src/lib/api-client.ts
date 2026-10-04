export type StoredSession = {
  access_token: string;
  refresh_token: string;
  user: {
    id?: string;
    name: string;
    tenant_id: string;
    units: string[];
    roles: string[];
    permissions: string[];
    platform_admin?: boolean;
  };
};

const SESSION_KEY = 'premiumchef.session';

export const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

export function loadSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function messageFrom(body: unknown): string {
  const message = (body as { message?: string | string[] } | null)?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? 'Não foi possível concluir a operação.';
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, unitId?: string): Promise<T> {
  let session = loadSession();
  if (!session) throw new Error('Faça login para continuar.');

  const send = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Tenant-ID', session!.user.tenant_id);
    headers.set('X-Unit-ID', unitId ?? session!.user.units[0] ?? '');
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return fetch(`${apiBase}${path}`, { ...init, headers });
  };

  let response = await send(session.access_token);
  if (response.status === 401 && session.refresh_token) {
    const refreshed = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!refreshed.ok) {
      window.sessionStorage.removeItem(SESSION_KEY);
      throw new Error('Sua sessão expirou. Entre novamente pelo painel.');
    }
    session = { ...session, ...(await refreshed.json()) } as StoredSession;
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    response = await send(session.access_token);
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(messageFrom(body));
  return body as T;
}

export function money(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
}

export function dateTime(value: string | null | undefined): string {
  return value
    ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';
}
