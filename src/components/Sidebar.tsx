import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCategoryLabelMap } from '../lib/business/categoryLabels';
import { useCategoryTypes, useStoreSettings } from '../lib/queries';
import './Sidebar.css';
import { FunctionIcon } from './icons/FunctionIcon';
import {
  BagIcon,
  ChevronIcon,
  CpuIcon,
  DropletIcon,
  GraduationCapIcon,
  HexagonIcon,
  HomeIcon,
  LeafIcon,
  LogoutIcon,
  MedalIcon,
  PillIcon,
  SettingsIcon,
  TagIcon,
  TargetIcon,
  TrophyIcon,
  UploadIcon,
} from './icons/NavIcons';

// Nav structure ported 1:1 from legacy/index-original.html's CAT_NAV
// (labels, colors, groups, routes). `icon` is the fallback shown until an
// admin uploads a custom SVG for `slot` in ADM > Ícones (see FunctionIcon /
// functionIconSlots.ts) — chosen per item's actual function instead of
// legacy's fallback set, since that set reuses the same icon for unrelated
// items (Gen/Sim and Chip both 'package'; Ranking and Biosintética both
// 'award') where a distinct, purpose-matched icon reads better while these
// are still stand-ins: Trophy for the leaderboard, Pill for generic/similar
// medicine, Hexagon (honeycomb) for the honey-based Levmel line, Cpu for the
// literal Chip category.
//
// BIOSINTÉTICA is deliberately NOT listed here: it's the one legacy
// partnership category still wired to its own dedicated /bio route (instead
// of the generic /categoria-parceria/:chave every ADM-created category
// uses) and only exists for the store it was seeded for at migration time —
// see the `extraCategories`/bioCategory split below.
const CAT_NAV: {
  key: string;
  label: string;
  color: string;
  icon: (props: { width?: number; height?: number }) => React.ReactElement;
  slot: string;
  grupo: 'Principal' | 'Categorias' | 'Programas' | 'Sistema';
  to: string;
  end: boolean;
}[] = [
  { key: 'DASH', label: 'Início', color: '#00f0ff', icon: HomeIcon, slot: 'inicio', grupo: 'Principal', to: '/', end: true },
  { key: 'RANK', label: 'Ranking', color: '#00f0ff', icon: TrophyIcon, slot: 'ranking', grupo: 'Principal', to: '/ranking', end: false },
  { key: 'DERM', label: 'Dermo', color: '#ff3df0', icon: DropletIcon, slot: 'dermo', grupo: 'Categorias', to: '/categoria/DERM', end: false },
  { key: 'GEN', label: 'Gen/Sim', color: '#14ff00', icon: PillIcon, slot: 'generico', grupo: 'Categorias', to: '/categoria/GEN', end: false },
  { key: 'MP', label: 'Marcas Excl.', color: '#a82bff', icon: TagIcon, slot: 'marcas_exclusivas', grupo: 'Categorias', to: '/categoria/MP', end: false },
  { key: 'MER', label: 'Merc. Geral', color: '#ff6a00', icon: BagIcon, slot: 'mercadoria_geral', grupo: 'Categorias', to: '/categoria/MER', end: false },
  { key: 'LEVMEL', label: 'Levmel', color: '#ffb700', icon: HexagonIcon, slot: 'levmel', grupo: 'Categorias', to: '/categoria/LEVMEL', end: false },
  { key: 'CHIP', label: 'Chip', color: '#00f0ff', icon: CpuIcon, slot: 'chip', grupo: 'Categorias', to: '/categoria/CHIP', end: false },
  { key: 'DINAMICA', label: 'Dinâmicas', color: '#a82bff', icon: TargetIcon, slot: 'dinamicas', grupo: 'Programas', to: '/dinamicas', end: false },
  { key: 'CONQUISTAS', label: 'Conquistas', color: '#ffb700', icon: MedalIcon, slot: 'conquistas', grupo: 'Programas', to: '/conquistas', end: false },
  { key: 'ADM', label: 'ADM', color: '#00f0ff', icon: SettingsIcon, slot: 'adm', grupo: 'Sistema', to: '/admin', end: false },
];

// 'Sistema' (the ADM/settings link) is deliberately excluded from this list
// — it's no longer rendered inline with the other nav groups. Instead it's
// pulled out of CAT_NAV below and rendered in its own section right above
// the footer (Sair), so it stays anchored near the bottom of the sidebar
// instead of opening expanded by default among the other links.
const GROUPS = ['Principal', 'Categorias', 'Programas'] as const;
const ADM_NAV_ITEM = CAT_NAV.find((c) => c.key === 'ADM')!;

// Função Tutoriais: fixo no menu lateral, acima do botão ADM (engrenagem) —
// mesmo bloco isolado (sb-settings-nav) para não competir por espaço com os
// grupos de navegação principais, mas com destaque próprio (capelo, cor
// diferente) por ser uma função de ajuda, não mais uma categoria/programa.
const TUTORIAIS_NAV_ITEM = { label: 'Tutoriais', color: '#14ff00', icon: GraduationCapIcon, slot: 'tutoriais', to: '/tutoriais', end: false };

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  logoUrl,
  onNavigate,
  showImportButton = true,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  logoUrl?: string | null;
  /** Called on any nav-item / import-button click, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /** The ADM mobile shell reuses this same sidebar as its slide-out drawer,
   * but "Carregar Vendas" (bulk sales import) stays a desktop-only action —
   * hidden here instead of duplicating the whole nav/footer markup. */
  showImportButton?: boolean;
}) {
  // BIOSINTÉTICA only shows up here when this store actually has a
  // category_types row for it — new stores don't get one seeded
  // automatically, so without this check every store would see a dead
  // "Biosintética" link regardless of whether they ever created it.
  // Every OTHER ADM-created partnership category (Gerenciar Categorias)
  // gets its own button too, pointing at the generic
  // /categoria-parceria/:chave screen instead of Biosintética's dedicated
  // /bio route.
  const { data: categoryTypes } = useCategoryTypes();
  const { data: storeSettings } = useStoreSettings();
  const categoryLabels = useCategoryLabelMap();
  const { signOut } = useAuth();
  // Categorias fixas ocultadas pelo ADM em ADM > Nomes das Categorias
  // (store_settings.hidden_categories, 0089_hidden_categories.sql) — some o
  // atalho aqui embaixo, mas a tela /categoria/:chave continua acessível
  // por link direto e todo o resto (classificação, metas, comissão)
  // continua funcionando igual.
  const hiddenCategories = storeSettings?.hidden_categories ?? [];
  const bioCategory = (categoryTypes ?? []).find((c) => c.chave === 'biosintetica');
  // DSM (Desconto Só Meu) — mesmo padrão de rota dedicada da BIOSINTÉTICA,
  // mas com o botão de "ocultar" pedido desde a Fase 1 (ver Importar
  // Vendas): diferente de bioCategory/extraCategories acima, que ignoram
  // `.ativo`, este item só aparece quando a própria loja optou por mantê-lo
  // visível (o toggle mora em Importar Vendas, sempre alcançável mesmo com
  // o item oculto daqui).
  const dsmCategory = (categoryTypes ?? []).find((c) => c.chave === 'dsm');
  const extraCategories = (categoryTypes ?? []).filter((c) => c.chave !== 'biosintetica' && c.chave !== 'dsm');

  return (
    <aside className="sidebar">
      <div className="sb-header">
        <div className="sb-logo">{logoUrl ? <img src={logoUrl} alt="" /> : 'GV'}</div>
        <div className="sb-title">
          <div className="t1">
            GESTÃO DE
            <br />
            VENDAS
          </div>
        </div>
        <button className="sb-toggle" onClick={onToggleCollapsed} title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          <ChevronIcon width={15} height={15} />
        </button>
      </div>

      <nav className="sb-nav">
        {GROUPS.map((g) => (
          <div key={g}>
            <div className="sb-group-label">{g}</div>
            {CAT_NAV.filter((c) => c.grupo === g && !hiddenCategories.includes(c.key)).map((c) => (
              <NavLink
                key={c.key}
                to={c.to}
                end={c.end}
                onClick={onNavigate}
                style={{ '--sbc': c.color } as React.CSSProperties}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <FunctionIcon slot={c.slot} fallback={c.icon} size={18} />
                <span className="sb-label">{categoryLabels[c.key as keyof typeof categoryLabels] ?? c.label}</span>
              </NavLink>
            ))}
            {g === 'Programas' && bioCategory && bioCategory.ativo && (
              <NavLink
                to="/bio"
                end={false}
                onClick={onNavigate}
                style={{ '--sbc': '#14ff00' } as React.CSSProperties}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <FunctionIcon slot="biosintetica" fallback={LeafIcon} size={18} />
                <span className="sb-label">{bioCategory.nome}</span>
              </NavLink>
            )}
            {g === 'Programas' && dsmCategory && dsmCategory.ativo && (
              <NavLink
                to="/dsm"
                end={false}
                onClick={onNavigate}
                style={{ '--sbc': '#ffb700' } as React.CSSProperties}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <FunctionIcon slot="dsm" fallback={TagIcon} size={18} />
                <span className="sb-label">{dsmCategory.nome}</span>
              </NavLink>
            )}
            {g === 'Programas' &&
              extraCategories.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/categoria-parceria/${c.chave}`}
                  end={false}
                  onClick={onNavigate}
                  style={{ '--sbc': '#00c2ff' } as React.CSSProperties}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  {c.icone_url ? (
                    <img src={c.icone_url} alt="" width={18} height={18} style={{ objectFit: 'contain' }} />
                  ) : (
                    <TagIcon width={18} height={18} />
                  )}
                  <span className="sb-label">{c.nome}</span>
                </NavLink>
              ))}
          </div>
        ))}
      </nav>

      {/* ADM/settings link, pulled out of the scrolling nav above so it
          anchors near the bottom of the sidebar instead of sitting inline
          with the category/program links — spaced apart via margin, not a
          divider line (see ADM_NAV_ITEM). Tutoriais sits right above it, in
          the same isolated block, per the ADM's explicit request to fix it
          "acima do botão Configurações" (o botão de engrenagem ADM). */}
      <nav className="sb-nav sb-settings-nav">
        <NavLink
          to={TUTORIAIS_NAV_ITEM.to}
          end={TUTORIAIS_NAV_ITEM.end}
          onClick={onNavigate}
          style={{ '--sbc': TUTORIAIS_NAV_ITEM.color } as React.CSSProperties}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <FunctionIcon slot={TUTORIAIS_NAV_ITEM.slot} fallback={TUTORIAIS_NAV_ITEM.icon} size={18} />
          <span className="sb-label">{TUTORIAIS_NAV_ITEM.label}</span>
        </NavLink>
        <NavLink
          to={ADM_NAV_ITEM.to}
          end={ADM_NAV_ITEM.end}
          onClick={onNavigate}
          style={{ '--sbc': ADM_NAV_ITEM.color } as React.CSSProperties}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <FunctionIcon slot={ADM_NAV_ITEM.slot} fallback={ADM_NAV_ITEM.icon} size={18} />
          <span className="sb-label">{categoryLabels[ADM_NAV_ITEM.key as keyof typeof categoryLabels] ?? ADM_NAV_ITEM.label}</span>
        </NavLink>
      </nav>

      <div className="sb-footer">
        <button type="button" className="sb-logout-btn" onClick={() => signOut()}>
          <LogoutIcon width={13} height={13} />
          <span className="sb-label">Sair</span>
        </button>
        {showImportButton && (
          <NavLink to="/admin/importar" className="sb-import-btn" onClick={onNavigate}>
            <UploadIcon width={26} height={26} />
            <span className="sb-label">Importar Vendas</span>
          </NavLink>
        )}
      </div>
    </aside>
  );
}
