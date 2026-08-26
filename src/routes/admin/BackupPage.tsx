import { useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { supabase } from '../../lib/supabase';

const BACKUP_TABLES = [
  'collaborators',
  'sales',
  'catalog',
  'products',
  'brand_keywords',
  'exclusive_brands',
  'goals',
  'dynamics',
  'bio_groups',
  'special_lists',
] as const;

export function BackupPage() {
  const { profile } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const backup: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const table of BACKUP_TABLES) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        backup[table] = data;
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-vendas-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(file: File) {
    if (!profile?.store_id) return;
    if (!confirm('Isso adiciona os dados do backup à loja atual (colaboradores existentes são atualizados por matrícula; o restante é adicionado). Continuar?')) {
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as Record<string, Record<string, unknown>[]>;
      const counts: string[] = [];

      if (Array.isArray(backup.collaborators)) {
        for (const c of backup.collaborators) {
          const { error } = await supabase.from('collaborators').upsert(
            {
              store_id: profile.store_id,
              matricula: String(c.matricula),
              nome: String(c.nome),
              apelido: (c.apelido as string) ?? null,
              setor: (c.setor as string) ?? null,
              meta_individual: Number(c.meta_individual) || 0,
            },
            { onConflict: 'store_id,matricula' },
          );
          if (error) throw error;
        }
        counts.push(`${backup.collaborators.length} colaborador(es)`);
      }

      for (const table of ['catalog', 'products', 'brand_keywords', 'exclusive_brands', 'dynamics', 'bio_groups', 'special_lists'] as const) {
        const rows = backup[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const payload = rows.map((r) => {
          const { id: _id, store_id: _storeId, created_at: _createdAt, ...rest } = r;
          return { ...rest, store_id: profile.store_id };
        });
        const { error } = await supabase.from(table).insert(payload as never);
        if (error) throw error;
        counts.push(`${rows.length} em ${table}`);
      }

      setResult(`Importado: ${counts.join(', ') || 'nenhum dado encontrado no arquivo'}.`);
    } catch (err) {
      setResult(`Erro ao importar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Exportar backup</h3>
        <p className="text-xs text-slate-500 mb-3">
          Baixe um arquivo com todos os dados da loja (colaboradores, produtos, catálogo, palavras-chave, metas,
          dinâmicas, grupos BIOSINTÉTICA e vendas).
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {exporting ? 'Gerando…' : '⬇ Baixar backup (.json)'}
        </button>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1 text-sm">Restaurar backup</h3>
        <p className="text-xs text-slate-500 mb-3">
          Envie um arquivo .json exportado anteriormente. Colaboradores existentes (por matrícula) são atualizados;
          os demais dados são adicionados aos já existentes na loja — nada é apagado automaticamente.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          disabled={importing}
          onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
          className="text-xs text-slate-400"
        />
        {result && <p className="text-xs text-slate-400 mt-2">{result}</p>}
      </div>
    </div>
  );
}
