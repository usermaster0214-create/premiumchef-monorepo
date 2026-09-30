'use client';

import { FormEvent, useEffect, useState } from 'react';

type Session = { access_token: string; user: { tenant_id: string; units: string[]; name: string } };
type Driver = { id: string; name: string; phone: string; vehicle?: string | null; plate?: string | null };
type Delivery = { id: string; status: string; driver?: Driver | null; order: { orderNumber: number; total: string | number }; address?: { street: string; number: string; neighborhood: string; city: string } | null };

const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const statuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const labels: Record<string, string> = { PENDING: 'Pendente', CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto', OUT_FOR_DELIVERY: 'Em rota', DELIVERED: 'Entregue', CANCELLED: 'Cancelado' };

export default function DeliveryOpsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [unitId, setUnitId] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const saved = window.sessionStorage.getItem('premiumchef.session');
    if (!saved) return;
    try { const restored = JSON.parse(saved) as Session; setSession(restored); setUnitId(restored.user.units[0] ?? ''); } catch { window.sessionStorage.removeItem('premiumchef.session'); }
  }, []);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!session) throw new Error('Faça login para continuar.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    headers.set('X-Tenant-ID', session.user.tenant_id);
    headers.set('X-Unit-ID', unitId);
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${apiBase}${path}`, { ...init, headers });
    if (!response.ok) throw new Error('Não foi possível atualizar as entregas.');
    return response.json() as Promise<T>;
  }

  async function load() {
    if (!session || !unitId) return;
    try { const [nextDrivers, nextDeliveries] = await Promise.all([request<Driver[]>('/delivery-drivers'), request<Delivery[]>('/deliveries')]); setDrivers(nextDrivers); setDeliveries(nextDeliveries); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar entregas.'); }
  }
  useEffect(() => { if (session && unitId) void load(); }, [session?.access_token, unitId]);

  async function createDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await request('/delivery-drivers', { method: 'POST', body: JSON.stringify({ name: driverName, phone: driverPhone }) }); setDriverName(''); setDriverPhone(''); setNotice('Entregador cadastrado.'); await load(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Falha ao cadastrar entregador.'); }
  }
  async function assign(deliveryId: string, driverId: string) { try { await request(`/deliveries/${deliveryId}/driver`, { method: 'PATCH', body: JSON.stringify({ driver_id: driverId }) }); setNotice('Entregador atribuído.'); await load(); } catch (assignError) { setError(assignError instanceof Error ? assignError.message : 'Falha ao atribuir entregador.'); } }
  async function updateStatus(delivery: Delivery, status: string) { try { await request(`/deliveries/${delivery.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice('Status atualizado.'); await load(); } catch (statusError) { setError(statusError instanceof Error ? statusError.message : 'Transição inválida.'); } }

  if (!session) return <main className="login-main"><div className="login-card"><span className="eyebrow">Entregas</span><h2>Entre para gerenciar rotas</h2><p>O painel usa a sessão segura do PremiumChef.</p><a className="primary-button" href="/">Voltar para o login</a></div></main>;

  return <main className="delivery-ops-shell"><header className="pos-header"><div><span className="eyebrow">Logística</span><h1>Entregas</h1><p className="heading-copy">Atribuição, status e acompanhamento da unidade.</p></div><div className="pos-header-actions"><label className="unit-picker"><span>Unidade</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{session.user.units.map((id, index) => <option key={id} value={id}>Unidade {index + 1}</option>)}</select></label><a className="secondary-button" href="/delivery">Cardápio</a></div></header>{error && <div className="notice" role="alert">{error}</div>}{notice && <div className="pos-success" role="status">{notice}</div>}<div className="delivery-ops-grid"><section className="ops-panel"><div className="ops-panel-head"><div><span className="eyebrow">Fila operacional</span><h2>Chamados de entrega</h2></div><span className="pos-count">{deliveries.length} registros</span></div><div className="delivery-table">{deliveries.map((delivery) => <article className="delivery-card" key={delivery.id}><div><strong>Pedido #{delivery.order.orderNumber}</strong><span>{delivery.address ? `${delivery.address.street}, ${delivery.address.number} · ${delivery.address.neighborhood}` : 'Endereço não informado'}</span></div><span className={`delivery-status delivery-status-${delivery.status.toLowerCase()}`}>{labels[delivery.status] ?? delivery.status}</span><select aria-label={`Entregador do pedido ${delivery.order.orderNumber}`} value={delivery.driver?.id ?? ''} onChange={(event) => event.target.value && void assign(delivery.id, event.target.value)}><option value="">Atribuir entregador</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select><select aria-label={`Status do pedido ${delivery.order.orderNumber}`} value={delivery.status} onChange={(event) => void updateStatus(delivery, event.target.value)}>{statuses.map((status) => <option key={status} value={status}>{labels[status]}</option>)}</select></article>)}{!deliveries.length && <div className="empty-state"><strong>Nenhuma entrega encontrada</strong>Os pedidos Delivery aparecerão aqui.</div>}</div></section><aside className="ops-panel"><div className="ops-panel-head"><div><span className="eyebrow">Equipe</span><h2>Entregadores</h2></div><span className="pos-count">{drivers.length} ativos</span></div><form className="driver-form" onSubmit={createDriver}><input aria-label="Nome do entregador" placeholder="Nome completo" value={driverName} onChange={(event) => setDriverName(event.target.value)} required /><input aria-label="Telefone do entregador" placeholder="Telefone" value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} required /><button className="primary-button" type="submit">＋ Cadastrar</button></form><div className="driver-list">{drivers.map((driver) => <div className="driver-row" key={driver.id}><span className="avatar">{driver.name.slice(0, 2).toUpperCase()}</span><div><strong>{driver.name}</strong><small>{driver.phone}{driver.vehicle ? ` · ${driver.vehicle}` : ''}</small></div></div>)}{!drivers.length && <div className="empty-state">Nenhum entregador ativo.</div>}</div></aside></div></main>;
}