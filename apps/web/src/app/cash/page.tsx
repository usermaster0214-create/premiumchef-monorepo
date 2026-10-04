'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, dateTime, loadSession, money, StoredSession } from '../../lib/api-client';

type MovementType = 'SALE' | 'WITHDRAWAL' | 'DEPOSIT' | 'REFUND' | 'ADJUSTMENT';

type Register = { id: string; name: string; status: 'OPEN' | 'CLOSED' };
type Movement = { id: string; type: MovementType; amount: string | number; description?: string | null; createdAt: string };
type CashSession = {
  id: string;
  openingAmount: string | number;
  cashRegister?: { name: string } | null;
  cashMovements: Movement[];
};
type Reconciliation = { expected_amount: number; counted_amount: number; difference: number };

type OrderRow = {
  id: string;
  orderNumber: number;
  orderType: string;
  status: string;
  total: string | number;
  createdAt: string;
  user?: { name: string } | null;
  payments: { paymentMethod: string; amount: string | number; status: string }[];
  _count: { orderItems: number };
};

const movementLabel: Record<MovementType, string> = {
  SALE: 'Venda',
  WITHDRAWAL: 'Sangria',
  DEPOSIT: 'Suprimento',
  REFUND: 'Estorno',
  ADJUSTMENT: 'Ajuste',
};
const outflow: MovementType[] = ['WITHDRAWAL', 'REFUND'];

const orderTypeLabel: Record<string, string> = {
  DINE_IN: 'Mesa', TAKEAWAY: 'Retirada', COUNTER: 'Balcão', DELIVERY: 'Delivery',
};
const orderStatusLabel: Record<string, string> = {
  PENDING: 'Pendente', CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Em rota', DELIVERED: 'Entregue', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};
const methodLabel: Record<string, string> = {
  CASH: 'Dinheiro', PIX: 'PIX', CREDIT_CARD: 'Crédito', DEBIT_CARD: 'Débito', TRANSFER: 'Transferência', OTHER: 'Outro',
};
const periods = { today: 'Hoje', week: 'Últimos 7 dias', month: 'Últimos 30 dias' } as const;

function parseAmount(value: string): number {
  return Number(value.replace(',', '.'));
}

function periodStart(period: keyof typeof periods): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - 6);
  if (period === 'month') start.setDate(start.getDate() - 29);
  return start.toISOString();
}

export default function CashPage() {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [tab, setTab] = useState<'cash' | 'sales'>('cash');
  const [registers, setRegisters] = useState<Register[]>([]);
  const [current, setCurrent] = useState<CashSession | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [period, setPeriod] = useState<keyof typeof periods>('today');
  const [registerId, setRegisterId] = useState('');
  const [openingAmount, setOpeningAmount] = useState('0');
  const [movementType, setMovementType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const [closeResult, setCloseResult] = useState<Reconciliation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const restored = loadSession();
    setSession(restored);
    setUnitId(restored?.user.units[0] ?? '');
    setReady(true);
  }, []);

  const can = useCallback(
    (permission: string) => Boolean(session?.user.permissions.includes(permission)),
    [session],
  );

  const loadCash = useCallback(async () => {
    if (!session || !unitId || !can('cash.read')) return;
    try {
      const [open, list] = await Promise.all([
        apiFetch<CashSession | null>('/cash-sessions/current', {}, unitId),
        apiFetch<Register[]>('/cash-sessions/registers', {}, unitId),
      ]);
      setCurrent(open);
      setRegisters(list);
      setRegisterId((previous) => previous || list.find((item) => item.status === 'CLOSED')?.id || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o caixa.');
    }
  }, [session, unitId, can]);

  const loadSales = useCallback(async () => {
    if (!session || !unitId || !can('orders.read')) return;
    try {
      setOrders(await apiFetch<OrderRow[]>(`/orders?from=${encodeURIComponent(periodStart(period))}&limit=200`, {}, unitId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar as vendas.');
    }
  }, [session, unitId, period, can]);

  useEffect(() => { void loadCash(); }, [loadCash]);
  useEffect(() => { if (tab === 'sales') void loadSales(); }, [tab, loadSales]);

  const totals = useMemo(() => {
    const movements = current?.cashMovements ?? [];
    const inflow = movements.filter((item) => !outflow.includes(item.type)).reduce((sum, item) => sum + Number(item.amount), 0);
    const outgoing = movements.filter((item) => outflow.includes(item.type)).reduce((sum, item) => sum + Number(item.amount), 0);
    const opening = Number(current?.openingAmount ?? 0);
    return { opening, inflow, outgoing, expected: opening + inflow - outgoing };
  }, [current]);

  const salesSummary = useMemo(() => {
    const completed = orders.filter((order) => order.status === 'COMPLETED');
    const byMethod: Record<string, number> = {};
    for (const order of orders) {
      for (const payment of order.payments) {
        if (payment.status === 'PAID') byMethod[payment.paymentMethod] = (byMethod[payment.paymentMethod] ?? 0) + Number(payment.amount);
      }
    }
    return {
      completedCount: completed.length,
      completedTotal: completed.reduce((sum, order) => sum + Number(order.total), 0),
      pendingCount: orders.filter((order) => !['COMPLETED', 'CANCELLED'].includes(order.status)).length,
      cancelledCount: orders.filter((order) => order.status === 'CANCELLED').length,
      byMethod,
    };
  }, [orders]);

  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }

  function openCash(event: FormEvent) {
    event.preventDefault();
    setCloseResult(null);
    void perform(async () => {
      await apiFetch('/cash-sessions/open', {
        method: 'POST',
        body: JSON.stringify({ cash_register_id: registerId, opening_amount: parseAmount(openingAmount) || 0 }),
      }, unitId);
      await loadCash();
    }, 'Caixa aberto.');
  }

  function addMovement(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    void perform(async () => {
      await apiFetch(`/cash-sessions/${current.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({ type: movementType, amount: parseAmount(movementAmount), description: movementNote.trim() || undefined }),
      }, unitId);
      setMovementAmount('');
      setMovementNote('');
      await loadCash();
    }, movementType === 'DEPOSIT' ? 'Suprimento registrado.' : 'Sangria registrada.');
  }

  function closeCash(event: FormEvent) {
    event.preventDefault();
    if (!current || !window.confirm('Encerrar a sessão de caixa?')) return;
    void perform(async () => {
      const result = await apiFetch<{ reconciliation: Reconciliation }>(`/cash-sessions/${current.id}/close`, {
        method: 'PATCH',
        body: JSON.stringify({ counted_amount: parseAmount(countedAmount) }),
      }, unitId);
      setCloseResult(result.reconciliation);
      setCountedAmount('');
      setRegisterId('');
      await loadCash();
    }, 'Caixa encerrado.');
  }

  if (!ready) return null;

  if (!session) {
    return <main className="login-main"><div className="login-card"><span className="eyebrow">Caixa</span><h2>Entre para operar o caixa</h2><p>O caixa usa a mesma sessão segura do painel.</p><a className="primary-button" href="/">Voltar para o login</a></div></main>;
  }

  const closedRegisters = registers.filter((item) => item.status === 'CLOSED');

  return (
    <main className="tables-shell">
      <header className="pos-header">
        <div><span className="eyebrow">Financeiro</span><h1>Caixa e vendas</h1><p className="heading-copy">Abertura, movimentações, fechamento e consulta de vendas.</p></div>
        <div className="pos-header-actions">
          {session.user.units.length > 1 && <label className="unit-picker"><span>Unidade</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{session.user.units.map((id, index) => <option key={id} value={id}>Unidade {index + 1}</option>)}</select></label>}
          <a className="secondary-button" href="/pos">PDV</a>
          <a className="secondary-button" href="/">Painel</a>
        </div>
      </header>
      {error && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="pos-success" role="status">{notice}</div>}

      <div className="page-wrap">
        <div className="tabs page-tabs" role="tablist" aria-label="Seções do caixa">
          <button aria-selected={tab === 'cash'} className={`tab-button ${tab === 'cash' ? 'active' : ''}`} onClick={() => setTab('cash')} role="tab" type="button">Caixa</button>
          {can('orders.read') && <button aria-selected={tab === 'sales'} className={`tab-button ${tab === 'sales' ? 'active' : ''}`} onClick={() => setTab('sales')} role="tab" type="button">Vendas</button>}
        </div>

        {tab === 'cash' && !can('cash.read') && <div className="panel"><p className="heading-copy">Seu perfil não tem acesso ao caixa.</p></div>}

        {tab === 'cash' && can('cash.read') && !current && <>
          {closeResult && <section className="panel"><h2>Último fechamento</h2><div className="metric-row">
            <div className="metric"><div><div className="metric-label">Esperado</div><div className="metric-value">{money(closeResult.expected_amount)}</div></div></div>
            <div className="metric"><div><div className="metric-label">Contado</div><div className="metric-value">{money(closeResult.counted_amount)}</div></div></div>
            <div className="metric"><div><div className="metric-label">Diferença</div><div className={`metric-value ${closeResult.difference === 0 ? 'diff-ok' : 'diff-bad'}`}>{money(closeResult.difference)}</div></div></div>
          </div></section>}
          <section className="panel">
            <h2>Abrir caixa</h2>
            {!can('cash.open') ? <p className="heading-copy">Seu perfil pode consultar o caixa, mas não abrir uma sessão.</p> : !closedRegisters.length ? <p className="heading-copy">Nenhum caixa livre nesta unidade.</p> : (
              <form className="inline-form cash-form" onSubmit={openCash}>
                <div className="field"><label htmlFor="register">Caixa</label><select id="register" required value={registerId} onChange={(event) => setRegisterId(event.target.value)}>{closedRegisters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div className="field"><label htmlFor="opening">Fundo inicial (R$)</label><input id="opening" inputMode="decimal" required value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} /></div>
                <button className="primary-button" disabled={busy || !registerId} type="submit">Abrir caixa</button>
              </form>
            )}
          </section>
        </>}

        {tab === 'cash' && can('cash.read') && current && <>
          <div className="metric-row">
            <div className="metric"><div><div className="metric-label">{current.cashRegister?.name ?? 'Caixa'} · fundo inicial</div><div className="metric-value">{money(totals.opening)}</div></div></div>
            <div className="metric"><div><div className="metric-label">Entradas</div><div className="metric-value">{money(totals.inflow)}</div></div></div>
            <div className="metric"><div><div className="metric-label">Saídas</div><div className="metric-value">{money(totals.outgoing)}</div></div></div>
            <div className="metric"><div><div className="metric-label">Saldo esperado</div><div className="metric-value">{money(totals.expected)}</div></div></div>
          </div>
          <div className="panel-grid">
            {can('cash.movement') && <section className="panel">
              <h2>Suprimento / sangria</h2>
              <form className="inline-form" onSubmit={addMovement}>
                <div className="field"><label htmlFor="movement-type">Tipo</label><select id="movement-type" value={movementType} onChange={(event) => setMovementType(event.target.value as 'DEPOSIT' | 'WITHDRAWAL')}><option value="DEPOSIT">Suprimento (entrada)</option><option value="WITHDRAWAL">Sangria (saída)</option></select></div>
                <div className="field"><label htmlFor="movement-amount">Valor (R$)</label><input id="movement-amount" inputMode="decimal" required value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} /></div>
                <div className="field"><label htmlFor="movement-note">Descrição</label><input id="movement-note" maxLength={500} placeholder="Opcional" value={movementNote} onChange={(event) => setMovementNote(event.target.value)} /></div>
                <button className="primary-button" disabled={busy || !(parseAmount(movementAmount) > 0)} type="submit">Registrar</button>
              </form>
            </section>}
            {can('cash.close') && <section className="panel">
              <h2>Fechar caixa</h2>
              <form className="inline-form" onSubmit={closeCash}>
                <div className="field"><label htmlFor="counted">Valor contado (R$)</label><input id="counted" inputMode="decimal" required value={countedAmount} onChange={(event) => setCountedAmount(event.target.value)} /><span className="field-note">Esperado: {money(totals.expected)}</span></div>
                <button className="table-delete-button close-button" disabled={busy || countedAmount === ''} type="submit">Encerrar sessão</button>
              </form>
            </section>}
          </div>
          <div className="table-frame">
            <table>
              <thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead>
              <tbody>
                {current.cashMovements.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td>{movementLabel[item.type]}</td><td>{item.description || '—'}</td><td className={outflow.includes(item.type) ? 'diff-bad' : ''}>{outflow.includes(item.type) ? '−' : '+'} {money(item.amount)}</td></tr>)}
              </tbody>
            </table>
            {!current.cashMovements.length && <div className="empty-state"><strong>Sem movimentações</strong>Vendas em dinheiro, suprimentos e sangrias aparecem aqui.</div>}
          </div>
        </>}

        {tab === 'sales' && can('orders.read') && <>
          <div className="panel sales-toolbar">
            <div className="field"><label htmlFor="period">Período</label><select id="period" value={period} onChange={(event) => setPeriod(event.target.value as keyof typeof periods)}>{Object.entries(periods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <span className="pos-count">{orders.length} pedidos{orders.length === 200 ? ' (limite de 200 exibido)' : ''}</span>
          </div>
          <div className="metric-row">
            <div className="metric"><div><div className="metric-label">Vendas concluídas</div><div className="metric-value">{salesSummary.completedCount}</div></div></div>
            <div className="metric"><div><div className="metric-label">Total vendido</div><div className="metric-value">{money(salesSummary.completedTotal)}</div></div></div>
            <div className="metric"><div><div className="metric-label">Em aberto</div><div className="metric-value">{salesSummary.pendingCount}</div></div></div>
            <div className="metric"><div><div className="metric-label">Canceladas</div><div className="metric-value">{salesSummary.cancelledCount}</div></div></div>
          </div>
          {Object.keys(salesSummary.byMethod).length > 0 && <section className="panel"><h2>Recebido por forma de pagamento</h2>{Object.entries(salesSummary.byMethod).map(([method, amount]) => <span className="chip" key={method}>{methodLabel[method] ?? method}: {money(amount)}</span>)}</section>}
          <div className="table-frame">
            <table>
              <thead><tr><th>Pedido</th><th>Data</th><th>Tipo</th><th>Itens</th><th>Pagamento</th><th>Operador</th><th>Status</th><th>Total</th></tr></thead>
              <tbody>
                {orders.map((order) => <tr key={order.id}>
                  <td>#{order.orderNumber}</td><td>{dateTime(order.createdAt)}</td><td>{orderTypeLabel[order.orderType] ?? order.orderType}</td><td>{order._count.orderItems}</td>
                  <td>{Array.from(new Set(order.payments.filter((payment) => payment.status === 'PAID').map((payment) => methodLabel[payment.paymentMethod] ?? payment.paymentMethod))).join(', ') || '—'}</td>
                  <td>{order.user?.name ?? '—'}</td>
                  <td><span className={`status-label ${order.status === 'CANCELLED' ? 'inactive' : ''}`}>{orderStatusLabel[order.status] ?? order.status}</span></td>
                  <td>{money(order.total)}</td>
                </tr>)}
              </tbody>
            </table>
            {!orders.length && <div className="empty-state"><strong>Nenhuma venda no período</strong>Finalize vendas no PDV para vê-las aqui.</div>}
          </div>
        </>}
      </div>
    </main>
  );
}
