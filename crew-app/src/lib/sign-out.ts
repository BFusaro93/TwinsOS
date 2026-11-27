import { unregisterPushToken } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

/**
 * Signs the crew out. Removing this device's push token has to run before signOut(): the
 * DELETE /api/crm/crew/push-token request needs the still-valid session to identify whose token
 * row to remove, which matters on a shared device (see unregisterPushToken()).
 */
export function signOutCrew(): void {
  void unregisterPushToken().finally(() => {
    void supabase.auth.signOut();
  });
}
