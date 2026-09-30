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
    if (!response.ok) throw new Error('Não foi possível atualizar o mapa de mesas.');
    return response.status === 204 ? undefined : response.json();
  }

  async function loadTables() {
    if (!session || !unitId) return;
    try {
      setTables((await request('/tables')) as RestaurantTable[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar mesas.');
    }
  }

  useEffect(() => {
    if (session && unitId) void loadTables();
  }, [session?.access_token, unitId]);

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

  if (!session) {
    return <main className="login-main"><div className="login-card"><span className="eyebrow">Salão</span><h2>Entre para ver as mesas</h2><p>O mapa usa a mesma sessão segura do painel.</p><a className="primary-button" href="/">Voltar para o login</a></div></main>;
  }

  return (
    <main className="tables-shell">
      <header className="pos-header"><div><span className="eyebrow">Salão e comandas</span><h1>Mapa de mesas</h1><p className="heading-copy">Status em tempo real da unidade selecionada.</p></div><div className="pos-header-actions"><label className="unit-picker"><span>Unidade</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{session.user.units.map((id, index) => <option key={id} value={id}>Unidade {index + 1}</option>)}</select></label><a className="secondary-button" href="/pos">PDV</a></div></header>
      {error && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="pos-success" role="status">{notice}</div>}
      <section className="tables-toolbar"><form className="table-create-form" onSubmit={createTable}><input aria-label="Número da mesa" min="1" placeholder="Mesa nº" type="number" value={number} onChange={(event) => setNumber(event.target.value)} required /><input aria-label="Capacidade da mesa" min="1" placeholder="Lugares" type="number" value={capacity} onChange={(event) => setCapacity(event.target.value)} required /><button className="primary-button" disabled={busy} type="submit">＋ Nova mesa</button></form><span className="pos-count">{tables.length} mesas cadastradas</span></section>
      <section className="tables-grid">
        {tables.map((table) => <article className={`table-card table-${table.status.toLowerCase()}`} key={table.id}>
          <div className="table-card-top"><span className="table-number">{table.number}</span><span className="table-status">{statusLabel[table.status]}</span></div>
          <h2>{table.name || `Mesa ${table.number}`}</h2><p>{table.capacity ?? '-'} lugares</p>
          {table.orderTables[0] && <div className="table-order">Comanda #{table.orderTables[0].order.orderNumber}</div>}
          <div className="table-card-actions">{table.status !== 'AVAILABLE' && <button className="secondary-button" onClick={() => void setStatus(table, 'AVAILABLE')} type="button">Liberar</button>}{table.status === 'AVAILABLE' && <button className="secondary-button" onClick={() => void setStatus(table, 'RESERVED')} type="button">Reservar</button>}{table.status !== 'BLOCKED' && <button className="icon-button" aria-label={`Bloquear mesa ${table.number}`} onClick={() => void setStatus(table, 'BLOCKED')} type="button">⊘</button>}{table.status === 'BLOCKED' && <button className="secondary-button" onClick={() => void setStatus(table, 'AVAILABLE')} type="button">Desbloquear</button>}</div>
        </article>)}
        {!tables.length && <div className="empty-state"><strong>Nenhuma mesa cadastrada</strong>Adicione a primeira mesa desta unidade.</div>}
      </section>
    </main>
  );
}