import { Suspense, lazy } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BackButton } from '../../components/BackButton';
import { ConquistaCelebrationHost } from '../../components/ConquistaCelebration';
import { FunctionIcon } from '../../components/icons/FunctionIcon';
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
import { useCategoryTypes, useStore, useStoreSettings } from '../../lib/queries';
import { AdminLandingPage } from '../admin/AdminLandingPage';
import { AuditoriaPage } from '../admin/AuditoriaPage';
import { ListaVendasPage } from '../admin/ListaVendasPage';
import { BackupPage } from '../admin/BackupPage';
import { CardConquistaPage } from '../admin/CardConquistaPage';
import { CategoriasPage } from '../admin/CategoriasPage';
import { ColaboradoresPage } from '../admin/ColaboradoresPage';
import { ConfiguracoesPage } from '../admin/ConfiguracoesPage';
import { IconesPage } from '../admin/IconesPage';
import { MinhaLojaPage } from '../admin/MinhaLojaPage';
import { ProdutosPage } from '../admin/ProdutosPage';
import { VendasArquivadasPage } from '../admin/VendasArquivadasPage';
import { ConquistasPage } from '../conquistas/ConquistasPage';
import { MetasPage } from '../metas/MetasPage';
import { MobileBioPage } from './MobileBioPage';
import { MobileDinamicasPage } from './MobileDinamicasPage';
import { MobileClosingTimer } from './MobileClosingTimer';
import { MobileDermoPage } from './MobileDermoPage';
import { MobileExclusivasPage } from './MobileExclusivasPage';
import { MobileGenericosPage } from './MobileGenericosPage';
import { MobileChipPage } from './MobileChipPage';
import { MobileInicioPage } from './MobileInicioPage';
import { MobileLevmelPage } from './MobileLevmelPage';
import { MobileMercadoriaGeralPage } from './MobileMercadoriaGeralPage';
import { MobileRankingPage } from './MobileRankingPage';

// Mobile v2 admin shell: the spec's sticky topbar + horizontal category
// icon menu, replacing the desktop Sidebar below the 1024px breakpoint
// (see useIsMobileV2 / AppShell.tsx). Each screen migrates from its
// existing desktop component to a dedicated mv2-styled one as it's
// redesigned — until then the route falls back to the desktop page so
// navigation always works, just not yet in the new visual style.
// BIOSINTÉTICA's icon is inserted conditionally in the component body below
// (only when this store has a category_types row for it) instead of being
// listed here — same reasoning as Sidebar.tsx's desktop menu: it's not
// seeded for new stores, so an unconditional entry would be a dead icon for
// every store that never created it.
const CATEGORIES_BEFORE_BIO = [
  { to: '/', end: true, cls: 'mv2-cat-inicio', Icon: HomeIcon, label: 'Início', slot: 'inicio' },
  { to: '/ranking', end: false, cls: 'mv2-cat-ranking', Icon: TrophyIcon, label: 'Ranking', slot: 'ranking' },
  { to: '/categoria/DERM', end: false, cls: 'mv2-cat-dermo', Icon: DropletIcon, label: 'Dermo', slot: 'dermo' },
  { to: '/categoria/GEN', end: false, cls: 'mv2-cat-generico', Icon: PillIcon, label: 'Gen/Sim', slot: 'generico' },
  { to: '/categoria/MP', end: false, cls: 'mv2-cat-exclusiva', Icon: TagIcon, label: 'Marcas Excl.', slot: 'marcas_exclusivas' },
  { to: '/categoria/MER', end: false, cls: 'mv2-cat-mercgeral', Icon: BagIcon, label: 'Merc. Geral', slot: 'mercadoria_geral' },
  { to: '/categoria/LEVMEL', end: false, cls: 'mv2-cat-levmel', Icon: HexagonIcon, label: 'Levmel', slot: 'levmel' },
  { to: '/categoria/CHIP', end: false, cls: 'mv2-cat-chip', Icon: CpuIcon, label: 'Chip', slot: 'chip' },
] as const;

const BIO_CATEGORY = { to: '/bio', end: false, cls: 'mv2-cat-biosintetica', Icon: LeafIcon, label: 'Biosintética', slot: 'biosintetica' } as const;

const CATEGORIES_AFTER_BIO = [
  { to: '/dinamicas', end: false, cls: 'mv2-cat-dinamicas', Icon: TargetIcon, label: 'Dinâmicas', slot: 'dinamicas' },
  { to: '/admin', end: false, cls: 'mv2-cat-adm', Icon: SettingsIcon, label: 'ADM', slot: 'adm' },
] as const;

// xlsx is a large parsing library — only the Importar screen needs it (same
// lazy-chunk rationale as the desktop shell).
const ImportarPage = lazy(() => import('../admin/ImportarPage').then((m) => ({ default: m.ImportarPage })));

export function MobileAdminShell() {
  const { signOut } = useAuth();
  const { data: store } = useStore();
  const { data: storeSettings } = useStoreSettings();
  const { data: categoryTypes } = useCategoryTypes();
  const location = useLocation();
  const hasBio = (categoryTypes ?? []).some((c) => c.chave === 'biosintetica');
  const categories = hasBio ? [...CATEGORIES_BEFORE_BIO, BIO_CATEGORY, ...CATEGORIES_AFTER_BIO] : [...CATEGORIES_BEFORE_BIO, ...CATEGORIES_AFTER_BIO];

  return (
    <div className="mv2" style={{ minHeight: '100vh' }}>
      <ConquistaCelebrationHost />
      <header className="mv2-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {/* Same reasoning as AppShell.tsx's desktop back button: only the
              /admin/* maintenance screens are reached exclusively by
              drilling into the ADM grid, with no menu link of their own. */}
          {location.pathname.startsWith('/admin/') && <BackButton style={{ borderColor: 'var(--mv2-ciano-claro)', color: 'var(--mv2-ciano-claro)' }} />}
          <div className="mv2-store-info" title={store?.nome_loja || undefined}>
            🛍️ {store?.nome_loja || 'Gestão de Vendas'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {storeSettings && (
            <MobileClosingTimer horario={storeSettings.horario as unknown as Horario} feriadosDatas={storeSettings.feriados_datas} />
          )}
          <button className="mv2-icon-btn" title="Atualizar" onClick={() => window.location.reload()}>
            <RefreshIcon width={14} height={14} />
          </button>
          <button className="mv2-icon-btn" title="Sair" onClick={() => signOut()} style={{ fontSize: 10 }}>
            ⏻
          </button>
        </div>
      </header>

      <nav className="mv2-category-menu">
        {categories.map((c) => (
          <NavLink key={c.to} to={c.to} end={c.end} title={c.label} className={({ isActive }) => `mv2-cat-icon ${c.cls} ${isActive ? 'active' : ''}`}>
            <FunctionIcon slot={c.slot} fallback={c.Icon} size={26} />
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
          <Route path="/categoria/MER" element={<MobileMercadoriaGeralPage />} />
          <Route path="/categoria/LEVMEL" element={<MobileLevmelPage />} />
          <Route path="/categoria/CHIP" element={<MobileChipPage />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/dinamicas" element={<MobileDinamicasPage />} />
          <Route path="/bio" element={<MobileBioPage />} />
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
          <Route path="/admin/vendas" element={<ListaVendasPage />} />
          <Route path="/admin/vendas-arquivadas" element={<VendasArquivadasPage />} />
          <Route path="/admin/backup" element={<BackupPage />} />
          <Route path="/admin/minha-loja" element={<MinhaLojaPage />} />
          <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="/admin/icones" element={<IconesPage />} />
          <Route path="/admin/card-conquista" element={<CardConquistaPage />} />
          <Route path="/admin/categorias" element={<CategoriasPage />} />
        </Routes>
      </main>
    </div>
  );
}
