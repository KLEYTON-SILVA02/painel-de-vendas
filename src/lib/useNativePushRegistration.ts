import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useRegisterPushToken } from './mutations';

/** Registers this device for native push the moment it's running inside
 * the Capacitor-wrapped app (Etapa 2) — a no-op in the browser/PWA build,
 * where `isNativePlatform()` is always false. Requires the Android project
 * to have `google-services.json` in place (see android/app/build.gradle's
 * conditional `apply plugin` — without that file this plugin's native side
 * never initializes and `register()` simply never fires the token event,
 * so this hook safely does nothing until Firebase is wired in). */
export function useNativePushRegistration(collaboratorId: string | undefined) {
  const registerToken = useRegisterPushToken();

  useEffect(() => {
    if (!collaboratorId || !Capacitor.isNativePlatform()) return;

    let cancelled = false;

    async function setup() {
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive !== 'granted') {
        const requested = await PushNotifications.requestPermissions();
        if (requested.receive !== 'granted') return;
      }
      if (cancelled) return;
      await PushNotifications.register();
    }

    const registrationHandle = PushNotifications.addListener('registration', (token) => {
      if (!collaboratorId) return;
      registerToken.mutate({ collaboratorId, token: token.value, platform: Capacitor.getPlatform() as 'android' | 'ios' });
    });
    const errorHandle = PushNotifications.addListener('registrationError', (err) => {
      console.error('Falha ao registrar push notification:', err);
    });

    setup();

    return () => {
      cancelled = true;
      registrationHandle.then((h) => h.remove());
      errorHandle.then((h) => h.remove());
    };
    // registerToken is a fresh useMutation() object every render — only
    // collaboratorId should re-run the native registration flow.
  }, [collaboratorId]);
}
