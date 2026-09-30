import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const apiBase = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();
const palette = { ink: '#173d30', green: '#1f654b', pale: '#e6f1eb', paper: '#f4f7f4', muted: '#708078', orange: '#d7793f', white: '#fff' };

function LoginScreen({ onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${apiBase}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(', ') : result.message || 'Não foi possível entrar.');
      onAuthenticated(result);
    } catch (loginError) { setError(loginError.message || 'Não foi possível entrar.'); } finally { setBusy(false); }
  }
  return <View style={styles.loginScreen}><View style={styles.loginMark}><Text style={styles.loginMarkText}>P</Text></View><Text style={styles.kicker}>PREMIUMCHEF OPERACIONAL</Text><Text style={styles.loginTitle}>Seu turno, no ritmo da operação.</Text><Text style={styles.loginSubtitle}>Acesse as ferramentas liberadas para o seu perfil.</Text><View style={styles.form}><TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="E-mail" placeholderTextColor="#8b9b91" style={styles.input} value={email} onChangeText={setEmail} /><TextInput autoCapitalize="none" autoComplete="password" placeholder="Senha" placeholderTextColor="#8b9b91" secureTextEntry style={styles.input} value={password} onChangeText={setPassword} />{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={busy} onPress={signIn} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{busy ? 'Entrando...' : 'Entrar'}</Text></Pressable></View></View>;
}

function HomeScreen({ session }) {
  return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.kicker}>TURNO ATUAL</Text><Text style={styles.title}>Olá, {session.user.name.split(' ')[0]}.</Text><Text style={styles.subtitle}>Escolha uma operação abaixo para começar.</Text><View style={styles.hero}><Text style={styles.heroTitle}>Operação em ordem</Text><Text style={styles.heroText}>Seu acesso mostra apenas as áreas autorizadas pela sua função.</Text></View><View style={styles.statRow}><View style={styles.stat}><Text style={styles.statValue}>{session.user.units.length}</Text><Text style={styles.statLabel}>unidades</Text></View><View style={styles.stat}><Text style={styles.statValue}>{session.user.roles.length}</Text><Text style={styles.statLabel}>perfis</Text></View><View style={styles.stat}><Text style={styles.statValue}>{session.user.permissions.length}</Text><Text style={styles.statLabel}>permissões</Text></View></View></ScrollView>;
}

function OperationScreen({ title, eyebrow, accent, items }) {
  return <ScrollView contentContainerStyle={styles.screen}><Text style={styles.kicker}>{eyebrow}</Text><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>Acompanhe e execute as tarefas do seu turno.</Text><View style={styles.operationList}>{items.map((item) => <Pressable key={item.title} style={styles.operationCard}><View style={[styles.operationIcon, { backgroundColor: accent }]}><Text style={styles.operationIconText}>{item.icon}</Text></View><View style={styles.operationCopy}><Text style={styles.operationTitle}>{item.title}</Text><Text style={styles.operationText}>{item.text}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}</View></ScrollView>;
}

function OperationalTabs({ session }) {
  const roles = session.user.roles || [];
  const permissions = session.user.permissions || [];
  const can = (permission) => permissions.includes(permission) || roles.includes('ADMIN') || roles.includes('PROPRIETARIO');
  const tabs = useMemo(() => {
    const result = [{ name: 'Início', icon: '⌂', component: () => <HomeScreen session={session} /> }];
    if (can('orders.create') || roles.includes('GARCOM')) result.push({ name: 'Mesas', icon: '◉', component: () => <OperationScreen title="Mesas e comandas" eyebrow="SALÃO" accent="#e6f1eb" items={[{ title: 'Mapa de mesas', text: 'Veja mesas livres, ocupadas e reservadas.', icon: '◉' }, { title: 'Nova comanda', text: 'Abra uma comanda e lance itens.', icon: '+' }]} /> });
    if (can('cash.open') || roles.includes('CAIXA')) result.push({ name: 'Caixa', icon: '▣', component: () => <OperationScreen title="Operação de caixa" eyebrow="CAIXA" accent="#fbede3" items={[{ title: 'Minha sessão', text: 'Acompanhe saldo e movimentações.', icon: '$' }, { title: 'Receber pedido', text: 'Registre pagamentos e finalize vendas.', icon: '✓' }]} /> });
    if (can('kitchen.view') || roles.includes('COZINHA')) result.push({ name: 'KDS', icon: '▤', component: () => <OperationScreen title="Monitor da cozinha" eyebrow="PRODUÇÃO" accent="#e8eef4" items={[{ title: 'Tickets recebidos', text: 'Inicie o preparo dos pedidos.', icon: '1' }, { title: 'Pedidos prontos', text: 'Libere itens para expedição.', icon: '✓' }]} /> });
    if (roles.includes('ENTREGADOR') || can('delivery.read')) result.push({ name: 'Rotas', icon: '➜', component: () => <OperationScreen title="Minhas entregas" eyebrow="LOGÍSTICA" accent="#f3eee5" items={[{ title: 'Chamados disponíveis', text: 'Aceite uma entrega pronta.', icon: '!' }, { title: 'Em rota', text: 'Atualize status e localização.', icon: '➜' }]} /> });
    return result;
  }, [permissions, roles, session]);
  return <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: palette.green, tabBarInactiveTintColor: palette.muted, tabBarStyle: styles.tabBar, tabBarLabelStyle: styles.tabLabel }}>{tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} component={tab.component} options={{ tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>{tab.icon}</Text> }} />)}</Tabs.Navigator>;
}

function AppContent() {
  const [session, setSession] = useState(null);
  if (!session) return <LoginScreen onAuthenticated={setSession} />;
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="Operacional"><OperationalTabs session={session} /></Stack.Screen></Stack.Navigator></NavigationContainer>;
}

export default function App() { return <SafeAreaProvider><AppContent /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  loginScreen: { flex: 1, backgroundColor: palette.ink, justifyContent: 'center', padding: 26 }, loginMark: { alignItems: 'center', backgroundColor: '#f1a361', borderRadius: 12, height: 48, justifyContent: 'center', marginBottom: 22, width: 48 }, loginMarkText: { color: palette.ink, fontSize: 24, fontWeight: '800' }, kicker: { color: palette.green, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 }, loginTitle: { color: palette.white, fontSize: 31, fontWeight: '800', lineHeight: 37 }, loginSubtitle: { color: '#bed0c4', fontSize: 15, lineHeight: 22, marginTop: 12 }, form: { gap: 12, marginTop: 28 }, input: { backgroundColor: '#fff', borderRadius: 8, color: palette.ink, height: 50, paddingHorizontal: 15 }, error: { color: '#ffc2b8', fontSize: 12 }, primaryButton: { alignItems: 'center', backgroundColor: palette.green, borderRadius: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 }, primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' }, screen: { backgroundColor: palette.paper, flexGrow: 1, padding: 22 }, title: { color: palette.ink, fontSize: 28, fontWeight: '800' }, subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginBottom: 20, marginTop: 7 }, hero: { backgroundColor: palette.ink, borderRadius: 14, padding: 20 }, heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800' }, heroText: { color: '#bed0c4', fontSize: 13, lineHeight: 20, marginTop: 8 }, statRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, stat: { backgroundColor: '#fff', borderRadius: 10, flex: 1, padding: 14 }, statValue: { color: palette.green, fontSize: 21, fontWeight: '800' }, statLabel: { color: palette.muted, fontSize: 11, marginTop: 3 }, operationList: { gap: 10 }, operationCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', padding: 15 }, operationIcon: { alignItems: 'center', borderRadius: 10, height: 42, justifyContent: 'center', width: 42 }, operationIconText: { color: palette.ink, fontSize: 17, fontWeight: '800' }, operationCopy: { flex: 1, marginLeft: 12 }, operationTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' }, operationText: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, chevron: { color: palette.muted, fontSize: 25, marginLeft: 8 }, tabBar: { borderTopColor: '#dce5df', height: 62, paddingBottom: 7, paddingTop: 5 }, tabLabel: { fontSize: 10, fontWeight: '700' }, tabIcon: { fontSize: 18 },
+});
