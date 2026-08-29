import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { registerPushToken, unregisterPushTokenApi } from '@/lib/api';

// Registration/storage only. Nothing in this app (or the backend — see
// src/lib/notifications/send-push.ts in the web app repo) actually SENDS a
// push notification yet; that needs a live EAS project + a server-side call
// to Expo's push API, both out of scope for this phase. This module gets as
// far as: request permission, obtain a token, persist it. See the three
// intended triggers (new assignment, dispatcher note, requisition approval)
// documented in the stub referenced above.

let hasRegistered = false;

/**
 * Call once after sign-in (see AuthProvider/queue-context wiring in
 * src/app/_layout.tsx) to request notification permission and, if granted,
 * obtain and persist an Expo push token via POST /api/crm/crew/push-token.
 * Safe to call multiple times per session — no-ops after the first success
 * so re-renders/re-focuses don't repeatedly hit the permission prompt.
 *
 * Deliberately swallows every failure rather than surfacing it to the crew
 * member: push notifications are a "nice to have" for this phase (there is
 * nothing wired up server-side to send one yet — see the module comment
 * above), so a crew member should never see an error dialog over this.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  if (hasRegistered) return;

  try {
    if (!Device.isDevice) {
      // Push tokens aren't obtainable from a simulator/emulator.
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    // TODO(push-send): getExpoPushTokenAsync() needs an EAS project id
    // (crew-app/app.json has none yet — no eas.json, no extra.eas.projectId
    // — see the "what's missing" list in the web app's
    // src/lib/notifications/send-push.ts). Until `eas init` has been run
    // for this project, projectId is undefined and this call throws,
    // which the catch below silently absorbs — registration is a no-op
    // until that's set up, by design, not a bug.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await registerPushToken(tokenResponse.data);
    hasRegistered = true;
  } catch (err) {
    console.error('[notifications] registration failed (non-fatal)', err);
  }
}

/**
 * Call on sign-out (before supabase.auth.signOut(), so the session is still
 * valid for the DELETE request) to remove this device's token row and reset
 * the in-memory guard so the NEXT sign-in on this device (potentially a
 * different crew member, on a shared device) re-registers instead of
 * silently no-op'ing.
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    await unregisterPushTokenApi();
  } catch (err) {
    console.error('[notifications] unregistration failed (non-fatal)', err);
  } finally {
    hasRegistered = false;
  }
}
