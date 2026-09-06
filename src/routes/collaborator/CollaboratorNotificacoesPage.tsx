import { useState } from 'react';
import { useMarkNotificationRead } from '../../lib/mutations';
import { useNotifications } from '../../lib/queries';

/** Relative-enough timestamp for a notification feed: exact time today,
 * "Ontem HH:MM" yesterday, DD/MM otherwise. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  if (d.toDateString() === yesterday.toDateString()) return `Ontem ${time}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Full-screen notification list, reached by tapping the sino on the
// collaborator topbar — replaces the old small dropdown panel. "Hoje" shows
// today's notifications (what the collaborator actually opened this screen
// for, most of the time); "Antigas" holds everything before today, still
// reachable without cluttering the main tab.
export function CollaboratorNotificacoesPage() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [tab, setTab] = useState<'hoje' | 'antigas'>('hoje');

  const now = new Date();
  const list = notifications ?? [];
  const hoje = list.filter((n) => new Date(n.created_at).toDateString() === now.toDateString());
  const antigas = list.filter((n) => new Date(n.created_at).toDateString() !== now.toDateString());
  const shown = tab === 'hoje' ? hoje : antigas;

  return (
    <div>
      <div className="mv2-screen-title" style={{ ['--mv2-accent' as string]: '#00e5ff' }}>
        NOTIFICAÇÕES
      </div>

      <div className="mv2-chip-row">
        <button className={`mv2-chip ${tab === 'hoje' ? 'active' : ''}`} style={{ ['--mv2-chip-color' as string]: '#00e5ff' }} onClick={() => setTab('hoje')}>
          Hoje {hoje.length > 0 ? `(${hoje.length})` : ''}
        </button>
        <button className={`mv2-chip ${tab === 'antigas' ? 'active' : ''}`} style={{ ['--mv2-chip-color' as string]: '#00e5ff' }} onClick={() => setTab('antigas')}>
          Antigas {antigas.length > 0 ? `(${antigas.length})` : ''}
        </button>
      </div>

      <div className="mv2-card">
        {shown.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--mv2-texto-2)', padding: '18px 0', textAlign: 'center' }}>
            {tab === 'hoje' ? 'Nenhuma notificação hoje ainda.' : 'Nenhuma notificação antiga.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shown.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read_at) markRead.mutate(n.id);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 'var(--mv2-radius-sm)',
                  border: '1px solid rgba(255,255,255,.08)',
                  background: n.read_at ? 'transparent' : 'rgba(0,229,255,.06)',
                  cursor: n.read_at ? 'default' : 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--mv2-texto)' }}>{n.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--mv2-texto-2)', flexShrink: 0 }}>{formatWhen(n.created_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--mv2-texto-2)', whiteSpace: 'pre-wrap' }}>{n.body}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
