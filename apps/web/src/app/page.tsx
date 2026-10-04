'use client';

import { FormEvent, useEffect, useState } from 'react';

type CatalogUser = {
  id: string;
  name: string;
  email: string;
  tenant_id: string;
  units: string[];
  roles: string[];
  permissions: string[];
  platform_admin?: boolean;
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  user: CatalogUser;
};

type Category = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  status: string;
  sortOrder: number;
};

type ProductUnit = {
  unitId: string;
  price: number | string;
  costPrice?: number | string | null;
  stockMin?: number | string | null;
};

type Product = {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
  category?: Category | null;
  productUnits: ProductUnit[];
  variants: { id: string; name: string; price: number | string }[];
  productAddons: { required: boolean; maxQuantity: number; addon: Addon }[];
  recipes: { recipeItems: { id: string }[] }[];
  status: string;
  type: string;
  trackStock: boolean;
};

type Addon = {
  id: string;
  name: string;
  price: number | string;
  status: string;
};

type CatalogTab = 'products' | 'categories' | 'addons';
type ModalState = 'product' | 'category' | 'addon' | null;
type ProductForm = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  costPrice: string;
  stockMin: string;
  image: File | null;
  variantName: string;
  variantPrice: string;
  ingredientId: string;
  ingredientQuantity: string;
  ingredientUnit: string;
  addonIds: string[];
};

const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
).replace(/\/+$/, '');

const emptyProductForm: ProductForm = {
  name: '',
  description: '',
  categoryId: '',
  price: '',
  costPrice: '',
  stockMin: '',
  image: null,
  variantName: '',
  variantPrice: '',
  ingredientId: '',
  ingredientQuantity: '1',
  ingredientUnit: 'UN',
  addonIds: [],
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value ?? 0));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

async function responseMessage(response: Response) {
  try {
    const body = await response.json();
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? body.detail ?? 'Não foi possível concluir a operação.';
  } catch {
    return 'Não foi possível concluir a operação.';
  }
}

export default function CatalogPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [unitId, setUnitId] = useState('');
  const [tab, setTab] = useState<CatalogTab>('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [categoryName, setCategoryName] = useState('');
  const [categoryImage, setCategoryImage] = useState<File | null>(null);
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    const saved = window.sessionStorage.getItem('premiumchef.session');
    if (!saved) return;
    try {
      const restored = JSON.parse(saved) as AuthSession;
      setSession(restored);
      setUnitId(restored.user.units[0] ?? '');
    } catch {
      window.sessionStorage.removeItem('premiumchef.session');
    }
  }, []);

  async function apiRequest<T>(
    path: string,
    init: RequestInit = {},
    activeSession: AuthSession | null = session,
    selectedUnit: string = unitId,
    canRefresh = true,
  ): Promise<T> {
    if (!activeSession) throw new Error('Faça login para continuar.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${activeSession.access_token}`);
    headers.set('X-Tenant-ID', activeSession.user.tenant_id);
    headers.set('X-Unit-ID', selectedUnit);
    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${apiBase}${path}`, { ...init, headers });
    if (response.status === 401 && canRefresh) {
      const refreshed = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: activeSession.refresh_token }),
      });
      if (refreshed.ok) {
        const tokens = (await refreshed.json()) as Pick<
          AuthSession,
          'access_token' | 'refresh_token'
        >;
        const renewed = { ...activeSession, ...tokens };
        window.sessionStorage.setItem('premiumchef.session', JSON.stringify(renewed));
        setSession(renewed);
        return apiRequest<T>(path, init, renewed, selectedUnit, false);
      }
      window.sessionStorage.removeItem('premiumchef.session');
      setSession(null);
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    if (!response.ok) throw new Error(await responseMessage(response));
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function loadCatalog() {
    if (!session || !unitId) return;
    setLoadingCatalog(true);
    setError('');
    try {
      const [nextProducts, nextCategories, nextAddons] = await Promise.all([
        apiRequest<Product[]>('/products'),
        apiRequest<Category[]>('/categories'),
        apiRequest<Addon[]>('/addons'),
      ]);
      setProducts(nextProducts);
      setCategories(nextCategories);
      setAddons(nextAddons);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o catálogo.');
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => {
    if (session && unitId) void loadCatalog();
  }, [session?.access_token, unitId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = (await response.json()) as AuthSession;
      if (!result.user.units.length) throw new Error('Sua conta não possui unidades autorizadas.');
      window.sessionStorage.setItem('premiumchef.session', JSON.stringify(result));
      setSession(result);
      setUnitId(result.user.units[0]);
      setPassword('');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    window.sessionStorage.removeItem('premiumchef.session');
    setSession(null);
    setProducts([]);
    setCategories([]);
    setAddons([]);
  }

  function openProduct(product?: Product) {
    setEditingProduct(product ?? null);
    setProductForm(
      product
        ? {
            ...emptyProductForm,
            name: product.name,
            description: product.description ?? '',
            categoryId: product.category?.id ?? '',
            price: String(product.productUnits[0]?.price ?? ''),
            costPrice: String(product.productUnits[0]?.costPrice ?? ''),
            stockMin: String(product.productUnits[0]?.stockMin ?? ''),
            addonIds: product.productAddons.map((link) => link.addon.id),
          }
        : { ...emptyProductForm },
    );
    setModal('product');
  }

  function openCategory(category?: Category) {
    setEditingCategory(category ?? null);
    setCategoryName(category?.name ?? '');
    setCategoryImage(null);
    setModal('category');
  }

  function openAddon(addon?: Addon) {
    setEditingAddon(addon ?? null);
    setAddonName(addon?.name ?? '');
    setAddonPrice(addon ? String(addon.price) : '');
    setModal('addon');
  }

  function closeModal() {
    setModal(null);
    setEditingProduct(null);
    setEditingCategory(null);
    setEditingAddon(null);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!editingProduct && Boolean(productForm.variantName) !== Boolean(productForm.variantPrice)) {
        throw new Error('Preencha o nome e o preço da variação.');
      }
      const payload: Record<string, unknown> = {
        name: productForm.name.trim(),
        description: productForm.description.trim() || undefined,
        category_id: productForm.categoryId || null,
        price: Number(productForm.price),
        cost_price: productForm.costPrice ? Number(productForm.costPrice) : undefined,
        stock_min: productForm.stockMin ? Number(productForm.stockMin) : undefined,
        addons: productForm.addonIds.map((addonId) => {
          const current = editingProduct?.productAddons.find((link) => link.addon.id === addonId);
          return {
            addon_id: addonId,
            required: current?.required ?? false,
            max_quantity: current?.maxQuantity ?? 1,
          };
        }),
      };
      if (!editingProduct && productForm.variantName && productForm.variantPrice) {
        payload.variants = [{
          name: productForm.variantName.trim(),
          price: Number(productForm.variantPrice),
        }];
      }
      if (!editingProduct && productForm.ingredientId) {
        payload.recipe_name = `Ficha técnica de ${productForm.name.trim()}`;
        payload.recipe_items = [{
          ingredient_product_id: productForm.ingredientId,
          quantity: Number(productForm.ingredientQuantity),
          unit: productForm.ingredientUnit,
        }];
      }

      const saved = await apiRequest<Product>(
        editingProduct ? `/products/${editingProduct.id}` : '/products',
        {
          method: editingProduct ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      if (!editingProduct) setEditingProduct(saved);
      if (productForm.image) {
        const imageBody = new FormData();
        imageBody.set('image', productForm.image);
        await apiRequest(`/products/${saved.id}/image`, {
          method: 'POST',
          body: imageBody,
        });
      }
      closeModal();
      await loadCatalog();
      setToast(editingProduct ? 'Produto atualizado.' : 'Produto cadastrado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o produto.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await apiRequest<Category>(
        editingCategory ? `/categories/${editingCategory.id}` : '/categories',
        {
          method: editingCategory ? 'PATCH' : 'POST',
          body: JSON.stringify({ name: categoryName.trim() }),
        },
      );
      if (!editingCategory) setEditingCategory(saved);
      if (categoryImage) {
        const imageBody = new FormData();
        imageBody.set('image', categoryImage);
        await apiRequest(`/categories/${saved.id}/image`, {
          method: 'POST',
          body: imageBody,
        });
      }
      closeModal();
      await loadCatalog();
      setToast(editingCategory ? 'Categoria atualizada.' : 'Categoria criada.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a categoria.');
    } finally {
      setBusy(false);
    }
  }

  async function saveAddon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiRequest(editingAddon ? `/addons/${editingAddon.id}` : '/addons', {
        method: editingAddon ? 'PATCH' : 'POST',
        body: JSON.stringify({ name: addonName.trim(), price: Number(addonPrice) }),
      });
      closeModal();
      await loadCatalog();
      setToast(editingAddon ? 'Adicional atualizado.' : 'Adicional criado.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o adicional.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(path: string, status: 'ACTIVE' | 'INACTIVE') {
    setError('');
    try {
      await apiRequest(path, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadCatalog();
      setToast(status === 'ACTIVE' ? 'Registro ativado.' : 'Registro inativado.');
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Não foi possível atualizar o status.');
    }
  }

  const visibleProducts = products.filter((product) => {
    const matchesSearch = `${product.name} ${product.sku ?? ''} ${product.category?.name ?? ''}`
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR'));
    return matchesSearch && (!categoryFilter || product.category?.id === categoryFilter);
  });

  if (!session) {
    return (
      <main className="login-shell">
        <aside className="login-aside">
          <div className="brand">
            <span className="brand-mark">P</span>
            <div className="brand-copy">
              <div className="brand-name">PremiumChef</div>
              <div className="brand-subtitle">Operação em ordem</div>
            </div>
          </div>
          <div className="login-art" aria-hidden="true">
            <div className="plate"><div className="plate-center" /></div>
          </div>
          <div className="login-copy">
            <h1>Seu cardápio, sob controle.</h1>
            <p>Catálogo, preços por unidade e composição em um só lugar.</p>
          </div>
          <footer>PREMIUMCHEF · PAINEL DE OPERAÇÃO</footer>
        </aside>
        <section className="login-main">
          <form className="login-card" onSubmit={handleLogin}>
            <span className="eyebrow">Acesso seguro</span>
            <h2>Entrar no painel</h2>
            <p>Use sua conta de operação para continuar.</p>
            {error && <div className="notice" role="alert">{error}</div>}
            <div className="login-fields">
              <div className="field">
                <label htmlFor="login-email">E-mail</label>
                <input id="login-email" autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="login-password">Senha</label>
                <input id="login-password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
              <button className="primary-button" disabled={busy} type="submit">{busy ? 'Entrando...' : 'Entrar'}</button>
            </div>
            <div className="login-footnote">Conexão com {apiBase}</div>
          </form>
        </section>
      </main>
    );
  }

  const activeProducts = products.filter((product) => product.status === 'ACTIVE').length;
  const activeCategories = categories.filter((category) => category.status === 'ACTIVE').length;
  const heading = tab === 'products' ? 'Produtos' : tab === 'categories' ? 'Categorias' : 'Adicionais';

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <div className="brand-copy">
            <div className="brand-name">PremiumChef</div>
            <div className="brand-subtitle">Painel de operação</div>
          </div>
        </div>
        <div className="nav-label">Cadastros</div>
        <nav className="nav-list" aria-label="Catálogo">
          <a className="nav-button" href="/pos"><span className="nav-glyph">▤</span><span className="nav-text">PDV</span></a>
          <a className="nav-button" href="/tables"><span className="nav-glyph">◉</span><span className="nav-text">Mesas</span></a>
          <a className="nav-button" href="/kds"><span className="nav-glyph">▤</span><span className="nav-text">KDS</span></a>
          <a className="nav-button" href="/delivery-ops"><span className="nav-glyph">➜</span><span className="nav-text">Entregas</span></a>
          <a className="nav-button" href="/reports"><span className="nav-glyph">▥</span><span className="nav-text">Relatórios</span></a>
          {session.user.permissions.includes('cash.read') && <a className="nav-button" href="/cash"><span className="nav-glyph">$</span><span className="nav-text">Caixa e vendas</span></a>}
          {session.user.permissions.includes('users.read') && <a className="nav-button" href="/users"><span className="nav-glyph">☺</span><span className="nav-text">Usuários</span></a>}
          {session.user.platform_admin && <a className="nav-button" href="/companies"><span className="nav-glyph">▣</span><span className="nav-text">Empresas</span></a>}
          <button className={`nav-button ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')} type="button"><span className="nav-glyph">▦</span><span className="nav-text">Produtos</span></button>
          <button className={`nav-button ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')} type="button"><span className="nav-glyph">◫</span><span className="nav-text">Categorias</span></button>
          <button className={`nav-button ${tab === 'addons' ? 'active' : ''}`} onClick={() => setTab('addons')} type="button"><span className="nav-glyph">＋</span><span className="nav-text">Adicionais</span></button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">Catálogo sincronizado com a unidade selecionada.</div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">Catálogo <span aria-hidden="true"> / </span> <strong>{heading}</strong></div>
          <div className="top-actions">
            <div className="unit-picker">
              <label htmlFor="unit-picker">Unidade</label>
              <select id="unit-picker" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                {session.user.units.map((id, index) => <option key={id} value={id}>Unidade {index + 1}</option>)}
              </select>
            </div>
            <div className="user-chip">
              <span className="avatar">{initials(session.user.name)}</span>
              <div><div className="user-label">{session.user.name}</div><div className="user-role">{session.user.roles.join(' · ')}</div></div>
            </div>
            <button aria-label="Sair da conta" className="icon-button" onClick={signOut} title="Sair" type="button">↪</button>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">Catálogo da unidade</span>
              <h1>{heading}</h1>
              <p className="heading-copy">Atualizado para a operação selecionada.</p>
            </div>
            <button className="primary-button" onClick={() => tab === 'products' ? openProduct() : tab === 'categories' ? openCategory() : openAddon()} type="button">
              <span aria-hidden="true">＋</span> {tab === 'products' ? 'Novo produto' : tab === 'categories' ? 'Nova categoria' : 'Novo adicional'}
            </button>
          </div>

          {error && <div className="notice" role="alert"><span>{error}</span><button onClick={() => setError('')} type="button">Fechar</button></div>}
          {loadingCatalog && <div className="loading-line" aria-label="Carregando catálogo" />}

          <div className="metric-row">
            <div className="metric"><div><div className="metric-label">Produtos ativos</div><div className="metric-value">{activeProducts}</div></div><span className="metric-mark">▦</span></div>
            <div className="metric"><div><div className="metric-label">Categorias ativas</div><div className="metric-value">{activeCategories}</div></div><span className="metric-mark">◫</span></div>
            <div className="metric"><div><div className="metric-label">Adicionais cadastrados</div><div className="metric-value">{addons.length}</div></div><span className="metric-mark">＋</span></div>
          </div>

          <div className="catalog-toolbar">
            <div className="tabs" role="tablist" aria-label="Tipo de cadastro">
              {(['products', 'categories', 'addons'] as const).map((key) => (
                <button aria-selected={tab === key} className={`tab-button ${tab === key ? 'active' : ''}`} key={key} onClick={() => setTab(key)} role="tab" type="button">
                  {key === 'products' ? 'Produtos' : key === 'categories' ? 'Categorias' : 'Adicionais'}
                </button>
              ))}
            </div>
            {(tab === 'products' || tab === 'categories') && (
              <div className="toolbar-tools">
                <label className="search-field"><span className="search-mark" aria-hidden="true">⌕</span><input aria-label={`Buscar ${heading.toLowerCase()}`} placeholder="Buscar no catálogo" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                {tab === 'products' && <select aria-label="Filtrar por categoria" className="filter-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas as categorias</option>{categories.filter((category) => category.status === 'ACTIVE').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>}
              </div>
            )}
          </div>

          {tab === 'products' && (
            <div className="table-frame">
              <table>
                <thead><tr><th>Produto</th><th>Categoria</th><th>Preço da unidade</th><th>Composição</th><th>Status</th><th aria-label="Ações" /></tr></thead>
                <tbody>
                  {visibleProducts.map((product) => {
                    const unitProduct = product.productUnits.find((entry) => entry.unitId === unitId) ?? product.productUnits[0];
                    return <tr key={product.id}>
                      <td><div className="product-cell"><span className="product-image">{product.imageUrl ? <img alt="" src={product.imageUrl} /> : initials(product.name)}</span><div><div className="product-name">{product.name}</div><div className="product-detail">{product.sku || product.description || product.type}</div></div></div></td>
                      <td><span className="category-label">{product.category?.name ?? 'Sem categoria'}</span></td>
                      <td><div className="price">{money(unitProduct?.price)}</div>{unitProduct?.costPrice != null && <div className="sub-price">Custo {money(unitProduct.costPrice)}</div>}</td>
                      <td><span className="sub-price">{product.variants.length} var. · {product.productAddons.length} adicionais · {product.recipes.length ? 'Ficha ativa' : 'Sem ficha'}</span></td>
                      <td><span className={`status-label ${product.status !== 'ACTIVE' ? 'inactive' : ''}`}>{product.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span></td>
                      <td><div className="row-actions"><button aria-label={`Editar ${product.name}`} className="icon-button" onClick={() => openProduct(product)} title="Editar" type="button">✎</button><button aria-label={product.status === 'ACTIVE' ? `Inativar ${product.name}` : `Ativar ${product.name}`} className="icon-button" onClick={() => void setStatus(`/products/${product.id}/status`, product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')} title={product.status === 'ACTIVE' ? 'Inativar' : 'Ativar'} type="button">{product.status === 'ACTIVE' ? '−' : '+'}</button></div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {!visibleProducts.length && <div className="empty-state"><strong>Nenhum produto encontrado</strong>Ajuste a busca ou cadastre um produto.</div>}
            </div>
          )}

          {tab === 'categories' && (
            <div className="category-grid">
              {categories.filter((category) => category.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map((category) => (
                <article className="category-item" key={category.id}>
                  <span className="category-swatch">{initials(category.name).slice(0, 1)}</span>
                  <div className="category-info"><strong>{category.name}</strong><span className={`status-label ${category.status !== 'ACTIVE' ? 'inactive' : ''}`}>{category.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</span></div>
                  <button aria-label={`Editar ${category.name}`} className="icon-button" onClick={() => openCategory(category)} title="Editar" type="button">✎</button>
                  <button aria-label={category.status === 'ACTIVE' ? `Inativar ${category.name}` : `Ativar ${category.name}`} className="icon-button" onClick={() => void setStatus(`/categories/${category.id}/status`, category.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')} title={category.status === 'ACTIVE' ? 'Inativar' : 'Ativar'} type="button">{category.status === 'ACTIVE' ? '−' : '+'}</button>
                </article>
              ))}
              {!categories.length && <div className="empty-state"><strong>Nenhuma categoria cadastrada</strong>Crie uma categoria para organizar o cardápio.</div>}
            </div>
          )}

          {tab === 'addons' && (
            <div className="addon-list">
              {addons.map((addon) => <div className="addon-row" key={addon.id}>
                <span className="addon-symbol">＋</span><div className="addon-row-name">{addon.name}</div><div className="addon-price">{money(addon.price)}</div>
                <span className={`status-label ${addon.status !== 'ACTIVE' ? 'inactive' : ''}`}>{addon.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span>
                <button aria-label={`Editar ${addon.name}`} className="icon-button" onClick={() => openAddon(addon)} title="Editar" type="button">✎</button>
                <button aria-label={addon.status === 'ACTIVE' ? `Inativar ${addon.name}` : `Ativar ${addon.name}`} className="icon-button" onClick={() => void setStatus(`/addons/${addon.id}/status`, addon.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')} title={addon.status === 'ACTIVE' ? 'Inativar' : 'Ativar'} type="button">{addon.status === 'ACTIVE' ? '−' : '+'}</button>
              </div>)}
              {!addons.length && <div className="empty-state"><strong>Nenhum adicional cadastrado</strong>Cadastre opções e complementos do cardápio.</div>}
            </div>
          )}
        </section>
      </div>

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        {modal === 'product' && <form className="modal" onSubmit={saveProduct}>
          <div className="modal-header"><div><h2>{editingProduct ? 'Editar produto' : 'Novo produto'}</h2><p>Dados comerciais da unidade selecionada.</p></div><button aria-label="Fechar" className="icon-button" onClick={closeModal} type="button">×</button></div>
          <div className="modal-body">
            <div className="form-grid">
              <div className="field full"><label htmlFor="product-name">Nome</label><input id="product-name" maxLength={160} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required /></div>
              <div className="field full"><label htmlFor="product-description">Descrição</label><textarea id="product-description" maxLength={2000} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></div>
              <div className="field"><label htmlFor="product-category">Categoria</label><select id="product-category" value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}><option value="">Sem categoria</option>{categories.filter((category) => category.status === 'ACTIVE').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div className="field"><label htmlFor="product-price">Preço de venda</label><input id="product-price" type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} required /></div>
              <div className="field"><label htmlFor="product-cost">Preço de custo</label><input id="product-cost" type="number" min="0" step="0.01" value={productForm.costPrice} onChange={(event) => setProductForm({ ...productForm, costPrice: event.target.value })} /></div>
              <div className="field"><label htmlFor="product-stock">Estoque mínimo</label><input id="product-stock" type="number" min="0" step="0.001" value={productForm.stockMin} onChange={(event) => setProductForm({ ...productForm, stockMin: event.target.value })} /></div>
              <div className="field full"><label htmlFor="product-image">Imagem</label><input id="product-image" accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => setProductForm({ ...productForm, image: event.target.files?.[0] ?? null })} /><span className="field-note">JPEG, PNG ou WebP · até 5 MB</span></div>
              {!editingProduct && <>
                <div className="field"><label htmlFor="variant-name">Variação inicial</label><input id="variant-name" placeholder="Ex.: Grande" value={productForm.variantName} onChange={(event) => setProductForm({ ...productForm, variantName: event.target.value })} /></div>
                <div className="field"><label htmlFor="variant-price">Preço da variação</label><input id="variant-price" min="0" step="0.01" type="number" value={productForm.variantPrice} onChange={(event) => setProductForm({ ...productForm, variantPrice: event.target.value })} /></div>
                <div className="field full"><label htmlFor="recipe-ingredient">Insumo da ficha técnica</label><select id="recipe-ingredient" value={productForm.ingredientId} onChange={(event) => setProductForm({ ...productForm, ingredientId: event.target.value })}><option value="">Sem ficha técnica</option>{products.filter((product) => product.status === 'ACTIVE').map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></div>
                {productForm.ingredientId && <>
                  <div className="field"><label htmlFor="ingredient-quantity">Quantidade por rendimento</label><input id="ingredient-quantity" min="0.001" step="0.001" type="number" value={productForm.ingredientQuantity} onChange={(event) => setProductForm({ ...productForm, ingredientQuantity: event.target.value })} /></div>
                  <div className="field"><label htmlFor="ingredient-unit">Unidade de medida</label><input id="ingredient-unit" maxLength={20} value={productForm.ingredientUnit} onChange={(event) => setProductForm({ ...productForm, ingredientUnit: event.target.value })} /></div>
                </>}
              </>}
              <div className="field full"><label>Adicionais disponíveis</label><div className="check-list">{addons.filter((addon) => addon.status === 'ACTIVE').map((addon) => <label className="check-option" key={addon.id}><input checked={productForm.addonIds.includes(addon.id)} onChange={(event) => setProductForm({ ...productForm, addonIds: event.target.checked ? [...productForm.addonIds, addon.id] : productForm.addonIds.filter((id) => id !== addon.id) })} type="checkbox" />{addon.name} · {money(addon.price)}</label>)}{!addons.some((addon) => addon.status === 'ACTIVE') && <span className="field-note">Nenhum adicional ativo</span>}</div></div>
            </div>
          </div>
          <div className="modal-footer"><button className="secondary-button" onClick={closeModal} type="button">Cancelar</button><button className="primary-button" disabled={busy} type="submit">{busy ? 'Salvando...' : 'Salvar produto'}</button></div>
        </form>}

        {modal === 'category' && <form className="modal" onSubmit={saveCategory}>
          <div className="modal-header"><div><h2>{editingCategory ? 'Editar categoria' : 'Nova categoria'}</h2><p>Organização do cardápio.</p></div><button aria-label="Fechar" className="icon-button" onClick={closeModal} type="button">×</button></div>
          <div className="modal-body"><div className="field"><label htmlFor="category-name">Nome</label><input id="category-name" maxLength={100} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required /></div><div className="field"><label htmlFor="category-image">Imagem</label><input id="category-image" accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => setCategoryImage(event.target.files?.[0] ?? null)} /><span className="field-note">JPEG, PNG ou WebP · até 5 MB</span></div></div>
          <div className="modal-footer"><button className="secondary-button" onClick={closeModal} type="button">Cancelar</button><button className="primary-button" disabled={busy} type="submit">Salvar categoria</button></div>
        </form>}

        {modal === 'addon' && <form className="modal" onSubmit={saveAddon}>
          <div className="modal-header"><div><h2>{editingAddon ? 'Editar adicional' : 'Novo adicional'}</h2><p>Opção ou complemento de produto.</p></div><button aria-label="Fechar" className="icon-button" onClick={closeModal} type="button">×</button></div>
          <div className="modal-body"><div className="form-grid"><div className="field full"><label htmlFor="addon-name">Nome</label><input id="addon-name" maxLength={120} value={addonName} onChange={(event) => setAddonName(event.target.value)} required /></div><div className="field"><label htmlFor="addon-price">Preço</label><input id="addon-price" min="0" step="0.01" type="number" value={addonPrice} onChange={(event) => setAddonPrice(event.target.value)} required /></div></div></div>
          <div className="modal-footer"><button className="secondary-button" onClick={closeModal} type="button">Cancelar</button><button className="primary-button" disabled={busy} type="submit">Salvar adicional</button></div>
        </form>}
      </div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
