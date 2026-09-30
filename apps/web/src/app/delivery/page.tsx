'use client';

import { useEffect, useMemo, useState } from 'react';

type Product = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  category?: { id: string; name: string } | null;
  productUnits: { price: string | number }[];
};
type Zone = { id: string; name: string; deliveryFee: string | number; estimatedMinutes?: number | null };
type Line = { product: Product; quantity: number };

const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const unitId = process.env.NEXT_PUBLIC_DELIVERY_UNIT_ID ?? '';

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function DeliveryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [address, setAddress] = useState({ name: '', phone: '', neighborhood: '', street: '', number: '' });

  useEffect(() => {
    if (!unitId) {
      setError('Configure NEXT_PUBLIC_DELIVERY_UNIT_ID para abrir este cardápio.');
      return;
    }
    Promise.all([
      fetch(`${apiBase}/delivery/public/${unitId}/catalog`).then((response) => response.json() as Promise<Product[]>),
      fetch(`${apiBase}/delivery/public/${unitId}/zones`).then((response) => response.json() as Promise<Zone[]>),
    ])
      .then(([catalog, deliveryZones]) => { setProducts(catalog); setZones(deliveryZones); })
      .catch(() => setError('Não foi possível carregar o cardápio.'));
  }, []);

  useEffect(() => {
    const handleCheckoutClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLButtonElement && target.textContent?.includes('Continuar para checkout')) {
        setCheckoutOpen(true);
      }
    };
    document.addEventListener('click', handleCheckoutClick);
    return () => document.removeEventListener('click', handleCheckoutClick);
  }, []);

  const visibleProducts = products.filter((product) => `${product.name} ${product.category?.name ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + Number(line.product.productUnits[0]?.price ?? 0) * line.quantity, 0), [cart]);
  const deliveryFee = Number(zones.find((zone) => zone.id === zoneId)?.deliveryFee ?? 0);

  function add(product: Product) {
    setCart((current) => {
      const line = current.find((entry) => entry.product.id === product.id);
      return line ? current.map((entry) => entry.product.id === product.id ? { ...entry, quantity: entry.quantity + 1 } : entry) : [...current, { product, quantity: 1 }];
    });
  }

  async function validateCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutMessage('');
    const response = await fetch(`${apiBase}/delivery/public/${unitId}/checkout/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone_id: zoneId, subtotal, neighborhood: address.neighborhood }),
    });
    if (!response.ok) {
      setCheckoutMessage('Não foi possível validar este endereço para a zona selecionada.');
      return;
    }
    const result = (await response.json()) as { total: number; estimated_minutes?: number };
    setCheckoutMessage(`Endereço aceito. Total ${money(result.total)} · previsão de ${result.estimated_minutes ?? '-'} min.`);
  }

  return <main className="delivery-shell">
    <header className="delivery-header"><div><span className="eyebrow">Cardápio online</span><h1>Peça do seu jeito.</h1><p>Escolha seus favoritos e acompanhe tudo pelo celular.</p></div><span className="delivery-brand">PremiumChef</span></header>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="delivery-layout"><section><div className="delivery-tools"><label className="search-field"><span className="search-mark">⌕</span><input aria-label="Buscar no cardápio" placeholder="Buscar no cardápio" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div><div className="delivery-grid">{visibleProducts.map((product) => <button className="delivery-product" key={product.id} onClick={() => add(product)} type="button"><span className="delivery-image">{product.imageUrl ? <img alt="" src={product.imageUrl} /> : product.name.slice(0, 1)}</span><span className="delivery-product-name">{product.name}</span><span className="delivery-product-description">{product.description ?? product.category?.name ?? 'Delícia da casa'}</span><strong>{money(Number(product.productUnits[0]?.price ?? 0))}</strong></button>)}{!visibleProducts.length && <div className="empty-state"><strong>Cardápio vazio</strong>Não encontramos itens para essa busca.</div>}</div></section><aside className="delivery-cart"><div className="delivery-cart-head"><div><span className="eyebrow">Seu pedido</span><h2>Carrinho</h2></div><span>{cart.reduce((sum, line) => sum + line.quantity, 0)} itens</span></div><div className="delivery-lines">{cart.map((line) => <div className="delivery-line" key={line.product.id}><div><strong>{line.product.name}</strong><small>{line.quantity} × {money(Number(line.product.productUnits[0]?.price ?? 0))}</small></div><button aria-label={`Remover ${line.product.name}`} onClick={() => setCart((current) => current.filter((entry) => entry.product.id !== line.product.id))} type="button">×</button></div>)}{!cart.length && <div className="delivery-empty">Seu carrinho está esperando por uma escolha.</div>}</div><div className="delivery-zone"><label htmlFor="delivery-zone">Zona de entrega</label><select id="delivery-zone" value={zoneId} onChange={(event) => setZoneId(event.target.value)}><option value="">Selecione uma zona</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name} · {money(Number(zone.deliveryFee))}</option>)}</select></div><div className="delivery-total"><span>Total estimado</span><strong>{money(subtotal + deliveryFee)}</strong></div><button className="primary-button" disabled={!cart.length || !zoneId} type="button">Continuar para checkout</button></aside></div>
    {checkoutOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}><form className="modal delivery-checkout" onSubmit={validateCheckout}><div className="modal-header"><div><h2>Onde entregar?</h2><p>Validaremos o endereço antes de criar o pedido.</p></div><button aria-label="Fechar" className="icon-button" onClick={() => setCheckoutOpen(false)} type="button">×</button></div><div className="modal-body"><div className="form-grid"><div className="field full"><label htmlFor="delivery-name">Nome</label><input id="delivery-name" value={address.name} onChange={(event) => setAddress({ ...address, name: event.target.value })} required /></div><div className="field"><label htmlFor="delivery-phone">Telefone</label><input id="delivery-phone" value={address.phone} onChange={(event) => setAddress({ ...address, phone: event.target.value })} required /></div><div className="field"><label htmlFor="delivery-neighborhood">Bairro</label><input id="delivery-neighborhood" value={address.neighborhood} onChange={(event) => setAddress({ ...address, neighborhood: event.target.value })} required /></div><div className="field"><label htmlFor="delivery-street">Rua</label><input id="delivery-street" value={address.street} onChange={(event) => setAddress({ ...address, street: event.target.value })} required /></div><div className="field"><label htmlFor="delivery-number">Número</label><input id="delivery-number" value={address.number} onChange={(event) => setAddress({ ...address, number: event.target.value })} required /></div></div>{checkoutMessage && <div className="pos-success">{checkoutMessage}</div>}</div><div className="modal-footer"><button className="secondary-button" onClick={() => setCheckoutOpen(false)} type="button">Voltar</button><button className="primary-button" type="submit">Validar endereço</button></div></form></div>}
  </main>;
}