'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, dateTime, loadSession, StoredSession } from '../../lib/api-client';

type RoleRef = { id: string; name: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  isPlatformAdmin: boolean;
  lastLoginAt?: string | null;
  roles: RoleRef[];
  unit_ids: string[];
};
type RoleRow = { id: string; name: string; description?: string | null; permissions: string[]; user_count: number };
type UnitRow = { id: string; name: string };

type UserForm = {
  id?: string; name: string; email: string; phone: string; password: string;
  status: 'ACTIVE' | 'INACTIVE'; roleIds: string[]; unitIds: string[];
};
type RoleForm = { id?: string; name: string; description: string; permissions: string[] };

const permissionGroups: { title: string; items: [string, string][] }[] = [
  { title: 'Produtos', items: [['products.read', 'Ver produtos'], ['products.create', 'Cadastrar produtos'], ['products.update', 'Editar produtos']] },
  { title: 'Pedidos e PDV', items: [['orders.read', 'Ver vendas'], ['orders.create', 'Lançar pedidos'], ['orders.update', 'Alterar pedidos'], ['orders.pay', 'Receber pagamentos']] },
  { title: 'Caixa', items: [['cash.read', 'Ver caixa'], ['cash.open', 'Abrir caixa'], ['cash.movement', 'Suprimento e sangria'], ['cash.close', 'Fechar caixa']] },
  { title: 'Mesas', items: [['tables.read', 'Ver mesas'], ['tables.create', 'Criar mesas'], ['tables.update', 'Editar mesas']] },
  { title: 'Cozinha', items: [['kitchen.view', 'Ver KDS'], ['kitchen.update', 'Atualizar tickets']] },
  { title: 'Entregas', items: [['delivery.read', 'Ver entregas'], ['delivery.assign', 'Atribuir entregador'], ['delivery.update', 'Atualizar entregas'], ['delivery.drivers.read', 'Ver entregadores'], ['delivery.drivers.create', 'Cadastrar entregadores'], ['delivery.drivers.update', 'Editar entregadores']] },
  { title: 'Estoque e compras', items: [['inventory.read', 'Ver estoque'], ['inventory.adjust', 'Ajustar estoque'], ['purchases.read', 'Ver compras'], ['purchases.create', 'Registrar compras']] },
  { title: 'Relatórios', items: [['reports.view', 'Ver relatórios']] },
  { title: 'Usuários e perfis', items: [['users.read', 'Ver usuários'], ['users.create', 'Cadastrar usuários e perfis'], ['users.update', 'Editar usuários e perfis']] },
];

const statusLabel = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', SUSPENDED: 'Suspenso' } as const;
const emptyUser: UserForm = { name: '', email: '', phone: '', password: '', status: 'ACTIVE', roleIds: [], unitIds: [] };
const emptyRole: RoleForm = { name: '', description: '', permissions: [] };

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function UsersPage() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [userForm, setUserForm] = useState<UserForm | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const held = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canRead = held.has('users.read');
  const canCreate = held.has('users.create');
  const canUpdate = held.has('users.update');
  const selfId = session?.user.id;

  const load = useCallback(async () => {
    if (!session || !held.has('users.read')) return;
    try {
      const [nextUsers, nextRoles, nextUnits] = await Promise.all([
        apiFetch<UserRow[]>('/users'),
        apiFetch<RoleRow[]>('/roles'),
        apiFetch<UnitRow[]>('/users/units'),
      ]);
      setUsers(nextUsers);
      setRoles(nextRoles);
      setUnits(nextUnits);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar usuários.');
    }
  }, [session, held]);

  useEffect(() => { void load(); }, [load]);

  const roleWithinReach = (role: RoleRow) => role.permissions.every((permission) => held.has(permission));

  async function submit(action: () => Promise<void>, success: string, close: () => void) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      close();
      setNotice(success);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }

  function saveUser(event: FormEvent) {
    event.preventDefault();
    if (!userForm) return;
    const form = userForm;
    const editingSelf = form.id !== undefined && form.id === selfId;
    void submit(async () => {
      if (form.id) {
        await apiFetch(`/users/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            ...(form.password ? { password: form.password } : {}),
            ...(editingSelf ? {} : { status: form.status, role_ids: form.roleIds, unit_ids: form.unitIds }),
          }),
        });
      } else {
        await apiFetch('/users', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || undefined,
            password: form.password,
            role_ids: form.roleIds,
            unit_ids: form.unitIds,
          }),
        });
      }
    }, form.id ? 'Usuário atualizado.' : 'Usuário cadastrado.', () => setUserForm(null));
  }

  function saveRole(event: FormEvent) {
    event.preventDefault();
    if (!roleForm) return;
    const form = roleForm;
    void submit(async () => {
      const body = JSON.stringify({ name: form.name.trim(), description: form.description.trim() || undefined, permissions: form.permissions });
      await apiFetch(form.id ? `/roles/${form.id}` : '/roles', { method: form.id ? 'PATCH' : 'POST', body });
    }, form.id ? 'Perfil atualizado.' : 'Perfil criado.', () => setRoleForm(null));
  }

  function editUser(user: UserRow) {
    setError('');
    setUserForm({
      id: user.id, name: user.name, email: user.email, phone: user.phone ?? '', password: '',
      status: user.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      roleIds: user.roles.map((role) => role.id), unitIds: user.unit_ids,
    });
  }

  if (!ready) return null;

  if (!session) {
    return <main className="login-main"><div className="login-card"><span className="eyebrow">Administração</span><h2>Entre para gerenciar usuários</h2><p>Use uma conta com permissão de administração.</p><a className="primary-button" href="/">Voltar para o login</a></div></main>;
  }

  if (!canRead) {
    return <main className="login-main"><div className="login-card"><span className="eyebrow">Acesso restrito</span><h2>Sem permissão</h2><p>Seu perfil não pode consultar usuários e perfis.</p><a className="primary-button" href="/">Voltar ao painel</a></div></main>;
  }

  const editingSelf = userForm?.id !== undefined && userForm.id === selfId;
  const roleLocked = roleForm?.name === 'ADMIN';

  return (
    <main className="tables-shell">
      <header className="pos-header">
        <div><span className="eyebrow">Administração</span><h1>Usuários e perfis</h1><p className="heading-copy">Cadastre a equipe e defina o que cada perfil pode fazer.</p></div>
        <div className="pos-header-actions">
          {tab === 'users' && canCreate && <button className="primary-button" onClick={() => { setError(''); setUserForm({ ...emptyUser, unitIds: units.length === 1 ? [units[0].id] : [] }); }} type="button">＋ Novo usuário</button>}
          {tab === 'roles' && canCreate && <button className="primary-button" onClick={() => { setError(''); setRoleForm(emptyRole); }} type="button">＋ Novo perfil</button>}
          <a className="secondary-button" href="/">Painel</a>
        </div>
      </header>
      {error && !userForm && !roleForm && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="pos-success" role="status">{notice}</div>}

      <div className="page-wrap">
        <div className="tabs page-tabs" role="tablist" aria-label="Seções">
          <button aria-selected={tab === 'users'} className={`tab-button ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')} role="tab" type="button">Usuários</button>
          <button aria-selected={tab === 'roles'} className={`tab-button ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')} role="tab" type="button">Perfis e permissões</button>
        </div>

        {tab === 'users' && <div className="table-frame">
          <table>
            <thead><tr><th>Usuário</th><th>Perfis</th><th>Unidades</th><th>Último acesso</th><th>Status</th><th aria-label="Ações" /></tr></thead>
            <tbody>
              {users.map((user) => <tr key={user.id}>
                <td><div className="product-name">{user.name}</div><div className="product-detail">{user.email}</div></td>
                <td>{user.roles.map((role) => <span className="chip" key={role.id}>{role.name}</span>)}</td>
                <td>{user.unit_ids.map((id) => units.find((unit) => unit.id === id)?.name ?? '—').join(', ')}</td>
                <td>{dateTime(user.lastLoginAt)}</td>
                <td><span className={`status-label ${user.status !== 'ACTIVE' ? 'inactive' : ''}`}>{statusLabel[user.status]}</span></td>
                <td>{canUpdate && (!user.isPlatformAdmin || user.id === selfId) ? <button aria-label={`Editar ${user.name}`} className="icon-button" onClick={() => editUser(user)} title="Editar" type="button">✎</button> : user.isPlatformAdmin ? <span className="product-detail">Plataforma</span> : null}</td>
              </tr>)}
            </tbody>
          </table>
          {!users.length && <div className="empty-state"><strong>Nenhum usuário</strong>Cadastre garçons, caixas, gerentes e demais perfis.</div>}
        </div>}

        {tab === 'roles' && <div className="role-grid">
          {roles.map((role) => {
            const reachable = roleWithinReach(role);
            return <article className="role-card" key={role.id}>
              <div className="table-card-top"><h2>{role.name}</h2><span className="table-status">{role.user_count} usuário(s)</span></div>
              <p>{role.description || 'Sem descrição'}</p>
              <div className="role-perms">{role.permissions.length} permissões</div>
              <div className="table-card-actions">
                <button className="secondary-button" onClick={() => { setError(''); setRoleForm({ id: role.id, name: role.name, description: role.description ?? '', permissions: role.permissions }); }} type="button">{role.name === 'ADMIN' || !canUpdate || !reachable ? 'Ver permissões' : 'Editar'}</button>
              </div>
            </article>;
          })}
        </div>}
      </div>

      {userForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setUserForm(null); }}>
        <section aria-labelledby="user-title" aria-modal="true" className="modal" role="dialog">
          <header className="modal-header"><div><h2 id="user-title">{userForm.id ? 'Editar usuário' : 'Novo usuário'}</h2><p>Defina os dados de acesso, os perfis e as unidades.</p></div><button aria-label="Fechar" className="icon-button" disabled={busy} onClick={() => setUserForm(null)} type="button">×</button></header>
          <form onSubmit={saveUser}>
            <div className="modal-body">
              {error && <div className="notice" role="alert">{error}</div>}
              <div className="form-grid">
                <div className="field full"><label htmlFor="user-name">Nome</label><input autoFocus id="user-name" maxLength={120} minLength={2} required value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} /></div>
                <div className="field"><label htmlFor="user-email">E-mail</label><input autoComplete="off" disabled={Boolean(userForm.id)} id="user-email" required type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} /></div>
                <div className="field"><label htmlFor="user-phone">Telefone</label><input id="user-phone" maxLength={30} value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} /></div>
                <div className="field"><label htmlFor="user-password">{userForm.id ? 'Nova senha' : 'Senha inicial'}</label><input autoComplete="new-password" id="user-password" maxLength={128} minLength={10} required={!userForm.id} type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} /><span className="field-note">{userForm.id ? 'Deixe em branco para manter. ' : ''}Mínimo de 10 caracteres.</span></div>
                {userForm.id && !editingSelf && <div className="field"><label htmlFor="user-status">Status</label><select id="user-status" value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value as 'ACTIVE' | 'INACTIVE' })}><option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select></div>}
                {!editingSelf && <>
                  <div className="field full"><label>Perfis</label><div className="check-list">{roles.map((role) => { const reachable = roleWithinReach(role); return <label className="check-option" key={role.id} title={reachable ? undefined : 'Este perfil tem permissões que você não possui'}><input checked={userForm.roleIds.includes(role.id)} disabled={!reachable} onChange={() => setUserForm({ ...userForm, roleIds: toggle(userForm.roleIds, role.id) })} type="checkbox" />{role.name}</label>; })}</div></div>
                  <div className="field full"><label>Unidades</label><div className="check-list">{units.map((unit) => <label className="check-option" key={unit.id}><input checked={userForm.unitIds.includes(unit.id)} onChange={() => setUserForm({ ...userForm, unitIds: toggle(userForm.unitIds, unit.id) })} type="checkbox" />{unit.name}</label>)}</div></div>
                </>}
                {editingSelf && <p className="field-note full">Você não pode alterar seu próprio status, perfis ou unidades.</p>}
              </div>
            </div>
            <footer className="modal-footer"><button className="secondary-button" disabled={busy} onClick={() => setUserForm(null)} type="button">Cancelar</button><button className="primary-button" disabled={busy || (!editingSelf && (!userForm.roleIds.length || !userForm.unitIds.length))} type="submit">{busy ? 'Salvando...' : 'Salvar'}</button></footer>
          </form>
        </section>
      </div>}

      {roleForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRoleForm(null); }}>
        <section aria-labelledby="role-title" aria-modal="true" className="modal" role="dialog">
          <header className="modal-header"><div><h2 id="role-title">{roleForm.id ? (roleLocked ? 'Perfil ADMIN' : 'Editar perfil') : 'Novo perfil'}</h2><p>{roleLocked ? 'O perfil ADMIN é protegido e não pode ser alterado.' : 'Marque o que este perfil pode fazer.'}</p></div><button aria-label="Fechar" className="icon-button" disabled={busy} onClick={() => setRoleForm(null)} type="button">×</button></header>
          <form onSubmit={saveRole}>
            <div className="modal-body">
              {error && <div className="notice" role="alert">{error}</div>}
              <div className="form-grid">
                <div className="field"><label htmlFor="role-name">Nome do perfil</label><input autoFocus disabled={roleLocked} id="role-name" maxLength={60} minLength={2} required value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} /></div>
                <div className="field"><label htmlFor="role-description">Descrição</label><input disabled={roleLocked} id="role-description" maxLength={200} value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} /></div>
              </div>
              <div className="perm-groups">
                {permissionGroups.map((group) => <div className="perm-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <div className="perm-options">{group.items.map(([key, label]) => <label className="check-option" key={key} title={held.has(key) ? undefined : 'Você não possui esta permissão'}><input checked={roleForm.permissions.includes(key)} disabled={roleLocked || !held.has(key)} onChange={() => setRoleForm({ ...roleForm, permissions: toggle(roleForm.permissions, key) })} type="checkbox" />{label}</label>)}</div>
                </div>)}
              </div>
            </div>
            <footer className="modal-footer"><button className="secondary-button" disabled={busy} onClick={() => setRoleForm(null)} type="button">{roleLocked ? 'Fechar' : 'Cancelar'}</button>{!roleLocked && (roleForm.id ? canUpdate : canCreate) && <button className="primary-button" disabled={busy || !roleForm.permissions.length} type="submit">{busy ? 'Salvando...' : 'Salvar perfil'}</button>}</footer>
          </form>
        </section>
      </div>}
    </main>
  );
}
