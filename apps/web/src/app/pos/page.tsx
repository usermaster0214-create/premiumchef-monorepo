'use client';

import { useEffect, useMemo, useState } from 'react';

type Session = {
  access_token: string;
  refresh_token: string;
  user: { tenant_id: string; units: string[]; name: string };
};

type Product = {
  id: string;
  name: string;
  imageUrl?: string | null;
  productUnits: { unitId: string; price: string | number }[];
  category?: { name: string } | null;
  status: string;
};

type CartLine = { product: Product; quantity: number };

const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export default function PosPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [unitId, setUnitId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
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

  useEffect(() => {
    if (!session || !unitId) return;
    const headers = new Headers({
      Authorization: `Bearer ${session.access_token}`,
      'X-Tenant-ID': session.user.tenant_id,
      'X-Unit-ID': unitId,
    });
    void fetch(`${apiBase}/products?status=ACTIVE`, { headers })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível carregar os produtos.');
        return response.json() as Promise<Product[]>;
      })
      .then(setProducts)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o catálogo.');
      });
  }, [session?.access_token, session?.user.tenant_id, unitId]);

  const visibleProducts = products.filter((product) =>
    `${product.name} ${product.category?.name ?? ''}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')),
  );
  const total = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.product.productUnits[0]?.price ?? 0) * line.quantity, 0),
    [cart],
  );

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => current
      .map((line) => line.product.id === productId
        ? { ...line, quantity: line.quantity + delta }
        : line)
      .filter((line) => line.quantity > 0));
  }

  async function finishSale() {
    if (!session || !unitId || !cart.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    const headers = new Headers({
      Authorization: `Bearer ${session.access_token}`,
      'X-Tenant-ID': session.user.tenant_id,
      'X-Unit-ID': unitId,
      'Content-Type': 'application/json',
    });
    try {
      const orderResponse = await fetch(`${apiBase}/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_type: 'COUNTER',
          items: cart.map((line) => ({
            product_id: line.product.id,
            quantity: line.quantity,
            unit_price: Number(line.product.productUnits[0]?.price ?? 0),
          })),
        }),
      });
      if (!orderResponse.ok) throw new Error('Não foi possível criar o pedido.');
      const order = (await orderResponse.json()) as { id: string; order_number: number; total: number };
      const paymentResponse = await fetch(`${apiBase}/orders/${order.id}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          payments: [{ payment_method: paymentMethod, amount: Number(order.total ?? total.toFixed(2)) }],
        }),
      });
      if (!paymentResponse.ok) throw new Error('Pedido criado, mas o pagamento não foi concluído.');
      setNotice(`Pedido #${order.order_number} concluído.`);
      setCart([]);
    } catch (saleError) {
      setError(saleError instanceof Error ? saleError.message : 'Não foi possível concluir a venda.');
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="login-main">
        <div className="login-card">
          <span className="eyebrow">PDV</span>
          <h2>Entre para operar o caixa</h2>
          <p>O terminal usa a mesma sessão segura do painel.</p>
          <a className="primary-button" href="/">Voltar para o login</a>
        </div>
      </main>
    );
  }

  return (
    <main className="pos-shell">
      <header className="pos-header">
        <div>
          <span className="eyebrow">Terminal de vendas</span>
          <h1>Balcão / PDV</h1>
        </div>
        <div className="pos-header-actions">
          <label className="unit-picker"><span>Unidade</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}>{session.user.units.map((id, index) => <option key={id} value={id}>Unidade {index + 1}</option>)}</select></label>
          <a className="secondary-button" href="/">Catálogo</a>
        </div>
      </header>
      {error && <div className="notice" role="alert">{error}</div>}
      {notice && <div className="pos-success" role="status">{notice}</div>}
      <div className="pos-layout">
        <section className="pos-products">
          <div className="pos-toolbar"><label className="search-field"><span className="search-mark">⌕</span><input aria-label="Buscar produtos do PDV" placeholder="Buscar produto ou categoria" value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="pos-count">{visibleProducts.length} itens ativos</span></div>
          <div className="pos-product-grid">
            {visibleProducts.map((product) => <button className="pos-product" key={product.id} onClick={() => addProduct(product)} type="button">
              <span className="pos-product-image">{product.imageUrl ? <img alt="" src={product.imageUrl} /> : product.name.slice(0, 1).toUpperCase()}</span>
              <span className="pos-product-name">{product.name}</span>
              <span className="pos-product-category">{product.category?.name ?? 'Sem categoria'}</span>
              <strong>{money(Number(product.productUnits[0]?.price ?? 0))}</strong>
            </button>)}
            {!visibleProducts.length && <div className="empty-state"><strong>Nenhum produto disponível</strong>Cadastre produtos ativos no catálogo.</div>}
          </div>
        </section>
        <aside className="pos-cart">
          <div className="pos-cart-header"><div><span className="eyebrow">Venda atual</span><h2>Comanda de balcão</h2></div><span className="pos-cart-badge">{cart.reduce((sum, line) => sum + line.quantity, 0)} itens</span></div>
          <div className="pos-cart-lines">
            {cart.map((line) => <div className="pos-cart-line" key={line.product.id}><div><strong>{line.product.name}</strong><span>{money(Number(line.product.productUnits[0]?.price ?? 0))} cada</span></div><div className="pos-quantity"><button aria-label={`Remover ${line.product.name}`} onClick={() => changeQuantity(line.product.id, -1)} type="button">−</button><b>{line.quantity}</b><button aria-label={`Adicionar ${line.product.name}`} onClick={() => changeQuantity(line.product.id, 1)} type="button">＋</button></div></div>)}
            {!cart.length && <div className="pos-cart-empty">Selecione produtos para iniciar a venda.</div>}
          </div>
          <div className="pos-summary"><div><span>Subtotal</span><strong>{money(total)}</strong></div><div className="pos-total"><span>Total</span><strong>{money(total)}</strong></div></div>
          <div className="pos-payment"><label htmlFor="pos-payment-method">Forma de pagamento</label><select id="pos-payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="PIX">PIX</option><option value="CASH">Dinheiro</option><option value="CREDIT_CARD">Cartão de crédito</option><option value="DEBIT_CARD">Cartão de débito</option></select></div>
          <button className="primary-button pos-finish" disabled={!cart.length || busy} onClick={() => void finishSale()} type="button">{busy ? 'Processando...' : 'Finalizar venda · ' + money(total)}</button>
        </aside>
      </div>
    </main>
  );
}