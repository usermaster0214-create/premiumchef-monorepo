'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Session = { access_token: string; user: { tenant_id: string; units: string[] } };
type TicketStatus = 'WAITING' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
type Ticket = {
  id: string;
  status: TicketStatus;
  order: { orderNumber: number; orderType: string; notes?: string | null };
  kitchenTicketItems: { orderItem: { productName: string; quantity: string | number; notes?: string | null } }[];
};

const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const socketBase = apiBase.replace(/\/api\/v1$/, '');
const columns: { status: TicketStatus; title: string }[] = [
  { status: 'WAITING', title: 'Recebido' },
  { status: 'PREPARING', title: 'Em preparo' },
  { status: 'READY', title: 'Pronto' },
  { status: 'DELIVERED', title: 'Expedição' },
];

export default function KdsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [unitId, setUnitId] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!session || !unitId) return;
    const headers = new Headers({
      Authorization: `Bearer ${session.access_token}`,
      'X-Tenant-ID': session.user.tenant_id,
      'X-Unit-ID': unitId,
    });
    void fetch(`${apiBase}/kitchen-tickets?status=WAITING,PREPARING,READY`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a cozinha.');
        return response.json() as Promise<Ticket[]>;
      })
      .then(setTickets)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar KDS.'));
  }, [session?.access_token, session?.user.tenant_id, unitId]);

  useEffect(() => {
    if (!session || !unitId) return;
    const socket: Socket = io(`${socketBase}/ws/kds`, {
      transports: ['websocket'],
      auth: { token: session.access_token, tenant_id: session.user.tenant_id, unit_id: unitId },
    });
    socket.on('kitchen:ticket_updated', (event: { ticket_id: string; status: TicketStatus }) => {
      setTickets((current) => current.map((ticket) => ticket.id === event.ticket_id ? { ...ticket, status: event.status } : ticket));
    });
    socket.on('connect_error', () => setError('KDS sem conexão em tempo real.'));
    return () => { socket.disconnect(); };
  }, [session?.access_token, session?.user.tenant_id, unitId]);

  async function updateStatus(ticket: Ticket, status: TicketStatus) {
    if (!session) return;
    const headers = new Headers({
      Authorization: `Bearer ${session.access_token}`,
      'X-Tenant-ID': session.user.tenant_id,
      'X-Unit-ID': unitId,
      'Content-Type': 'application/json',
    });
    const response = await fetch(`${apiBase}/kitchen-tickets/${ticket.id}/status`, {
      method: 'PATCH', headers, body: JSON.stringify({ status }),
    });
    if (!response.ok) setError('Não foi possível atualizar o ticket.');
    else setTickets((current) => current.map((entry) => entry.id === ticket.id ? { ...entry, status } : entry));
  }

  const activeCount = useMemo(() => tickets.filter((ticket) => ticket.status !== 'CANCELLED').length, [tickets]);
  if (!session) return <main className="login-main"><div className="login-card"><span className="eyebrow">KDS</span><h2>Entre para abrir a cozinha</h2><p>O monitor usa a mesma sessão segura do painel.</p><a className="primary-button" href="/">Voltar para o login</a></div></main>;

  return <main className="kds-shell">
    <header className="pos-header"><div><span className="eyebrow">Produção em tempo real</span><h1>Monitor da cozinha</h1><p className="heading-copy">{activeCount} tickets ativos · unidade selecionada</p></div><div className="pos-header-actions"><a className="secondary-button" href="/tables">Mesas</a><a className="secondary-button" href="/pos">PDV</a></div></header>
    {error && <div className="notice" role="alert">{error}</div>}
    <section className="kds-board">
      {columns.map((column) => <div className="kds-column" key={column.status}><div className="kds-column-header"><h2>{column.title}</h2><span>{tickets.filter((ticket) => ticket.status === column.status).length}</span></div><div className="kds-ticket-list">
        {tickets.filter((ticket) => ticket.status === column.status).map((ticket) => <article className="kds-ticket" key={ticket.id}><div className="kds-ticket-top"><strong>#{ticket.order.orderNumber}</strong><span>{ticket.order.orderType}</span></div><div className="kds-items">{ticket.kitchenTicketItems.map((item, index) => <div className="kds-item" key={`${ticket.id}-${index}`}><b>{item.orderItem.quantity}×</b><span>{item.orderItem.productName}</span>{item.orderItem.notes && <small>{item.orderItem.notes}</small>}</div>)}</div>{ticket.order.notes && <div className="kds-note">{ticket.order.notes}</div>}<div className="kds-actions">{ticket.status === 'WAITING' && <button className="primary-button" onClick={() => void updateStatus(ticket, 'PREPARING')} type="button">Iniciar preparo</button>}{ticket.status === 'PREPARING' && <button className="primary-button" onClick={() => void updateStatus(ticket, 'READY')} type="button">Marcar pronto</button>}{ticket.status === 'READY' && <button className="primary-button" onClick={() => void updateStatus(ticket, 'DELIVERED')} type="button">Enviar expedição</button>}</div></article>)}{!tickets.some((ticket) => ticket.status === column.status) && <div className="kds-empty">Nenhum ticket</div>}
      </div></div>)}
    </section>
  </main>;
}