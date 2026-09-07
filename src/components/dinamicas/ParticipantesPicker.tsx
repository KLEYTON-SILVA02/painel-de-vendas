export interface ParticipanteOption {
  id: string;
  matricula: string;
  nome: string;
  apelido: string | null;
  foto?: string | null;
}

/** Collaborator checklist for the dynamic create/edit forms — aligned grid
 * of fixed-height cells (photo icon + apelido + checkbox), instead of
 * variable-width wrapped pills, so rows line up regardless of how many
 * collaborators there are or which ones have a per-individual meta input
 * showing. Shared by the desktop and mobile create/edit forms. */
export function ParticipantesPicker({
  collaborators,
  participantes,
  onToggle,
  metaModo,
  metasIndividuais,
  onMetaChange,
}: {
  collaborators: ParticipanteOption[];
  participantes: string[];
  onToggle: (matricula: string) => void;
  metaModo?: 'geral' | 'individual';
  metasIndividuais?: Record<string, number>;
  onMetaChange?: (matricula: string, value: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
      {collaborators.map((c) => {
        const checked = participantes.includes(c.matricula);
        return (
          <div
            key={c.id}
            className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs"
            style={{ borderColor: checked ? '#00f0ff' : '#1e293b', background: checked ? 'rgba(0,240,255,.08)' : '#0b0e1d' }}
          >
            <label className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0">
              <input type="checkbox" checked={checked} onChange={() => onToggle(c.matricula)} className="flex-shrink-0" />
              {c.foto ? (
                <img src={c.foto} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-slate-700 flex-shrink-0" />
              )}
              <span className="truncate">{c.apelido || c.nome}</span>
            </label>
            {metaModo === 'individual' && checked && (
              <input
                type="number"
                value={metasIndividuais?.[c.matricula] ?? 0}
                onChange={(e) => onMetaChange?.(c.matricula, Number(e.target.value))}
                placeholder="meta"
                className="w-14 flex-shrink-0 rounded bg-slate-900 border border-slate-700 px-1 py-0.5 text-[10px]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
