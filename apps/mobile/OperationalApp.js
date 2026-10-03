import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const apiBase = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const palette = {
  ink: '#173d30',
  green: '#1f654b',
  pale: '#e6f1eb',
  paper: '#f4f7f4',
  muted: '#708078',
  orange: '#d7793f',
  white: '#fff',
  line: '#dce5df',
  red: '#ad3d33',
};

function errorMessage(body) {
  if (Array.isArray(body?.message)) return body.message.join(', ');
  return body?.message || body?.detail || 'Não foi possível concluir a operação.';
}

async function readResponse(response) {
  if (response.status === 204) return undefined;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(body));
  return body;
}

async function apiRequest(path, sessionRef, setSession, init = {}) {
  const session = sessionRef.current;
  if (!session) throw new Error('Faça login para continuar.');
  const unitId = session.user.units?.[0];
  if (!unitId) throw new Error('Seu usuário não possui uma unidade ativa.');

  const send = (token) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Tenant-ID', session.user.tenant_id);
    headers.set('X-Unit-ID', unitId);
    if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${apiBase}${path}`, { ...init, headers });
  };

  let response = await send(session.access_token);
  if (response.status === 401 && session.refresh_token) {
    const refreshed = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!refreshed.ok) {
      setSession(null);
      throw new Error('Sua sessão expirou. Entre novamente.');
    }
    const tokens = await refreshed.json();
    const renewed = { ...session, ...tokens };
    sessionRef.current = renewed;
    setSession(renewed);
    response = await send(renewed.access_token);
  }
  return readResponse(response);
}

function requestOptions(method, body) {
  return { method, body: JSON.stringify(body) };
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value || 0));
}

function statusName(status) {
  const names = {
    AVAILABLE: 'Livre', OCCUPIED: 'Ocupada', RESERVED: 'Reservada', BLOCKED: 'Bloqueada',
    WAITING: 'Aguardando', PENDING: 'Pendente', CONFIRMED: 'Confirmado',
    PREPARING: 'Em preparo', READY: 'Pronto', OUT_FOR_DELIVERY: 'Em rota',
    DELIVERED: 'Entregue', CANCELLED: 'Cancelado', OPEN: 'Aberto', CLOSED: 'Fechado',
  };
  return names[status] || status || 'Sem status';
}

function Screen({ eyebrow, title, subtitle, children, onRefresh, loading }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.kicker}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        {onRefresh ? <Pressable accessibilityLabel="Atualizar" onPress={onRefresh} style={styles.refreshButton}><Text style={styles.refreshText}>↻</Text></Pressable> : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {loading ? <ActivityIndicator color={palette.green} style={styles.loader} /> : children}
    </ScrollView>
  );
}

function Notice({ error, onClose }) {
  if (!error) return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{error}</Text>
      {onClose ? <Pressable onPress={onClose}><Text style={styles.noticeClose}>Fechar</Text></Pressable> : null}
    </View>
  );
}

function Button({ title, onPress, disabled, secondary, danger }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText, danger && styles.buttonDangerText]}>{title}</Text>
    </Pressable>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', secureTextEntry }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        autoCapitalize="none"
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8b9b91"
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function LoginScreen({ onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await readResponse(response);
      onAuthenticated(result);
    } catch (loginError) {
      setError(loginError.message || 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.loginScreen} keyboardShouldPersistTaps="handled">
      <View style={styles.loginMark}><Text style={styles.loginMarkText}>P</Text></View>
      <Text style={styles.kicker}>PREMIUMCHEF OPERACIONAL</Text>
      <Text style={styles.loginTitle}>Seu turno, no ritmo da operação.</Text>
      <Text style={styles.loginSubtitle}>Acesse as ferramentas liberadas para o seu perfil.</Text>
      <View style={styles.loginForm}>
        <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="voce@restaurante.com" keyboardType="email-address" />
        <Field label="Senha" value={password} onChangeText={setPassword} placeholder="Sua senha" secureTextEntry />
        <Notice error={error} />
        <Button title={busy ? 'Entrando...' : 'Entrar'} disabled={busy || !email.trim() || !password} onPress={() => void signIn()} />
      </View>
    </ScrollView>
  );
}

function HomeScreen({ session, onSignOut }) {
  return (
    <Screen eyebrow="TURNO ATUAL" title={`Olá, ${session.user.name.split(' ')[0]}.`} subtitle="As áreas disponíveis seguem as permissões da sua conta.">
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{session.user.units.length} unidade(s) disponíveis</Text>
        <Text style={styles.heroText}>{session.user.roles.join(' · ') || 'Operação'}</Text>
      </View>
      <View style={styles.statRow}>
        <View style={styles.stat}><Text style={styles.statValue}>{session.user.permissions.length}</Text><Text style={styles.statLabel}>permissões</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{session.user.units.length}</Text><Text style={styles.statLabel}>unidades</Text></View>
      </View>
      <Button title="Sair da conta" onPress={onSignOut} secondary />
    </Screen>
  );
}

function TablesScreen({ session, sessionRef, setSession, canCreateOrders }) {
  const unitId = session.user.units[0];
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [nextTables, nextProducts] = await Promise.all([
        apiRequest('/tables', sessionRef, setSession),
        canCreateOrders
          ? apiRequest('/products?status=ACTIVE', sessionRef, setSession)
          : Promise.resolve([]),
      ]);
      setTables(nextTables);
      setProducts(nextProducts);
      if (!selectedId && nextTables.length) setSelectedId(nextTables[0].id);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar mesas e produtos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.access_token, unitId, canCreateOrders]);

  const selectedTable = tables.find((table) => table.id === selectedId);
  const openOrder = selectedTable?.orderTables?.find((link) => link.order)?.order;
  const selectedProducts = products.filter((product) => Number(quantities[product.id] || 0) > 0);

  function changeQuantity(productId, delta) {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.max(0, Number(current[productId] || 0) + delta),
    }));
  }

  async function submitOrder() {
    if (!selectedTable || !selectedProducts.length) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const items = selectedProducts.map((product) => ({
        product_id: product.id,
        quantity: Number(quantities[product.id]),
      }));
      if (openOrder) {
        for (const item of items) {
          await apiRequest(`/orders/${openOrder.id}/items`, sessionRef, setSession, requestOptions('POST', item));
        }
      } else {
        await apiRequest('/orders', sessionRef, setSession, requestOptions('POST', {
          order_type: 'DINE_IN',
          table_id: selectedTable.id,
          items,
        }));
      }
      setQuantities({});
      setMessage(openOrder ? 'Itens adicionados à comanda.' : 'Comanda aberta e enviada à cozinha.');
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível registrar o pedido.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen eyebrow="SALÃO" title="Mesas e comandas" subtitle="Selecione uma mesa para abrir ou atualizar a comanda." onRefresh={() => void load()} loading={loading}>
      <Notice error={error} />
      {message ? <Text style={styles.successText}>{message}</Text> : null}
      {tables.length ? <View style={styles.chipRow}>{tables.map((table) => (
        <Pressable key={table.id} onPress={() => { setSelectedId(table.id); setQuantities({}); setMessage(''); }} style={[styles.tableChip, selectedId === table.id && styles.tableChipSelected]}>
          <Text style={[styles.tableChipTitle, selectedId === table.id && styles.tableChipTitleSelected]}>{table.name || `Mesa ${table.number}`}</Text>
          <Text style={[styles.tableChipStatus, selectedId === table.id && styles.tableChipTitleSelected]}>{statusName(table.status)}</Text>
        </Pressable>
      ))}</View> : <Text style={styles.emptyText}>Nenhuma mesa cadastrada nesta unidade.</Text>}
      {selectedTable ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>{selectedTable.name || `Mesa ${selectedTable.number}`}</Text>
        {openOrder ? <Text style={styles.mutedText}>Comanda #{openOrder.orderNumber} · {statusName(openOrder.status)} · {money(openOrder.total)}</Text> : <Text style={styles.mutedText}>Mesa {statusName(selectedTable.status).toLocaleLowerCase('pt-BR')}</Text>}
        {!canCreateOrders ? <Text style={styles.mutedText}>Seu perfil permite consultar mesas, mas não abrir comandas.</Text> : selectedTable.status === 'BLOCKED' || selectedTable.status === 'RESERVED' ? <Text style={styles.mutedText}>Esta mesa não pode receber pedidos agora.</Text> : <>
          <Text style={styles.sectionTitle}>Adicionar produtos</Text>
          {products.map((product) => {
            const productUnit = product.productUnits?.find((item) => item.unitId === unitId) || product.productUnits?.[0];
            const quantity = Number(quantities[product.id] || 0);
            return <View key={product.id} style={styles.productRow}>
              <View style={styles.rowCopy}><Text style={styles.rowTitle}>{product.name}</Text><Text style={styles.mutedText}>{money(productUnit?.price)}</Text></View>
              <View style={styles.quantityControls}>
                <Pressable accessibilityLabel={`Remover ${product.name}`} onPress={() => changeQuantity(product.id, -1)} style={styles.quantityButton}><Text style={styles.quantityText}>−</Text></Pressable>
                <Text style={styles.quantityValue}>{quantity}</Text>
                <Pressable accessibilityLabel={`Adicionar ${product.name}`} onPress={() => changeQuantity(product.id, 1)} style={styles.quantityButton}><Text style={styles.quantityText}>＋</Text></Pressable>
              </View>
            </View>;
          })}
          <Button title={busy ? 'Salvando...' : openOrder ? 'Adicionar à comanda' : 'Abrir comanda'} disabled={busy || !selectedProducts.length} onPress={() => void submitOrder()} />
        </>}</View> : null}
    </Screen>
  );
}

function expectedCash(cashSession) {
  return Number(cashSession.openingAmount || 0) + (cashSession.cashMovements || []).reduce((total, movement) => {
    const amount = Number(movement.amount || 0);
    return ['WITHDRAWAL', 'REFUND'].includes(movement.type) ? total - amount : total + amount;
  }, 0);
}

function CashScreen({ session, sessionRef, setSession, canOpen, canMove, canClose }) {
  const [registers, setRegisters] = useState([]);
  const [cashSession, setCashSession] = useState(null);
  const [openingAmount, setOpeningAmount] = useState('0');
  const [movementAmount, setMovementAmount] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const [description, setDescription] = useState('');
  const [movementType, setMovementType] = useState('DEPOSIT');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [current, nextRegisters] = await Promise.all([
        apiRequest('/cash-sessions/current', sessionRef, setSession),
        apiRequest('/cash-sessions/registers', sessionRef, setSession),
      ]);
      setCashSession(current);
      setRegisters(nextRegisters);
      if (current) setCountedAmount(String(expectedCash(current).toFixed(2)));
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar o caixa.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.access_token]);

  async function perform(path, options, successMessage) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(path, sessionRef, setSession, options);
      setMessage(successMessage);
      await load();
    } catch (actionError) {
      setError(actionError.message || 'Não foi possível atualizar o caixa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen eyebrow="CAIXA" title="Sessão de caixa" subtitle="Abra, movimente e confira o caixa do seu turno." onRefresh={() => void load()} loading={loading}>
      <Notice error={error} />
      {message ? <Text style={styles.successText}>{message}</Text> : null}
      {!cashSession ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>Abrir caixa</Text>
        {!registers.length ? <Text style={styles.emptyText}>Nenhum caixa disponível para esta unidade.</Text> : registers.map((register) => (
          <View key={register.id} style={styles.productRow}>
            <View style={styles.rowCopy}><Text style={styles.rowTitle}>{register.name}</Text><Text style={styles.mutedText}>{statusName(register.status)}</Text></View>
            {canOpen ? <Button title="Abrir" disabled={busy || register.status === 'OPEN'} onPress={() => void perform('/cash-sessions/open', requestOptions('POST', { cash_register_id: register.id, opening_amount: Number(openingAmount.replace(',', '.')) || 0 }), 'Sessão de caixa aberta.')} /> : null}
          </View>
        ))}
        {canOpen ? <Field label="Fundo inicial" value={openingAmount} onChangeText={setOpeningAmount} keyboardType="decimal-pad" placeholder="0,00" /> : null}
        {!canOpen ? <Text style={styles.mutedText}>Seu perfil pode consultar caixas, mas não abrir uma sessão.</Text> : null}
      </View> : <View style={styles.section}>
        <Text style={styles.sectionTitle}>{cashSession.cashRegister?.name || 'Caixa aberto'}</Text>
        <View style={styles.hero}><Text style={styles.heroLabel}>Saldo esperado</Text><Text style={styles.heroAmount}>{money(expectedCash(cashSession))}</Text></View>
        {canMove ? <>
        <Text style={styles.sectionTitle}>Movimentação</Text>
        <View style={styles.choiceRow}>
          {['DEPOSIT', 'WITHDRAWAL'].map((type) => <Pressable key={type} onPress={() => setMovementType(type)} style={[styles.choice, movementType === type && styles.choiceSelected]}><Text style={[styles.choiceText, movementType === type && styles.choiceTextSelected]}>{type === 'DEPOSIT' ? 'Suprimento' : 'Sangria'}</Text></Pressable>)}
        </View>
        <Field label="Valor" value={movementAmount} onChangeText={setMovementAmount} keyboardType="decimal-pad" placeholder="0,00" />
        <Field label="Descrição" value={description} onChangeText={setDescription} placeholder="Opcional" />
        <Button title="Registrar movimentação" disabled={busy || Number(movementAmount.replace(',', '.')) <= 0} onPress={() => void perform(`/cash-sessions/${cashSession.id}/movements`, requestOptions('POST', { type: movementType, amount: Number(movementAmount.replace(',', '.')), description }), 'Movimentação registrada.')} />
        </> : null}
        {canClose ? <>
        <Text style={styles.sectionTitle}>Fechar caixa</Text>
        <Field label="Valor contado" value={countedAmount} onChangeText={setCountedAmount} keyboardType="decimal-pad" placeholder="0,00" />
        <Button title="Encerrar sessão" danger disabled={busy || countedAmount === ''} onPress={() => void perform(`/cash-sessions/${cashSession.id}/close`, requestOptions('PATCH', { counted_amount: Number(countedAmount.replace(',', '.')) }), 'Sessão encerrada.')} />
        </> : null}
      </View>}
    </Screen>
  );
}

function KitchenScreen({ session, sessionRef, setSession, canUpdate }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setTickets(await apiRequest('/kitchen-tickets?status=WAITING,PREPARING,READY', sessionRef, setSession));
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar os tickets.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.access_token]);

  async function advance(ticket, status) {
    setBusyId(ticket.id);
    setError('');
    try {
      await apiRequest(`/kitchen-tickets/${ticket.id}/status`, sessionRef, setSession, requestOptions('PATCH', { status }));
      await load();
    } catch (actionError) {
      setError(actionError.message || 'Não foi possível atualizar o ticket.');
    } finally {
      setBusyId('');
    }
  }

  const nextStatus = { WAITING: 'PREPARING', PREPARING: 'READY', READY: 'DELIVERED' };
  const nextLabel = { WAITING: 'Iniciar preparo', PREPARING: 'Marcar pronto', READY: 'Liberar pedido' };
  return (
    <Screen eyebrow="PRODUÇÃO" title="Monitor da cozinha" subtitle="Avance cada ticket conforme a produção." onRefresh={() => void load()} loading={loading}>
      <Notice error={error} />
      {!tickets.length && !loading ? <Text style={styles.emptyText}>Nenhum ticket aguardando ação.</Text> : tickets.map((ticket) => (
        <View key={ticket.id} style={styles.card}>
          <View style={styles.headingRow}><Text style={styles.cardTitle}>Pedido #{ticket.order?.orderNumber ?? '—'}</Text><Text style={styles.statusPill}>{statusName(ticket.status)}</Text></View>
          <Text style={styles.mutedText}>{ticket.order?.orderType || 'Pedido'} · {new Date(ticket.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
          {ticket.order?.notes ? <Text style={styles.noteText}>{ticket.order.notes}</Text> : null}
          {(ticket.kitchenTicketItems || []).map((item) => <View key={item.id} style={styles.ticketItem}><Text style={styles.rowTitle}>{item.orderItem?.quantity}× {item.orderItem?.productName}</Text>{item.orderItem?.notes ? <Text style={styles.mutedText}>{item.orderItem.notes}</Text> : null}</View>)}
          {canUpdate && nextStatus[ticket.status] ? <Button title={busyId === ticket.id ? 'Atualizando...' : nextLabel[ticket.status]} disabled={Boolean(busyId)} onPress={() => void advance(ticket, nextStatus[ticket.status])} /> : null}
        </View>
      ))}
    </Screen>
  );
}

function DeliveryScreen({ session, sessionRef, setSession, canUpdate, canAssign }) {
  const [deliveries, setDeliveries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverSelections, setDriverSelections] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const nextDeliveries = await apiRequest('/deliveries', sessionRef, setSession);
      setDeliveries(nextDeliveries);
      if (canAssign) {
        try {
          setDrivers(await apiRequest('/delivery-drivers', sessionRef, setSession));
        } catch {
          setDrivers([]);
        }
      }
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar as entregas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.access_token]);

  async function updateStatus(delivery, status) {
    setBusyId(delivery.id);
    setError('');
    try {
      await apiRequest(`/deliveries/${delivery.id}/status`, sessionRef, setSession, requestOptions('PATCH', { status }));
      await load();
    } catch (actionError) {
      setError(actionError.message || 'Não foi possível atualizar a entrega.');
    } finally {
      setBusyId('');
    }
  }

  async function assignDriver(delivery) {
    const driverId = driverSelections[delivery.id];
    if (!driverId) return;
    setBusyId(delivery.id);
    setError('');
    try {
      await apiRequest(`/deliveries/${delivery.id}/driver`, sessionRef, setSession, requestOptions('PATCH', { driver_id: driverId }));
      await load();
    } catch (actionError) {
      setError(actionError.message || 'Não foi possível atribuir o entregador.');
    } finally {
      setBusyId('');
    }
  }

  const nextStatus = { PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY', READY: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
  const nextLabel = { PENDING: 'Confirmar', CONFIRMED: 'Iniciar preparo', PREPARING: 'Marcar pronto', READY: 'Iniciar rota', OUT_FOR_DELIVERY: 'Marcar entregue' };
  return (
    <Screen eyebrow="LOGÍSTICA" title="Entregas" subtitle="Acompanhe pedidos e atualize cada etapa." onRefresh={() => void load()} loading={loading}>
      <Notice error={error} />
      {!deliveries.length && !loading ? <Text style={styles.emptyText}>Nenhuma entrega cadastrada.</Text> : deliveries.map((delivery) => {
        const address = delivery.address;
        const next = nextStatus[delivery.status];
        const canStartRoute = delivery.status !== 'READY' || delivery.driver;
        return <View key={delivery.id} style={styles.card}>
          <View style={styles.headingRow}><Text style={styles.cardTitle}>Pedido #{delivery.order?.orderNumber ?? '—'}</Text><Text style={styles.statusPill}>{statusName(delivery.status)}</Text></View>
          <Text style={styles.rowTitle}>{address?.street || address?.streetName || 'Endereço'}{address?.number ? `, ${address.number}` : ''}</Text>
          <Text style={styles.mutedText}>{[address?.neighborhood, address?.city].filter(Boolean).join(' · ') || 'Endereço de entrega'}</Text>
          {address?.complement ? <Text style={styles.mutedText}>{address.complement}</Text> : null}
          <View style={styles.headingRow}><Text style={styles.mutedText}>Entregador: {delivery.driver?.name || 'Não atribuído'}</Text><Text style={styles.rowTitle}>{money(delivery.order?.total)}</Text></View>
          {canAssign && !delivery.driver && drivers.length ? <View style={styles.driverPicker}><Text style={styles.fieldLabel}>Atribuir entregador</Text>{drivers.map((driver) => <Pressable key={driver.id} onPress={() => setDriverSelections((current) => ({ ...current, [delivery.id]: driver.id }))} style={[styles.driverOption, driverSelections[delivery.id] === driver.id && styles.driverOptionSelected]}><Text style={styles.rowTitle}>{driver.name}</Text><Text style={styles.mutedText}>{driver.vehicle || driver.phone}</Text></Pressable>)}<Button title="Atribuir" secondary disabled={!driverSelections[delivery.id] || busyId === delivery.id} onPress={() => void assignDriver(delivery)} /></View> : null}
          {canUpdate && next && canStartRoute ? <Button title={busyId === delivery.id ? 'Atualizando...' : nextLabel[delivery.status]} disabled={Boolean(busyId)} onPress={() => void updateStatus(delivery, next)} /> : null}
        </View>;
      })}
    </Screen>
  );
}

function OperationalTabs({ session, sessionRef, setSession, onSignOut }) {
  const roles = session.user.roles || [];
  const permissions = session.user.permissions || [];
  const isAdmin = roles.includes('ADMIN') || roles.includes('PROPRIETARIO');
  const can = (permission) => isAdmin || permissions.includes(permission);
  const routes = useMemo(() => [
    { name: 'Início', icon: '⌂', show: true, screen: () => <HomeScreen session={session} onSignOut={onSignOut} /> },
    { name: 'Mesas', icon: '◉', show: can('tables.read'), screen: () => <TablesScreen session={session} sessionRef={sessionRef} setSession={setSession} canCreateOrders={can('orders.create') && can('products.read')} /> },
    { name: 'Caixa', icon: '▣', show: can('cash.read'), screen: () => <CashScreen session={session} sessionRef={sessionRef} setSession={setSession} canOpen={can('cash.open')} canMove={can('cash.movement')} canClose={can('cash.close')} /> },
    { name: 'KDS', icon: '▤', show: can('kitchen.view'), screen: () => <KitchenScreen session={session} sessionRef={sessionRef} setSession={setSession} canUpdate={can('kitchen.update')} /> },
    { name: 'Rotas', icon: '➜', show: can('delivery.read'), screen: () => <DeliveryScreen session={session} sessionRef={sessionRef} setSession={setSession} canUpdate={can('delivery.update')} canAssign={can('delivery.assign') && can('delivery.drivers.read')} /> },
  ].filter((route) => route.show), [session, sessionRef, setSession, onSignOut, hasCash, permissions, roles]);

  return (
    <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.green, tabBarInactiveTintColor: palette.muted, tabBarStyle: styles.tabBar, tabBarLabelStyle: styles.tabLabel }}>
      {routes.map((route) => <Tabs.Screen key={route.name} name={route.name}>{() => route.screen()}</Tabs.Screen>)}
    </Tabs.Navigator>
  );
}

export default function OperationalApp() {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  function updateSession(nextSession) {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }
  if (!session) return <LoginScreen onAuthenticated={updateSession} />;
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Operacional">
          {() => <OperationalTabs session={session} sessionRef={sessionRef} setSession={updateSession} onSignOut={() => updateSession(null)} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loginScreen: { backgroundColor: palette.ink, flexGrow: 1, justifyContent: 'center', padding: 26 },
  loginMark: { alignItems: 'center', backgroundColor: '#f1a361', borderRadius: 10, height: 48, justifyContent: 'center', marginBottom: 22, width: 48 },
  loginMarkText: { color: palette.ink, fontSize: 24, fontWeight: '800' },
  kicker: { color: palette.green, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  loginTitle: { color: palette.white, fontSize: 31, fontWeight: '800', lineHeight: 37 },
  loginSubtitle: { color: '#bed0c4', fontSize: 15, lineHeight: 22, marginTop: 12 },
  loginForm: { gap: 12, marginTop: 28 },
  screen: { backgroundColor: palette.paper, flexGrow: 1, padding: 20 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headingCopy: { flex: 1 },
  title: { color: palette.ink, fontSize: 27, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginBottom: 18, marginTop: 7 },
  refreshButton: { alignItems: 'center', backgroundColor: palette.pale, borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  refreshText: { color: palette.green, fontSize: 24 },
  loader: { marginVertical: 24 },
  field: { gap: 6, marginBottom: 10 },
  fieldLabel: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  input: { backgroundColor: palette.white, borderColor: palette.line, borderRadius: 8, borderWidth: 1, color: palette.ink, minHeight: 46, paddingHorizontal: 13 },
  button: { alignItems: 'center', backgroundColor: palette.green, borderRadius: 8, justifyContent: 'center', marginTop: 10, minHeight: 46, paddingHorizontal: 14 },
  buttonText: { color: palette.white, fontSize: 14, fontWeight: '800' },
  buttonSecondary: { backgroundColor: palette.pale },
  buttonSecondaryText: { color: palette.green },
  buttonDanger: { backgroundColor: '#f8e5e1' },
  buttonDangerText: { color: palette.red },
  buttonDisabled: { opacity: 0.45 },
  notice: { backgroundColor: '#fff1ef', borderColor: '#f0c6c0', borderRadius: 8, borderWidth: 1, marginBottom: 12, padding: 12 },
  noticeText: { color: palette.red, fontSize: 13, lineHeight: 19 },
  noticeClose: { color: palette.red, fontSize: 12, fontWeight: '800', marginTop: 8 },
  successText: { color: palette.green, fontSize: 13, fontWeight: '700', marginBottom: 12 },
  emptyText: { color: palette.muted, fontSize: 14, lineHeight: 21, paddingVertical: 20, textAlign: 'center' },
  mutedText: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  hero: { backgroundColor: palette.ink, borderRadius: 8, marginBottom: 14, padding: 18 },
  heroTitle: { color: palette.white, fontSize: 18, fontWeight: '800' },
  heroText: { color: '#bed0c4', fontSize: 13, marginTop: 6 },
  heroLabel: { color: '#bed0c4', fontSize: 12 },
  heroAmount: { color: palette.white, fontSize: 27, fontWeight: '800', marginTop: 5 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  stat: { backgroundColor: palette.white, borderColor: palette.line, borderRadius: 8, borderWidth: 1, flex: 1, padding: 14 },
  statValue: { color: palette.green, fontSize: 21, fontWeight: '800' },
  statLabel: { color: palette.muted, fontSize: 11, marginTop: 3 },
  section: { backgroundColor: palette.white, borderColor: palette.line, borderRadius: 8, borderWidth: 1, marginTop: 14, padding: 14 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', marginBottom: 10, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tableChip: { backgroundColor: palette.white, borderColor: palette.line, borderRadius: 8, borderWidth: 1, minWidth: 105, padding: 11 },
  tableChipSelected: { backgroundColor: palette.green, borderColor: palette.green },
  tableChipTitle: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  tableChipTitleSelected: { color: palette.white },
  tableChipStatus: { color: palette.muted, fontSize: 10, marginTop: 4 },
  productRow: { alignItems: 'center', borderBottomColor: palette.line, borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 11 },
  rowCopy: { flex: 1 },
  rowTitle: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  quantityControls: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  quantityButton: { alignItems: 'center', backgroundColor: palette.pale, borderRadius: 7, height: 32, justifyContent: 'center', width: 32 },
  quantityText: { color: palette.green, fontSize: 17, fontWeight: '800' },
  quantityValue: { color: palette.ink, fontSize: 14, minWidth: 18, textAlign: 'center' },
  choiceRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  choice: { backgroundColor: palette.white, borderColor: palette.line, borderRadius: 8, borderWidth: 1, flex: 1, padding: 11 },
  choiceSelected: { backgroundColor: palette.pale, borderColor: palette.green },
  choiceText: { color: palette.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  choiceTextSelected: { color: palette.green },
  card: { backgroundColor: palette.white, borderColor: palette.line, borderRadius: 8, borderWidth: 1, marginBottom: 12, padding: 14 },
  cardTitle: { color: palette.ink, flex: 1, fontSize: 16, fontWeight: '800' },
  statusPill: { backgroundColor: palette.pale, borderRadius: 8, color: palette.green, fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 6 },
  noteText: { color: palette.orange, fontSize: 12, marginTop: 8 },
  ticketItem: { borderTopColor: palette.line, borderTopWidth: 1, marginTop: 9, paddingTop: 9 },
  driverPicker: { borderTopColor: palette.line, borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  driverOption: { borderColor: palette.line, borderRadius: 8, borderWidth: 1, marginTop: 7, padding: 10 },
  driverOptionSelected: { backgroundColor: palette.pale, borderColor: palette.green },
  tabBar: { borderTopColor: palette.line, height: 62, paddingBottom: 7, paddingTop: 5 },
  tabLabel: { fontSize: 10, fontWeight: '700' },
});