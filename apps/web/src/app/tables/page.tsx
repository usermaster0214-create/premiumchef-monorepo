'use client';

import { FormEvent, useEffect, useState } from 'react';

type Session = {
  access_token: string;
  user: { tenant_id: string; units: string[]; name: string };
};

type RestaurantTable = {
  id: string;
  number: number;
  name?: string | null;
  capacity?: number | null;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'BLOCKED';
  isActive: boolean;
  orderTables: { order: { id: string; orderNumber: number; status: string; total: string | number } }[];
};

const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

const statusLabel: Record<RestaurantTable['status'], string> = {
  AVAILABLE: 'Livre',
  OCCUPIED: 'Ocupada',
  RESERVED: 'Reservada',
  BLOCKED: 'Bloqueada',
};

export default function TablesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [unitId, setUnitId] = useState('');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [archivedView, setArchivedView] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [editName, setEditName] = useState('');
  const [editCapacity, setEditCapacity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const saved = window.sessionStorage.getItem('premiumchef.session');
    if (!saved) return;
    try {
      const restored = JSON.parse(saved) as Session;
      setSession(restored);
      setUnitId(restored.user.units[0] ?? '');
    } catch {
      window.sessionStorage.removeItem('premiumchef.session');
    }
  }, []);

  async function request(path: string, init: RequestInit = {}) {
    if (!session) throw new Error('Faça login para continuar.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    headers.set('X-Tenant-ID', session.user.tenant_id);
    headers.set('X-Unit-ID', unitId);
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}${path}`, { ...init, headers });
    if (response.status === 204) return undefined;
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = Array.isArray(body?.message)
        ? body.message.join(', ')
        : body?.message ?? 'Não foi possível atualizar o mapa de mesas.';
      throw new Error(message);
    }
    return body;
  }

  async function loadTables() {
    if (!session || !unitId) return;
    try {
      setTables((await request(`/tables?archived=${archivedView}`)) as RestaurantTable[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar mesas.');
    }
  }

  useEffect(() => {
    if (session && unitId) void loadTables();
  }, [session?.access_token, unitId, archivedView]);

  async function createTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/tables', {
        method: 'POST',
        body: JSON.stringify({ number: Number(number), capacity: Number(capacity) }),
      });
      setNumber('');
      setNotice('Mesa criada.');
      await loadTables();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Falha ao criar mesa.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(table: RestaurantTable, status: RestaurantTable['status']) {
    setError('');
    try {
      await request(`/tables/${table.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice(`Mesa ${table.number}: ${statusLabel[status]}.`);
      await loadTables();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Falha ao atualizar mesa.');
    }
  }

  function openEditor(table: RestaurantTable) {
    setEditingTable(table);
    setEditName(table.name ?? '');
    setEditCapacity(String(table.capacity ?? 2));
  }

  async function saveTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTable) return;
    setBusy(true);
    setError('');
    try {
      await request(`/tables/${editingTable.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          capacity: Number(editCapacity),
        }),
      });
      setEditingTable(null);
      setNotice(`Mesa ${editingTable.number} atualizada.`);
      await loadTables();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao atualizar mesa.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveTable(table: RestaurantTable) {
    const confirmed = window.confirm(
      `Excluir a Mesa ${table.number} do mapa? O histórico será preservado e poderá ser restaurado em Arquivadas.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await request(`/tables/${table.id}/archive`, { method: 'PATCH' });
      setNotice(`Mesa ${table.number} arquivada.`);
      await loadTables();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Falha ao excluir mesa.');
    } finally {
      setBusy(false);
    }
  }

  async function restoreTable(table: RestaurantTable) {
    setBusy(true);
    setError('');
    try {
      await request(`/tables/${table.id}/restore`, { method: 'PATCH' });
      setNotice(`Mesa ${table.number} restaurada.`);
      await loadTables();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Falha ao restaurar mesa.');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return <main className="login-main"><div className="login-card"><span className="eyebrow">Salão</span><h2>Entre para ver as mesas</h2><p>O mapa usa a mesma sessão segura do painel.</p><a className="primary-button" href="/">Voltar para o login</a></div></main>;
  }

  return (
    <main className="tables-shell">
      <header className="pos-header"><div><span className="eyebrow">Salão e comandas</span><h1>Mapa de mesas</h1><p className="heading-copy">Status em tempo real da unidade selecionada.</p></div><div className="pos-header-actions"><label className="unit-picker"><span>Unidade</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{session.user.units.map((id, index) => <option key={id} value={id}>Unidade {index + 1}</option>)}</select></label><a className="secondary-button" href="/pos">PDV</a></div></header>
      {error && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="pos-success" role="status">{notice}</div>}
      <section className="tables-toolbar">
        {!archivedView && <form className="table-create-form" onSubmit={createTable}>
          <input aria-label="Número da mesa" min="1" placeholder="Mesa nº" type="number" value={number} onChange={(event) => setNumber(event.target.value)} required />
          <input aria-label="Lugares" min="1" max="100" placeholder="Lugares" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} required />
          <button className="primary-button" disabled={busy} type="submit">＋ Nova mesa</button>
        </form>}
        <div className="table-view-switch" role="group" aria-label="Visualização das mesas">
          <button className={!archivedView ? 'active' : ''} onClick={() => setArchivedView(false)} type="button">Ativas</button>
          <button className={archivedView ? 'active' : ''} onClick={() => setArchivedView(true)} type="button">Arquivadas</button>
        </div>
        <span className="pos-count">{tables.length} {archivedView ? 'mesas arquivadas' : 'mesas cadastradas'}</span>
      </section>
      <section className="tables-grid">
        {tables.map((table) => <article className={`table-card ${archivedView ? 'table-archived' : `table-${table.status.toLowerCase()}`}`} key={table.id}>
          <div className="table-card-top"><span className="table-number">{table.number}</span><span className="table-status">{archivedView ? 'Arquivada' : statusLabel[table.status]}</span></div>
          <h2>{table.name || `Mesa ${table.number}`}</h2><p>{table.capacity ?? '-'} lugares</p>
          {table.orderTables[0] && <div className="table-order">Comanda #{table.orderTables[0].order.orderNumber}</div>}
          <div className="table-card-actions">
            {archivedView ? <button className="secondary-button" disabled={busy} onClick={() => void restoreTable(table)} type="button">Restaurar</button> : <>
              {table.status !== 'AVAILABLE' && <button className="secondary-button" onClick={() => void setStatus(table, 'AVAILABLE')} type="button">Liberar</button>}
              {table.status === 'AVAILABLE' && <button className="secondary-button" onClick={() => void setStatus(table, 'RESERVED')} type="button">Reservar</button>}
              {table.status !== 'BLOCKED' && <button className="icon-button" aria-label={`Bloquear mesa ${table.number}`} title="Bloquear mesa" onClick={() => void setStatus(table, 'BLOCKED')} type="button">⊘</button>}
              {table.status === 'BLOCKED' && <button className="secondary-button" onClick={() => void setStatus(table, 'AVAILABLE')} type="button">Desbloquear</button>}
              <button className="icon-button" aria-label={`Editar mesa ${table.number}`} title="Editar mesa" onClick={() => openEditor(table)} type="button">✎</button>
              <button className="table-delete-button" disabled={busy} onClick={() => void archiveTable(table)} type="button">Excluir</button>
            </>}
          </div>
        </article>)}
        {!tables.length && <div className="empty-state"><strong>{archivedView ? 'Nenhuma mesa arquivada' : 'Nenhuma mesa cadastrada'}</strong>{archivedView ? 'Mesas excluídas do mapa aparecerão aqui.' : 'Adicione a primeira mesa desta unidade.'}</div>}
      </section>
      {editingTable && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTable(null); }}>
        <section aria-labelledby="edit-table-title" aria-modal="true" className="modal" role="dialog">
          <header className="modal-header"><div><h2 id="edit-table-title">Editar Mesa {editingTable.number}</h2><p>Atualize o nome e a quantidade de lugares.</p></div><button aria-label="Fechar" className="icon-button" onClick={() => setEditingTable(null)} type="button">×</button></header>
          <form onSubmit={saveTable}>
            <div className="modal-body">
              <div className="field"><label htmlFor="table-name">Nome</label><input id="table-name" maxLength={80} value={editName} onChange={(event) => setEditName(event.target.value)} placeholder={`Mesa ${editingTable.number}`} /></div>
              <div className="field"><label htmlFor="table-capacity">Lugares</label><input autoFocus id="table-capacity" min="1" max="100" required type="number" value={editCapacity} onChange={(event) => setEditCapacity(event.target.value)} /></div>
            </div>
            <footer className="modal-footer"><button className="secondary-button" disabled={busy} onClick={() => setEditingTable(null)} type="button">Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar'}</button></footer>
          </form>
        </section>
      </div>}
    </main>
  );
}