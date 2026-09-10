import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../lib/queries';

/** Bell + unread badge, reused by both the collaborator shell and the
 * desktop ADM shell — `audience` picks which notification feed each sees
 * (see useNotifications). Tapping it opens the dedicated /notificacoes
 * screen (Hoje/Antigas tabs) instead of a small dropdown, so the full list
 * has room to breathe on a phone. Polls every 60s (see useNotifications)
 * instead of holding a realtime subscription open, since notifications
 * only ever arrive every few minutes at most. */
export function NotificationBell({ audience }: { audience: 'admin' | 'collaborator' }) {
  const { data: notifications } = useNotifications(audience);
  const navigate = useNavigate();

  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <button
      onClick={() => navigate('/notificacoes')}
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
  );
}
