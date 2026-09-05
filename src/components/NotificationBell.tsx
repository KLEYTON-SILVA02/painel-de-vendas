import { useRef, useState } from 'react';
import { useMarkNotificationRead } from '../lib/mutations';
import { useNotifications } from '../lib/queries';
import { useOnClickOutside } from '../lib/useOnClickOutside';

/** Relative-enough timestamp for a notification feed: exact time today,
 * "Ontem HH:MM" yesterday, DD/MM otherwise — no need for a full
 * date-fns-style "há 3 minutos" library for a feed capped at 30 items. */
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

/** Bell + unread badge + dropdown feed, for the collaborator-facing shells
 * (the only place notifications.collaborator_id ever resolves to the
 * signed-in user — see current_collaborator_id() in the DB). Polls every
 * 60s (see useNotifications) instead of holding a realtime subscription
 * open, since the dispatch cron only ever adds rows every few minutes at
 * most. */
export function NotificationBell() {
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notificações"
        style={{
          position: 'relative',
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: '1px solid var(--mv2-roxo-marca)',
          background: 'var(--mv2-bg-cards)',
          color: 'var(--mv2-texto)',
          fontSize: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              padding: '0 3px',
              borderRadius: 999,
              background: '#ff3df0',
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 300,
            maxWidth: '90vw',
            maxHeight: 380,
            overflowY: 'auto',
            background: 'var(--mv2-bg-cards)',
            border: '1px solid var(--mv2-roxo-marca)',
            borderRadius: 'var(--mv2-radius-md)',
            boxShadow: '0 12px 32px rgba(0,0,0,.4)',
            zIndex: 50,
          }}
        >
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--mv2-roxo-marca)', fontSize: 12, fontWeight: 700, color: 'var(--mv2-ciano)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Notificações
          </div>
          {!notifications || notifications.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: 'var(--mv2-texto-2)', textAlign: 'center' }}>Nenhuma notificação ainda.</div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read_at) markRead.mutate(n.id);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderBottom: '1px solid rgba(255,255,255,.06)',
                  background: n.read_at ? 'transparent' : 'rgba(0,229,255,.06)',
                  cursor: n.read_at ? 'default' : 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mv2-texto)' }}>{n.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--mv2-texto-2)', flexShrink: 0 }}>{formatWhen(n.created_at)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--mv2-texto-2)', whiteSpace: 'pre-wrap' }}>{n.body}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
