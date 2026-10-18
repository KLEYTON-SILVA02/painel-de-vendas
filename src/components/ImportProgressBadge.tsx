import { CircularGauge } from './CircularGauge';
import { importProgressPct, useImportProgress } from '../lib/importProgress';

const NEON_CYAN = '#00f0ff';

/** Mostra o progresso de uma importação de vendas que ainda está gravando
 * em segundo plano, mesmo que o ADM já tenha saído da tela de Importar
 * Vendas — some sozinha assim que a gravação termina e os dados já
 * atualizados ficam disponíveis no resto do sistema (ver setImportProgress
 * em ImportarPage.tsx). Renderiza nada enquanto não há importação em
 * andamento. */
export function ImportProgressBadge() {
  const progress = useImportProgress();
  if (!progress) return null;
  const pct = importProgressPct(progress);

  return (
    <div
      title={`Importando vendas… ${pct}% — os novos dados ficam disponíveis ao terminar`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
    >
      <div style={{ width: 22, height: 22, flexShrink: 0 }}>
        <CircularGauge pct={pct} color={NEON_CYAN} trackColor="rgba(255,255,255,.14)" strokeWidth={16} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: NEON_CYAN, whiteSpace: 'nowrap' }}>Importando {pct}%</span>
    </div>
  );
}
