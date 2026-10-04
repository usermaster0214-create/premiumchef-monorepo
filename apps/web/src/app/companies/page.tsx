'use client';

import { FormEvent, useEffect, useState } from 'react';

type Session = {
  access_token: string;
  user: { tenant_id: string; units: string[]; name: string; platform_admin?: boolean };
};

type TenantStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

type Company = {
  id: string;
  name: string;
  legalName?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  status: TenantStatus;
  createdAt: string;
  _count: { units: number; users: number };
};

const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

const statusLabel: Record<TenantStatus, string> = {
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  INACTIVE: 'Inativa',
};

const emptyForm = {
  name: '', legalName: '', document: '', email: '', phone: '', unitName: '',
  adminName: '', adminEmail: '', adminPassword: '',
};

export default function CompaniesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const saved = window.sessionStorage.getItem('premiumchef.session');
    if (!saved) return;
    try {
      setSession(JSON.parse(saved) as Session);
    } catch {
      window.sessionStorage.removeItem('premiumchef.session');
    }
  }, []);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!session) throw new Error('Faça login para continuar.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    headers.set('X-Tenant-ID', session.user.tenant_id);
    headers.set('X-Unit-ID', session.user.units[0] ?? '');
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}${path}`, { ...init, headers });
    const body = await response.json().catch(() => null);
    if (response.status === 401) throw new Error('Sessão expirada. Entre novamente pelo painel.');
    if (!response.ok) {
      throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message ?? 'Não foi possível concluir a operação.');
    }
    return body as T;
  }

  async function loadCompanies() {
    try {
      setCompanies(await request<Company[]>('/platform/tenants'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar empresas.');
    }
  }

  useEffect(() => {
    if (session?.user.platform_admin) void loadCompanies();
  }, [session?.access_token]);

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await request<{ name: string; admin: { email: string } }>('/platform/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          legal_name: form.legalName.trim() || undefined,
          document: form.document.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          unit_name: form.unitName.trim() || undefined,
          admin_name: form.adminName.trim(),
          admin_email: form.adminEmail.trim(),
          admin_password: form.adminPassword,
        }),
      });
      setCreating(false);
      setForm(emptyForm);
      setNotice(`Empresa ${created.name} criada. Administrador: ${created.admin.email}.`);
      await loadCompanies();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Falha ao criar empresa.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(company: Company, status: TenantStatus) {
    const action = status === 'ACTIVE' ? 'reativar' : 'suspender';
    if (!window.confirm(`Deseja ${action} a empresa ${company.name}?`)) return;
    setError('');
    setNotice('');
    try {
      await request(`/platform/tenants/${company.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice(`Empresa ${company.name}: ${statusLabel[status].toLowerCase()}.`);
      await loadCompanies();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Falha ao atualizar a empresa.');
    }
  }

  if (!session) {
    return <main className="login-main"><div className="login-card"><span className="eyebrow">Plataforma</span><h2>Entre para gerenciar empresas</h2><p>Use a conta de administrador da plataforma.</p><a className="primary-button" href="/">Voltar para o login</a></div></main>;
  }

  if (!session.user.platform_admin) {
    return <main className="login-main"><div className="login-card"><span className="eyebrow">Acesso restrito</span><h2>Somente o administrador da plataforma</h2><p>O cadastro de novas empresas não está disponível para esta conta.</p><a className="primary-button" href="/">Voltar ao painel</a></div></main>;
  }

  return (
    <main className="tables-shell">
      <header className="pos-header">
        <div><span className="eyebrow">Plataforma</span><h1>Empresas</h1><p className="heading-copy">Cadastre restaurantes e acompanhe o status de cada empresa.</p></div>
        <div className="pos-header-actions">
          <button className="primary-button" onClick={() => { setCreating(true); setError(''); }} type="button">＋ Nova empresa</button>
          <a className="secondary-button" href="/">Painel</a>
        </div>
      </header>
      {error && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="pos-success" role="status">{notice}</div>}
      <div className="table-frame companies-table">
        <table>
          <thead><tr><th>Empresa</th><th>Documento</th><th>Unidades</th><th>Usuários</th><th>Status</th><th aria-label="Ações" /></tr></thead>
          <tbody>
            {companies.map((company) => {
              const isOwnCompany = company.id === session.user.tenant_id;
              return <tr key={company.id}>
                <td><div className="product-name">{company.name}</div><div className="product-detail">{company.legalName || company.email || '—'}</div></td>
                <td>{company.document || '—'}</td>
                <td>{company._count.units}</td>
                <td>{company._count.users}</td>
                <td><span className={`status-label ${company.status !== 'ACTIVE' ? 'inactive' : ''}`}>{statusLabel[company.status]}</span></td>
                <td>{isOwnCompany ? <span className="product-detail">Sua empresa</span> : company.status === 'ACTIVE'
                  ? <button className="table-delete-button" onClick={() => void changeStatus(company, 'SUSPENDED')} type="button">Suspender</button>
                  : <button className="secondary-button" onClick={() => void changeStatus(company, 'ACTIVE')} type="button">Reativar</button>}</td>
              </tr>;
            })}
          </tbody>
        </table>
        {!companies.length && <div className="empty-state"><strong>Nenhuma empresa cadastrada</strong>Use “Nova empresa” para começar.</div>}
      </div>
      {creating && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCreating(false); }}>
        <section aria-labelledby="new-company-title" aria-modal="true" className="modal" role="dialog">
          <header className="modal-header"><div><h2 id="new-company-title">Nova empresa</h2><p>Cria a empresa, a primeira unidade e o administrador com acesso inicial.</p></div><button aria-label="Fechar" className="icon-button" disabled={busy} onClick={() => setCreating(false)} type="button">×</button></header>
          <form onSubmit={createCompany}>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field full"><label htmlFor="company-name">Nome da empresa</label><input autoFocus id="company-name" maxLength={120} minLength={2} required value={form.name} onChange={(event) => updateField('name', event.target.value)} /></div>
                <div className="field"><label htmlFor="company-legal">Razão social</label><input id="company-legal" maxLength={160} value={form.legalName} onChange={(event) => updateField('legalName', event.target.value)} /></div>
                <div className="field"><label htmlFor="company-document">CNPJ/CPF</label><input id="company-document" inputMode="numeric" maxLength={18} value={form.document} onChange={(event) => updateField('document', event.target.value)} /></div>
                <div className="field"><label htmlFor="company-email">E-mail da empresa</label><input id="company-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} /></div>
                <div className="field"><label htmlFor="company-phone">Telefone</label><input id="company-phone" maxLength={30} value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></div>
                <div className="field full"><label htmlFor="company-unit">Primeira unidade</label><input id="company-unit" maxLength={120} placeholder="Unidade Principal" value={form.unitName} onChange={(event) => updateField('unitName', event.target.value)} /></div>
                <div className="field full"><label htmlFor="admin-name">Administrador</label><input id="admin-name" maxLength={120} minLength={2} required value={form.adminName} onChange={(event) => updateField('adminName', event.target.value)} /></div>
                <div className="field"><label htmlFor="admin-email">E-mail de acesso</label><input autoComplete="off" id="admin-email" required type="email" value={form.adminEmail} onChange={(event) => updateField('adminEmail', event.target.value)} /></div>
                <div className="field"><label htmlFor="admin-password">Senha inicial</label><input autoComplete="new-password" id="admin-password" maxLength={128} minLength={12} required type="password" value={form.adminPassword} onChange={(event) => updateField('adminPassword', event.target.value)} /><span className="field-note">Mínimo de 12 caracteres.</span></div>
              </div>
            </div>
            <footer className="modal-footer"><button className="secondary-button" disabled={busy} onClick={() => setCreating(false)} type="button">Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Criando...' : 'Criar empresa'}</button></footer>
          </form>
        </section>
      </div>}
    </main>
  );
}
