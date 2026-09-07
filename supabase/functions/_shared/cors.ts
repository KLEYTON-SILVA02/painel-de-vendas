// Every Edge Function called directly from the browser (grant-collaborator-
// login, reset-collaborator-login) needs this: the app's origin
// (netlify/vercel deploys, and the Capacitor APK, which just loads the
// Vercel URL in a WebView — see capacitor.config.ts) is always different
// from *.supabase.co, so every invoke() is cross-origin. supabase-js sends
// a custom `Authorization` header, which forces the browser to preflight
// with an OPTIONS request before the real POST. Without a 2xx OPTIONS
// response carrying these headers, the browser never sends the POST at all
// and supabase-js surfaces that as "Failed to send a request to the Edge
// Function" — indistinguishable from a real network outage, since the
// function's own code (which returns a normal JSON error otherwise) never
// even runs. The same headers are needed on every actual response too, not
// just the preflight — the browser blocks reading a cross-origin response
// body without them just the same.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
