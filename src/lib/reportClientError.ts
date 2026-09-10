import { supabase } from './supabase';

// Feeds the ADM desktop notification bell's "Erro detectado no navegador"
// entries (see migration 0061_notifications_admin_audience.sql — every
// row inserted here fires a DB trigger that creates one admin-audience
// notification, timestamped by notifications.created_at). This is a
// browser-observable-errors reporter, not a true hang/freeze detector: a
// genuinely hung main thread can't run this code either, so what actually
// gets caught is uncaught exceptions and unhandled promise rejections —
// the two error classes a page can reliably see itself.
//
// Only reports while signed in, since client_error_reports needs a
// store_id to attribute the report to — an error on the login screen
// itself has nowhere to go, so it's dropped (a real limitation, not an
// oversight). `setReportingProfile` is called from AuthContext on every
// profile load/clear, so this module always has the current store_id/
// profile_id on hand without its own extra round-trip per error.
let currentProfile: { storeId: string; profileId: string } | null = null;

export function setReportingProfile(profile: { storeId: string; profileId: string } | null) {
  currentProfile = profile;
}

const MAX_REPORTS_PER_SESSION = 20;
const reportedMessages = new Set<string>();
let reportCount = 0;

async function sendReport(message: string, stack: string | null, url: string) {
  if (!currentProfile) return;
  if (reportCount >= MAX_REPORTS_PER_SESSION) return;
  // Dedupe identical errors within this page load — a render loop throwing
  // the same error every frame would otherwise flood the ADM's inbox.
  if (reportedMessages.has(message)) return;
  reportedMessages.add(message);
  reportCount += 1;

  await supabase.from('client_error_reports').insert({
    store_id: currentProfile.storeId,
    profile_id: currentProfile.profileId,
    message: message.slice(0, 2000),
    stack: stack?.slice(0, 4000) ?? null,
    url,
  });
}

export function installClientErrorReporter() {
  window.addEventListener('error', (event) => {
    void sendReport(event.message || 'Erro desconhecido', event.error?.stack ?? null, window.location.href);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? (reason.stack ?? null) : null;
    void sendReport(`Promise rejeitada: ${message}`, stack, window.location.href);
  });
}
