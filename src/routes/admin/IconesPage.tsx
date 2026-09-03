import { useState } from 'react';
import { PageLoading } from '../../components/PageLoading';
import { useAuth } from '../../auth/AuthContext';
import { FUNCTION_ICON_SLOTS } from '../../lib/functionIconSlots';
import { useSetFunctionIcon } from '../../lib/mutations';
import { useFunctionIcons } from '../../lib/queries';
import { uploadIcon } from '../../lib/storage';

const GROUPS = ['Navegação', 'ADM'] as const;

export function IconesPage() {
  const { profile } = useAuth();
  const { data: icons } = useFunctionIcons();
  const setIcon = useSetFunctionIcon(profile?.store_id);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!icons) return <PageLoading />;

  async function handleUpload(functionKey: string, file: File) {
    if (!profile?.store_id) return;
    setError(null);
    setUploadingKey(functionKey);
    try {
      const url = await uploadIcon(profile.store_id, functionKey, file);
      await setIcon.mutateAsync({ functionKey, iconUrl: url });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar o ícone.');
    } finally {
      setUploadingKey(null);
    }
  }

  function handleRemove(functionKey: string) {
    setIcon.mutate({ functionKey, iconUrl: null });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h3 className="font-semibold mb-1">Gerenciamento de Ícones</h3>
        <p className="text-xs text-slate-500">
          Substitua o ícone padrão de qualquer função do sistema por um SVG próprio. O ícone enviado passa a ser usado
          automaticamente em todo lugar em que a função aparece (menu lateral, menu mobile e cards do ADM).
        </p>
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </div>

      {GROUPS.map((group) => (
        <div key={group} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-sm font-semibold text-slate-300 mb-3">{group}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {FUNCTION_ICON_SLOTS.filter((s) => s.group === group).map((slot) => {
              const url = icons[slot.key];
              return (
                <div key={slot.key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden">
                    {url ? <img src={url} alt="" className="w-6 h-6 object-contain" /> : <span className="text-slate-600 text-xs">—</span>}
                  </div>
                  <div className="text-xs text-center text-slate-300">{slot.label}</div>
                  <label className="w-full">
                    <input
                      type="file"
                      accept=".svg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(slot.key, file);
                        e.target.value = '';
                      }}
                    />
                    <span className="block text-center rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">
                      {uploadingKey === slot.key ? 'Enviando…' : url ? 'Substituir' : 'Carregar SVG'}
                    </span>
                  </label>
                  {url && (
                    <button onClick={() => handleRemove(slot.key)} className="text-[11px] text-slate-500 hover:text-rose-400">
                      Remover
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
