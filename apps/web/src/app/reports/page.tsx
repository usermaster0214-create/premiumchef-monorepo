'use client';

import { useEffect, useState } from 'react';

type Session = { access_token: string; user: { tenant_id: string; units: string[] } };
type Report = { sales: { total: number; orders: number; averageTicket: number }; byChannel: Record<string, number>; byPayment: Record<string, number>; topProducts: { name: string; quantity: number; total: number }[]; criticalStock: { product: string; quantity: number; minimum: number }[]; cancellations: number };
const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const labels: Record<string, string> = { COUNTER: 'Balcão', DINE_IN: 'Mesa', DELIVERY: 'Delivery', TAKEAWAY: 'Retirada', CASH: 'Dinheiro', PIX: 'PIX', CREDIT_CARD: 'Crédito', DEBIT_CARD: 'Débito' };

export default function ReportsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [unitId, setUnitId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { const saved = window.sessionStorage.getItem('premiumchef.session'); if (!saved) return; try { const restored = JSON.parse(saved) as Session; setSession(restored); setUnitId(restored.user.units[0] ?? ''); } catch { window.sessionStorage.removeItem('premiumchef.session'); } }, []);
  useEffect(() => {
    if (!session || !unitId) return;
    const headers = new Headers({ Authorization: `Bearer ${session.access_token}`, 'X-Tenant-ID': session.user.tenant_id, 'X-Unit-ID': unitId });
    void fetch(`${apiBase}/reports/summary`, { headers }).then(async (response) => { if (!response.ok) throw new Error('Não foi possível carregar os relatórios.'); return response.json() as Promise<Report>; }).then(setReport).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar relatórios.'));
  }, [session?.access_token, unitId]);

  if (!session) return <main className="login-main"><div className="login-card"><span className="eyebrow">Relatórios</span><h2>Entre para ver os indicadores</h2><a className="primary-button" href="/">Voltar para o login</a></div></main>;
  const maxChannel = Math.max(...Object.values(report?.byChannel ?? { empty: 1 }), 1);
  return <main className="reports-shell"><header className="pos-header"><div><span className="eyebrow">Visão gerencial</span><h1>Relatórios</h1><p className="heading-copy">Últimos 30 dias · unidade selecionada.</p></div><div className="pos-header-actions"><label className="unit-picker"><span>Unidade</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{session.user.units.map((id, index) => <option key={id} value={id}>Unidade {index + 1}</option>)}</select></label><a className="secondary-button" href="/">Catálogo</a></div></header>{error && <div className="notice" role="alert">{error}</div>}{report && <><section className="report-metrics"><div><span>Vendas</span><strong>{money(report.sales.total)}</strong></div><div><span>Pedidos pagos</span><strong>{report.sales.orders}</strong></div><div><span>Ticket médio</span><strong>{money(report.sales.averageTicket)}</strong></div><div><span>Cancelamentos</span><strong>{report.cancellations}</strong></div></section><div className="reports-grid"><section className="report-panel"><div className="ops-panel-head"><div><span className="eyebrow">Canais</span><h2>Vendas por canal</h2></div></div><div className="report-bars">{Object.entries(report.byChannel).map(([key, value]) => <div className="report-bar-row" key={key}><span>{labels[key] ?? key}</span><div><i style={{ width: `${(value / maxChannel) * 100}%` }} /></div><strong>{money(value)}</strong></div>)}</div></section><section className="report-panel"><div className="ops-panel-head"><div><span className="eyebrow">Produtos</span><h2>Mais vendidos</h2></div></div><div className="report-ranking">{report.topProducts.map((product, index) => <div key={product.name}><b>{index + 1}</b><span>{product.name}</span><strong>{product.quantity} un.</strong></div>)}{!report.topProducts.length && <div className="empty-state">Sem vendas no período.</div>}</div></section><section className="report-panel"><div className="ops-panel-head"><div><span className="eyebrow">Financeiro</span><h2>Formas de pagamento</h2></div></div><div className="report-ranking">{Object.entries(report.byPayment).map(([key, value]) => <div key={key}><span>{labels[key] ?? key}</span><strong>{money(value)}</strong></div>)}</div></section><section className="report-panel"><div className="ops-panel-head"><div><span className="eyebrow">Atenção</span><h2>Estoque crítico</h2></div></div><div className="report-ranking">{report.criticalStock.map((item) => <div key={item.product}><span>{item.product}</span><strong>{Number(item.quantity).toFixed(2)} / {Number(item.minimum).toFixed(2)}</strong></div>)}{!report.criticalStock.length && <div className="empty-state">Nenhum item crítico.</div>}</div></section></div></>}</main>;
}