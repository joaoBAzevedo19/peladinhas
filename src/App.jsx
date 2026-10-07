// App shell: top bar, routes and bottom navigation.
import { useData } from './data/DataContext.jsx';
import { useHashRoute } from './hooks/useHashRoute.js';
import { Toast } from './components/ui.jsx';
import { CalendarIcon, HistoryIcon, TableIcon, SettingsIcon, LogoutIcon } from './components/Icons.jsx';
import { signOut } from './lib/api/index.js';
import Upcoming from './pages/Upcoming.jsx';
import History from './pages/History.jsx';
import Standings from './pages/Standings.jsx';
import MatchDetail from './pages/MatchDetail.jsx';
import MatchForm from './pages/MatchForm.jsx';
import TeamsForm from './pages/TeamsForm.jsx';
import Admin from './pages/Admin.jsx';
import PinLogin from './pages/PinLogin.jsx';

const TABS = [
  { href: '#/jogos', match: ['jogos', 'jogo', 'novo'], label: 'Jogos', Icon: CalendarIcon },
  { href: '#/historico', match: ['historico'], label: 'Histórico', Icon: HistoryIcon },
  { href: '#/classificacao', match: ['classificacao'], label: 'Classificação', Icon: TableIcon },
  { href: '#/gerir', match: ['gerir'], label: 'Gerir', Icon: SettingsIcon, adminOnly: true },
];

function AdminOnly({ children }) {
  const { isAdmin, session } = useData();
  if (isAdmin) return children;
  return (
    <div className="page">
      <div className="empty">
        <p className="empty-title">Esta página é só para o administrador.</p>
        {!session && <a className="btn btn-primary" href="#/gerir">Entrar</a>}
      </div>
    </div>
  );
}

function Routes({ route }) {
  const [first, second, third] = route.segments;
  switch (first) {
    case 'historico':
      return <History query={route.query} />;
    case 'classificacao':
      return <Standings />;
    case 'gerir':
      return <Admin />;
    case 'novo':
      return (
        <AdminOnly>
          <MatchForm key="new" mode="new" />
        </AdminOnly>
      );
    case 'jogo':
      if (third === 'equipas') {
        return (
          <AdminOnly>
            <TeamsForm key={second} id={second} />
          </AdminOnly>
        );
      }
      if (third === 'editar' || third === 'resultado') {
        return (
          <AdminOnly>
            <MatchForm key={`${second}-${third}`} id={second} mode={third === 'resultado' ? 'result' : 'edit'} />
          </AdminOnly>
        );
      }
      return <MatchDetail id={second} />;
    default:
      return <Upcoming />;
  }
}

export default function App() {
  const route = useHashRoute();
  const { status, error, reload, toast, dismissToast, mode, isAdmin, session, authReady } = useData();
  const current = route.segments[0] || 'jogos';

  // Everyone enters with a PIN (guest or admin) before seeing the app.
  if (!authReady) return <p className="loading">A carregar…</p>;
  if (!session) return <PinLogin />;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/jogos">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="2.2" fill="var(--team-a)" />
            <path d="M12 2v20" stroke="currentColor" strokeWidth="2" opacity=".45" />
          </svg>
          Peladinhas
        </a>
        {isAdmin ? (
          <span className="admin-pill">Administrador</span>
        ) : (
          <div className="topbar-user">
            <span className="admin-pill">Convidado</span>
            <button type="button" className="topbar-logout" onClick={signOut} aria-label="Sair">
              <LogoutIcon />
            </button>
          </div>
        )}
      </header>

      {mode === 'demo' && (
        <p className="demo-banner">Modo demonstração: os dados ficam guardados só neste dispositivo.</p>
      )}

      <main className="main">
        {status === 'loading' && <p className="loading">A carregar os jogos…</p>}
        {status === 'error' && (
          <div className="page">
            <div className="empty">
              <p className="empty-title">Não foi possível carregar os dados.</p>
              <p>{error}</p>
              <button type="button" className="btn btn-primary" onClick={() => reload().catch(() => {})}>
                Tentar novamente
              </button>
            </div>
          </div>
        )}
        {status === 'ready' && <Routes route={route} />}
      </main>

      <Toast toast={toast} onDismiss={dismissToast} />

      <nav className="tabbar" aria-label="Navegação principal">
        {TABS.filter((tab) => isAdmin || !tab.adminOnly).map(({ href, match, label, Icon }) => {
          const active = match.includes(current);
          return (
            <a key={href} href={href} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>
              <Icon />
              <span>{label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
