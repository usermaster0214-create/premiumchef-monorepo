'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type NavigationSession = {
  user: {
    permissions: string[];
    platform_admin?: boolean;
  };
};

const sessionKey = 'premiumchef.session';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<NavigationSession | null>(null);

  useEffect(() => {
    function restoreSession() {
      const saved = window.sessionStorage.getItem(sessionKey);
      if (!saved) {
        setSession(null);
        return;
      }

      try {
        setSession(JSON.parse(saved) as NavigationSession);
      } catch {
        window.sessionStorage.removeItem(sessionKey);
        setSession(null);
      }
    }

    restoreSession();
    window.addEventListener('premiumchef:session-change', restoreSession);
    return () => window.removeEventListener('premiumchef:session-change', restoreSession);
  }, [pathname]);

  if (!session || pathname === '/delivery') return children;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link aria-label="PremiumChef, catálogo" className="brand" href="/">
          <span className="brand-mark">P</span>
          <span className="brand-copy">
            <span className="brand-name">PremiumChef</span>
            <span className="brand-subtitle">Painel de operação</span>
          </span>
        </Link>
        <div className="nav-label">Operação e cadastros</div>
        <nav className="nav-list" aria-label="Navegação principal">
          <Link aria-current={pathname === '/pos' ? 'page' : undefined} className={`nav-button ${pathname === '/pos' ? 'active' : ''}`} href="/pos"><span className="nav-glyph">▤</span><span className="nav-text">PDV</span></Link>
          <Link aria-current={pathname === '/tables' ? 'page' : undefined} className={`nav-button ${pathname === '/tables' ? 'active' : ''}`} href="/tables"><span className="nav-glyph">◉</span><span className="nav-text">Mesas</span></Link>
          <Link aria-current={pathname === '/kds' ? 'page' : undefined} className={`nav-button ${pathname === '/kds' ? 'active' : ''}`} href="/kds"><span className="nav-glyph">▤</span><span className="nav-text">KDS</span></Link>
          <Link aria-current={pathname === '/delivery-ops' ? 'page' : undefined} className={`nav-button ${pathname === '/delivery-ops' ? 'active' : ''}`} href="/delivery-ops"><span className="nav-glyph">➜</span><span className="nav-text">Entregas</span></Link>
          <Link aria-current={pathname === '/reports' ? 'page' : undefined} className={`nav-button ${pathname === '/reports' ? 'active' : ''}`} href="/reports"><span className="nav-glyph">▥</span><span className="nav-text">Relatórios</span></Link>
          {session.user.permissions.includes('cash.read') && <Link aria-current={pathname === '/cash' ? 'page' : undefined} className={`nav-button ${pathname === '/cash' ? 'active' : ''}`} href="/cash"><span className="nav-glyph">$</span><span className="nav-text">Caixa e vendas</span></Link>}
          {session.user.permissions.includes('users.read') && <Link aria-current={pathname === '/users' ? 'page' : undefined} className={`nav-button ${pathname === '/users' ? 'active' : ''}`} href="/users"><span className="nav-glyph">☺</span><span className="nav-text">Usuários</span></Link>}
          {session.user.platform_admin && <Link aria-current={pathname === '/companies' ? 'page' : undefined} className={`nav-button ${pathname === '/companies' ? 'active' : ''}`} href="/companies"><span className="nav-glyph">▣</span><span className="nav-text">Empresas</span></Link>}
          <Link aria-current={pathname === '/' ? 'page' : undefined} className={`nav-button ${pathname === '/' ? 'active' : ''}`} href="/"><span className="nav-glyph">▦</span><span className="nav-text">Catálogo</span></Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">Painel de operação PremiumChef.</div>
      </aside>
      <div className="main-column">{children}</div>
    </div>
  );
}