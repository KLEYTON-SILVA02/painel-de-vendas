import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ConquistaCelebrationHost } from '../../components/ConquistaCelebration';
import {
  BagIcon,
  CpuIcon,
  DropletIcon,
  HexagonIcon,
  HomeIcon,
  LeafIcon,
  PillIcon,
  RefreshIcon,
  SettingsIcon,
  TagIcon,
  TargetIcon,
  TrophyIcon,
} from '../../components/icons/NavIcons';
import type { Horario } from '../../lib/business/horario';
import { useStore, useStoreSettings } from '../../lib/queries';
import { AdminLandingPage } from '../admin/AdminLandingPage';
import { AuditoriaPage } from '../admin/AuditoriaPage';
import { BackupPage } from '../admin/BackupPage';
import { ColaboradoresPage } from '../admin/ColaboradoresPage';
import { ConfiguracoesPage } from '../admin/ConfiguracoesPage';
import { MinhaLojaPage } from '../admin/MinhaLojaPage';
import { ProdutosPage } from '../admin/ProdutosPage';
import { BioPage } from '../bio/BioPage';
import { CategoryPage } from '../category/CategoryPage';
import { ConquistasPage } from '../conquistas/ConquistasPage';
import { DinamicasPage } from '../dinamicas/DinamicasPage';
import { MetasPage } from '../metas/MetasPage';
import { MobileClosingTimer } from './MobileClosingTimer';
import { MobileDermoPage } from './MobileDermoPage';
import { MobileExclusivasPage } from './MobileExclusivasPage';
import { MobileGenericosPage } from './MobileGenericosPage';
import { MobileInicioPage } from './MobileInicioPage';
import { MobileRankingPage } from './MobileRankingPage';

// Mobile v2 admin shell: the spec's sticky topbar + horizontal category
// icon menu, replacing the desktop Sidebar below the 1024px breakpoint
// (see useIsMobileV2 / AppShell.tsx). Each screen migrates from its
// existing desktop component to a dedicated mv2-styled one as it's
// redesigned — until then the route falls back to the desktop page so
// navigation always works, just not yet in the new visual style.
const CATEGORIES = [
  { to: '/', end: true, cls: 'mv2-cat-inicio', Icon: HomeIcon, label: 'Início' },
  { to: '/ranking', end: false, cls: 'mv2-cat-ranking', Icon: TrophyIcon, label: 'Ranking' },
  { to: '/categoria/DERM', end: false, cls: 'mv2-cat-dermo', Icon: DropletIcon, label: 'Dermo' },
  { to: '/categoria/GEN', end: false, cls: 'mv2-cat-generico', Icon: PillIcon, label: 'Gen/Sim' },
  { to: '/categoria/MP', end: false, cls: 'mv2-cat-exclusiva', Icon: TagIcon, label: 'Marcas Excl.' },
  { to: '/categoria/MER', end: false, cls: 'mv2-cat-mercgeral', Icon: BagIcon, label: 'Merc. Geral' },
  { to: '/categoria/LEVMEL', end: false, cls: 'mv2-cat-levmel', Icon: HexagonIcon, label: 'Levmel' },
  { to: '/categoria/CHIP', end: false, cls: 'mv2-cat-chip', Icon: CpuIcon, label: 'Chip' },
  { to: '/bio', end: false, cls: 'mv2-cat-biosintetica', Icon: LeafIcon, label: 'Biosintética' },
  { to: '/dinamicas', end: false, cls: 'mv2-cat-dinamicas', Icon: TargetIcon, label: 'Dinâmicas' },
  { to: '/admin', end: false, cls: 'mv2-cat-adm', Icon: SettingsIcon, label: 'ADM' },
] as const;

// xlsx is a large parsing library — only the Importar screen needs it (same
// lazy-chunk rationale as the desktop shell).
const ImportarPage = lazy(() => import('../admin/ImportarPage').then((m) => ({ default: m.ImportarPage })));

export function MobileAdminShell() {
  const { signOut } = useAuth();
  const { data: store } = useStore();
  const { data: storeSettings } = useStoreSettings();

  return (
    <div className="mv2" style={{ minHeight: '100vh' }}>
      <ConquistaCelebrationHost />
      <header className="mv2-topbar">
        <div className="mv2-store-info" title={store?.nome_loja || undefined}>
          🛍️ {store?.nome_loja || 'Gestão de Vendas'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {storeSettings && (
            <MobileClosingTimer horario={storeSettings.horario as unknown as Horario} feriadosDatas={storeSettings.feriados_datas} />
          )}
          <button className="mv2-icon-btn" title="Atualizar" onClick={() => window.location.reload()}>
            <RefreshIcon width={14} height={14} />
          </button>
          <button className="mv2-icon-btn" title="Sair" onClick={() => signOut()}>
            ⏻
          </button>
        </div>
      </header>

      <nav className="mv2-category-menu">
        {CATEGORIES.map((c) => (
          <NavLink key={c.to} to={c.to} end={c.end} title={c.label} className={({ isActive }) => `mv2-cat-icon ${c.cls} ${isActive ? 'active' : ''}`}>
            <c.Icon width={16} height={16} />
          </NavLink>
        ))}
      </nav>

      <main style={{ paddingBottom: 24 }}>
        <Routes>
          <Route path="/" element={<MobileInicioPage />} />
          <Route path="/ranking" element={<MobileRankingPage />} />
          <Route path="/categoria/DERM" element={<MobileDermoPage />} />
          <Route path="/categoria/GEN" element={<MobileGenericosPage />} />
          <Route path="/categoria/MP" element={<MobileExclusivasPage />} />
          <Route path="/categoria/MER" element={<CategoryPage catKey="MER" />} />
          <Route path="/categoria/LEVMEL" element={<CategoryPage catKey="LEVMEL" />} />
          <Route path="/categoria/CHIP" element={<CategoryPage catKey="CHIP" />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/dinamicas" element={<DinamicasPage />} />
          <Route path="/bio" element={<BioPage />} />
          <Route path="/conquistas" element={<ConquistasPage />} />
          <Route path="/admin" element={<AdminLandingPage />} />
          <Route path="/admin/colaboradores" element={<ColaboradoresPage />} />
          <Route path="/admin/produtos" element={<ProdutosPage />} />
          <Route
            path="/admin/importar"
            element={
              <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>}>
                <ImportarPage />
              </Suspense>
            }
          />
          <Route path="/admin/auditoria" element={<AuditoriaPage />} />
          <Route path="/admin/backup" element={<BackupPage />} />
          <Route path="/admin/minha-loja" element={<MinhaLojaPage />} />
          <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
        </Routes>
      </main>
    </div>
  );
}
