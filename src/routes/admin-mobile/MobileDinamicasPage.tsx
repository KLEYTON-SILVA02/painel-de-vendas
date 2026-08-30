import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { RankingImageModal } from '../../components/ranking/RankingImageModal';
import { computeDinamicaProgresso, computeDinamicaRanking, dynamicStatus, type DynamicStatus } from '../../lib/business/dynamics';
import { normalize } from '../../lib/business/normalize';
import type { Collaborator, Dynamic, Sale } from '../../lib/business/types';
import { todayISO } from '../../lib/dateRange';
import { generateDinamicaCardBlob } from '../../lib/dinamicaImage';
import { fmtDateBR, fmtMoney } from '../../lib/format';
import { useCreateDynamic, useDeleteDynamic } from '../../lib/mutations';
import { tryCopyImage } from '../../lib/rankingImage';
import { useCollaborators, useDynamics, useSales, useStore } from '../../lib/queries';
import { MobileDateFilter } from './MobileDateFilter';

const STATUS_LABEL: Record<DynamicStatus, string> = { ativa: 'Ativa', agendada: 'Agendada', encerrada: 'Encerrada' };
const STATUS_COLOR: Record<DynamicStatus, string> = { ativa: '#14ff00', agendada: '#f26122', encerrada: '#666' };
const SETOR_ALVO_LABEL: Record<Dynamic['setorAlvo'], string> = { balcao: 'Balcão', caixa: 'Caixa', ambos: 'Balcão + Caixa' };

export function MobileDinamicasPage() {
  const { profile } = useAuth();
  const { data: dynamics } = useDynamics();
  const { data: sales } = useSales();
  const { data: collaborators } = useCollaborators();
  const { data: store } = useStore();
  const [tab, setTab] = useState<'ativas' | 'galeria'>('ativas');
  const [expanded, setExpanded] = useState<string | null>(null);
  const createDynamic = useCreateDynamic(profile?.store_id);
  const deleteDynamic = useDeleteDynamic();

  if (!dynamics || !sales || !collaborators) {
    return <div style={{ padding: 24, fontSize: 12, color: 'var(--mv2-texto-2)' }}>Carregando…</div>;
  }

  const today = todayISO();
  const list = dynamics.slice().sort((a, b) => (b.dataInicio || '').localeCompare(a.dataInicio || ''));
  const ativas = list.filter((d) => dynamicStatus(d, today) === 'ativa');
  const agendadas = list.filter((d) => dynamicStatus(d, today) === 'agendada');
  const encerradas = list.filter((d) => dynamicStatus(d, today) === 'encerrada');
  const listaAtual = ativas.concat(agendadas);

  const atingimentoMedio = ativas.length
    ? ativas.reduce((sum, d) => {
        const realizado = computeDinamicaProgresso(d, sales, collaborators);
        const pct = d.metaValor > 0 ? Math.min(999, (realizado / d.metaValor) * 100) : 0;
        return sum + pct;
      }, 0) / ativas.length
    : 0;

  const ativasBalcao = ativas.filter((d) => d.setorAlvo === 'balcao' || d.setorAlvo === 'ambos').length;
  const ativasCaixa = ativas.filter((d) => d.setorAlvo === 'caixa' || d.setorAlvo === 'ambos').length;

  const visibleList = tab === 'ativas' ? listaAtual : encerradas;

  return (
    <div>
      <div className="mv2-screen-title mv2-dinamicas">DINÂMICAS</div>

      <div className="mv2-metrics-grid">
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#a82bff' }}>
          <div className="mv2-label">Dinâmicas Cadastradas</div>
          <div className="mv2-value">{list.length}</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#14ff00' }}>
          <div className="mv2-label">Ativas Agora</div>
          <div className="mv2-value">{ativas.length}</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#f26122', gridColumn: '1 / -1' }}>
          <div className="mv2-label">Atingimento Atual</div>
          <div className="mv2-value">{atingimentoMedio.toFixed(0)}%</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '0 18px 12px' }}>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#00b6da' }}>
          <div className="mv2-label">Dinâmica Balcão</div>
          <div className="mv2-value">{ativasBalcao}</div>
        </div>
        <div className="mv2-metric-card" style={{ ['--mv2-card-color' as string]: '#5c3795' }}>
          <div className="mv2-label">Dinâmica Caixa</div>
          <div className="mv2-value">{ativasCaixa}</div>
        </div>
      </div>

      <div className="mv2-row" style={{ margin: '0 18px 12px', gap: 6 }}>
        <button
          className="mv2-btn-outline"
          style={tab === 'ativas' ? { flex: 1, background: 'var(--mv2-ciano-claro)', color: '#000', fontWeight: 700 } : { flex: 1 }}
          onClick={() => setTab('ativas')}
        >
          Ativas / Agendadas
        </button>
        <button
          className="mv2-btn-outline"
          style={tab === 'galeria' ? { flex: 1, background: 'var(--mv2-ciano-claro)', color: '#000', fontWeight: 700 } : { flex: 1 }}
          onClick={() => setTab('galeria')}
        >
          Galeria de Dinâmicas
        </button>
      </div>

      <MobileDateFilter />

      {tab === 'ativas' && (
        <MobileNewDynamicForm collaborators={collaborators} onCreate={(input) => createDynamic.mutate(input)} creating={createDynamic.isPending} />
      )}

      <div style={{ margin: '0 18px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 8 }}>
          {tab === 'ativas' ? `Acompanhamento de Dinâmicas Ativas (${listaAtual.length})` : `Galeria de Dinâmicas (${encerradas.length})`}
        </div>
        {visibleList.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--mv2-texto-2)', padding: '16px 0', textAlign: 'center' }}>
            {tab === 'ativas' ? 'Nenhuma dinâmica ativa ou agendada.' : 'Nenhuma dinâmica encerrada ainda.'}
          </div>
        ) : (
          <div className="mv2-dynamic-accordion" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleList.map((d) => (
              <MobileDinamicaAccordionItem
                key={d.id}
                d={d}
                status={dynamicStatus(d, today)}
                sales={sales}
                collaborators={collaborators}
                nomeLoja={store?.nome_loja}
                expanded={expanded === d.id}
                onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
                onDelete={tab === 'ativas' ? () => deleteDynamic.mutate(d.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MobileNewDynamicForm({
  collaborators,
  onCreate,
  creating,
}: {
  collaborators: Collaborator[];
  onCreate: (input: {
    titulo: string;
    descricao: string;
    data_inicio: string;
    data_fim: string;
    meta_valor: number;
    metrica: 'valor' | 'unidade';
    produtos: string[];
    participantes: string[];
    setor_alvo: Dynamic['setorAlvo'];
  }) => void;
  creating: boolean;
}) {
  const today = todayISO();
  const [titulo, setTitulo] = useState('');
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(today);
  const [setorAlvo, setSetorAlvo] = useState<Dynamic['setorAlvo']>('ambos');
  const [metrica, setMetrica] = useState<'valor' | 'unidade'>('valor');
  const [metaValor, setMetaValor] = useState(0);
  const [produtoInput, setProdutoInput] = useState('');
  const [produtos, setProdutos] = useState<string[]>([]);
  const [participantes, setParticipantes] = useState<string[]>([]);

  function addProduto() {
    const nome = produtoInput.trim();
    if (!nome) return;
    setProdutos((prev) => [...prev, nome]);
    setProdutoInput('');
  }

  function toggleParticipante(matricula: string) {
    setParticipantes((prev) => (prev.includes(matricula) ? prev.filter((m) => m !== matricula) : [...prev, matricula]));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !dataInicio || !dataFim) return;
    onCreate({
      titulo: titulo.trim(),
      descricao: '',
      data_inicio: dataInicio,
      data_fim: dataFim,
      meta_valor: metaValor,
      metrica,
      produtos,
      participantes,
      setor_alvo: setorAlvo,
    });
    setTitulo('');
    setSetorAlvo('ambos');
    setMetaValor(0);
    setProdutos([]);
    setParticipantes([]);
  }

  return (
    <form onSubmit={handleSubmit} className="mv2-dynamic-form" style={{ margin: '0 18px 16px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 6, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>Nova Dinâmica</div>
      <input placeholder="Nome da dinâmica" value={titulo} onChange={(e) => setTitulo(e.target.value)} />

      <div className="mv2-row" style={{ gap: 8 }}>
        <input type="date" style={{ flex: 1 }} value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <input type="date" style={{ flex: 1 }} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
      </div>

      <select value={setorAlvo} onChange={(e) => setSetorAlvo(e.target.value as Dynamic['setorAlvo'])}>
        <option value="ambos">Setor: Balcão + Caixa</option>
        <option value="balcao">Setor: Balcão</option>
        <option value="caixa">Setor: Caixa</option>
      </select>

      <div className="mv2-row" style={{ gap: 8 }}>
        <select style={{ flex: 1 }} value={metrica} onChange={(e) => setMetrica(e.target.value as 'valor' | 'unidade')}>
          <option value="valor">Meta em R$</option>
          <option value="unidade">Meta em un.</option>
        </select>
        <input style={{ flex: 1 }} type="number" placeholder="Meta" value={metaValor} onChange={(e) => setMetaValor(Number(e.target.value))} />
      </div>

      <div>
        <div className="mv2-row" style={{ gap: 6 }}>
          <input style={{ flex: 1 }} placeholder="Produtos participantes" value={produtoInput} onChange={(e) => setProdutoInput(e.target.value)} />
          <button type="button" className="mv2-btn-outline" style={{ flex: 'none', padding: '0 14px' }} onClick={addProduto}>
            Adicionar
          </button>
        </div>
        <div className="mv2-tag-list">
          {produtos.length === 0 ? (
            <span style={{ fontSize: 7, color: 'var(--mv2-texto-2)' }}>Nenhum produto — vale para todos.</span>
          ) : (
            produtos.map((p, i) => (
              <span key={i} className="mv2-tag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {p}
                <button
                  type="button"
                  onClick={() => setProdutos((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{ background: 'none', border: 'none', color: 'var(--mv2-texto-2)', cursor: 'pointer', fontSize: 8 }}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div style={{ margin: '8px 0 4px', fontSize: 8, color: 'var(--mv2-texto-2)', textTransform: 'uppercase' }}>Participantes</div>
      <div className="mv2-tag-list" style={{ marginTop: 0 }}>
        {collaborators.map((c) => (
          <label
            key={c.id}
            className="mv2-tag"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              background: participantes.includes(c.matricula) ? 'var(--mv2-ciano-claro)' : undefined,
              color: participantes.includes(c.matricula) ? '#000' : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={participantes.includes(c.matricula)}
              onChange={() => toggleParticipante(c.matricula)}
              style={{ width: 8, height: 8 }}
            />
            {c.apelido || c.nome}
          </label>
        ))}
      </div>

      <button type="submit" className="mv2-btn-primary" style={{ width: '100%', marginTop: 12 }} disabled={creating}>
        {creating ? 'Criando…' : 'Criar Dinâmica'}
      </button>
    </form>
  );
}

function MobileDinamicaAccordionItem({
  d,
  status,
  sales,
  collaborators,
  nomeLoja,
  expanded,
  onToggle,
  onDelete,
}: {
  d: Dynamic;
  status: DynamicStatus;
  sales: Sale[];
  collaborators: Collaborator[];
  nomeLoja: string | undefined;
  expanded: boolean;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  const [cardMatricula, setCardMatricula] = useState<string | null>(null);
  const isUnidade = d.metrica === 'unidade';
  const realizado = computeDinamicaProgresso(d, sales, collaborators);
  const pct = d.metaValor > 0 ? Math.min(999, (realizado / d.metaValor) * 100) : 0;
  const ranking = computeDinamicaRanking(d, sales, collaborators);

  return (
    <div>
      <div className="mv2-item-header" onClick={onToggle}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700 }}>{d.titulo}</div>
          <div style={{ fontSize: 7, color: 'var(--mv2-texto-2)', marginTop: 2 }}>
            {fmtDateBR(d.dataInicio)} — {fmtDateBR(d.dataFim)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 7, fontWeight: 700, color: STATUS_COLOR[status] }}>{STATUS_LABEL[status]}</span>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              style={{ background: 'none', border: 'none', color: 'var(--mv2-texto-2)', cursor: 'pointer', fontSize: 11 }}
            >
              ✕
            </button>
          )}
          <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="mv2-item-body">
          <div style={{ overflowX: 'auto' }}>
            <table className="mv2-data-table">
              <thead>
                <tr>
                  <th>Setor</th>
                  <th>Participantes</th>
                  <th>Validade</th>
                  <th>Meta</th>
                  <th>Realizado</th>
                  <th>% Alcançado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{SETOR_ALVO_LABEL[d.setorAlvo]}</td>
                  <td>{d.participantes.length || 'Todos'}</td>
                  <td>
                    {fmtDateBR(d.dataInicio)}–{fmtDateBR(d.dataFim)}
                  </td>
                  <td>{d.metaValor > 0 ? (isUnidade ? `${d.metaValor} un.` : fmtMoney(d.metaValor)) : '—'}</td>
                  <td>{isUnidade ? `${realizado} un.` : fmtMoney(realizado)}</td>
                  <td className={pct >= 100 ? 'mv2-ok' : pct < 50 ? 'mv2-low' : undefined}>{pct.toFixed(0)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 9, fontWeight: 700, margin: '10px 0 4px' }}>Detalhamento por Colaborador</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="mv2-data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Meta</th>
                  <th>Realizado</th>
                  <th>% Alcançado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ranking.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--mv2-texto-2)', padding: 8 }}>
                      Nenhum participante com vendas ainda.
                    </td>
                  </tr>
                ) : (
                  ranking.map((r) => {
                    const rValor = isUnidade ? r.itens : r.valor;
                    const rPct = d.metaValor > 0 ? Math.min(999, (rValor / d.metaValor) * 100) : 0;
                    return (
                      <tr key={r.matricula}>
                        <td>{r.apelido || r.nome}</td>
                        <td>{d.metaValor > 0 ? (isUnidade ? `${d.metaValor} un.` : fmtMoney(d.metaValor)) : '—'}</td>
                        <td>{isUnidade ? `${rValor} un.` : fmtMoney(rValor)}</td>
                        <td className={rPct >= 100 ? 'mv2-ok' : rPct < 50 ? 'mv2-low' : undefined}>{rPct.toFixed(0)}%</td>
                        <td>
                          <button
                            onClick={() => setCardMatricula(r.matricula)}
                            style={{ background: 'none', border: '1px solid var(--mv2-ciano-claro)', borderRadius: 999, color: '#fff', fontSize: 6.5, padding: '2px 6px', cursor: 'pointer' }}
                          >
                            Cartão
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cardMatricula && (
        <MobileDinamicaExportCardModal
          matricula={cardMatricula}
          dynamics={[d]}
          sales={sales}
          collaborators={collaborators}
          nomeLoja={nomeLoja}
          onClose={() => setCardMatricula(null)}
        />
      )}
    </div>
  );
}

function MobileDinamicaExportCardModal({
  matricula,
  dynamics,
  sales,
  collaborators,
  nomeLoja,
  onClose,
}: {
  matricula: string;
  dynamics: Dynamic[];
  sales: Sale[];
  collaborators: Collaborator[];
  nomeLoja: string | undefined;
  onClose: () => void;
}) {
  const collaborator = collaborators.find((c) => c.matricula === matricula);
  const today = todayISO();
  const [generating, setGenerating] = useState(false);
  const [imageModal, setImageModal] = useState<{ url: string; copied: boolean } | null>(null);

  const entries = dynamics.map((d) => {
    const isUnidade = d.metrica === 'unidade';
    const produtosSet = d.produtos.length ? new Set(d.produtos.map((p) => normalize(p))) : null;
    let myValor = 0;
    let myItens = 0;
    const porDia: Record<string, { valor: number; itens: number }> = {};
    sales.forEach((s) => {
      if (s.matricula !== matricula) return;
      if (!s.dataISO || s.dataISO < d.dataInicio || s.dataISO > d.dataFim) return;
      if (produtosSet && !produtosSet.has(normalize(s.produto))) return;
      myValor += Number(s.valor) || 0;
      myItens += Number(s.qtd) || 0;
      const dia = s.dataISO;
      if (!porDia[dia]) porDia[dia] = { valor: 0, itens: 0 };
      porDia[dia].valor += Number(s.valor) || 0;
      porDia[dia].itens += Number(s.qtd) || 0;
    });
    const myTotal = isUnidade ? myItens : myValor;
    const pct = d.metaValor > 0 ? Math.min(999, (myTotal / d.metaValor) * 100) : 0;
    const dias = Object.keys(porDia).sort();
    return { din: d, isUnidade, myValor, myItens, porDia, pct, dias };
  });

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const blob = await generateDinamicaCardBlob({
        nome: collaborator?.apelido || collaborator?.nome || matricula,
        matricula,
        foto: collaborator?.foto ?? null,
        lojaNome: nomeLoja,
        dinamicas: entries.map((e) => ({
          titulo: e.din.titulo,
          metaLabel: e.din.metaValor > 0 ? (e.isUnidade ? `${e.din.metaValor} un.` : fmtMoney(e.din.metaValor)) : '—',
          realizadoLabel: e.isUnidade ? `${e.myItens} un.` : fmtMoney(e.myValor),
          pct: e.pct,
          dias: e.dias.map((dia) => ({
            label: fmtDateBR(dia),
            valorLabel:
              (e.isUnidade ? `${e.porDia[dia].itens} un.` : fmtMoney(e.porDia[dia].valor)) +
              (e.din.metaValor > 0 ? ` · ${(((e.isUnidade ? e.porDia[dia].itens : e.porDia[dia].valor) / e.din.metaValor) * 100).toFixed(0)}%` : ''),
          })),
        })),
      });
      if (!blob) return;
      const wasCopied = await tryCopyImage(blob);
      setImageModal({ url: URL.createObjectURL(blob), copied: wasCopied });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
      onClick={onClose}
    >
      <div className="mv2-export-card mv2-dynamic-export-card" onClick={(e) => e.stopPropagation()}>
        <div className="mv2-header">
          {collaborator?.foto ? (
            <img src={collaborator.foto} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--mv2-roxo-marca)' }} />
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{collaborator?.apelido || collaborator?.nome || matricula}</div>
            <div style={{ fontSize: 7, color: 'var(--mv2-texto-2)' }}>
              Mat. {matricula} · {nomeLoja || 'Loja'}
            </div>
          </div>
        </div>

        {entries.map(({ din: d, isUnidade, myValor, myItens, porDia, pct, dias }) => (
          <div key={d.id} style={{ marginBottom: 10, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{d.titulo}</div>
            <div className="mv2-stat-row" style={{ marginTop: 6 }}>
              <div className="mv2-stat">
                <div style={{ fontSize: 6.5, color: 'var(--mv2-texto-2)' }}>META</div>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{d.metaValor > 0 ? (isUnidade ? `${d.metaValor} un.` : fmtMoney(d.metaValor)) : '—'}</div>
              </div>
              <div className="mv2-stat">
                <div style={{ fontSize: 6.5, color: 'var(--mv2-texto-2)' }}>REALIZADO</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: pct >= 100 ? 'var(--mv2-verde)' : '#fff' }}>
                  {isUnidade ? `${myItens} un.` : fmtMoney(myValor)} ({pct.toFixed(0)}%)
                </div>
              </div>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: '#1a1a1a', marginTop: 6, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', borderRadius: 2, width: `${Math.min(100, pct)}%`, background: pct >= 100 ? 'var(--mv2-verde)' : 'var(--mv2-ciano)' }} />
            </div>
            {dias.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {dias.map((dia) => (
                  <div key={dia} className="mv2-day-row">
                    <span>{fmtDateBR(dia)}</span>
                    <span>
                      {isUnidade ? `${porDia[dia].itens} un.` : fmtMoney(porDia[dia].valor)}
                      {d.metaValor > 0 && ` · ${((isUnidade ? porDia[dia].itens : porDia[dia].valor) / d.metaValor * 100).toFixed(0)}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="mv2-footer">"Meta é compromisso, resultado é orgulho." · {fmtDateBR(today)}</div>

        <div className="mv2-row" style={{ gap: 6, marginTop: 12 }}>
          <button className="mv2-btn-outline" style={{ flex: 1 }} onClick={onClose}>
            Fechar
          </button>
          <button className="mv2-btn-generate" style={{ flex: 1 }} onClick={handleGenerateImage} disabled={generating}>
            {generating ? 'Gerando…' : 'Gerar Imagem'}
          </button>
        </div>
      </div>

      {imageModal && (
        <RankingImageModal
          url={imageModal.url}
          copied={imageModal.copied}
          onClose={() => setImageModal(null)}
          title={`Cartão de Dinâmica — ${collaborator?.apelido || collaborator?.nome || matricula}`}
          filename={`dinamica-${matricula}.png`}
          alt="Cartão de dinâmica"
        />
      )}
    </div>
  );
}
