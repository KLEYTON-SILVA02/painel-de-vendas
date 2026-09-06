import { useState } from 'react';
import { ReauthModal } from '../components/ReauthModal';

/** Wraps a destructive action behind the same password re-check
 * DangerZoneCard uses, so any screen can require it without reimplementing
 * its own modal state — a plain window.confirm() (or no confirmation at
 * all) only checks "did the ADM mean to click this", not "is this still
 * the ADM at the keyboard" (an unattended, still-logged-in session is
 * enough to wipe data otherwise). Call `guard(message, action)` from a
 * delete handler instead of running the deletion directly, and render
 * `reauthModal` once anywhere in the component's JSX. */
export function useReauthGuard() {
  const [pending, setPending] = useState<{ message: string; action: () => void } | null>(null);

  function guard(message: string, action: () => void) {
    setPending({ message, action });
  }

  const reauthModal = pending ? (
    <ReauthModal
      message={pending.message}
      onConfirm={() => {
        const { action } = pending;
        setPending(null);
        action();
      }}
      onCancel={() => setPending(null)}
    />
  ) : null;

  return { guard, reauthModal };
}
