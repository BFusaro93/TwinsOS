import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/lib/auth-context';
import { OfflineQueueProvider } from '@/lib/offline/queue-context';

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* Above (app) so the queue/sync engine is alive for the whole
          authenticated session, not just while a particular screen is
          mounted — a queued action must keep trying to sync even if the
          crew member navigates away from the screen that created it. */}
      <OfflineQueueProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </OfflineQueueProvider>
    </AuthProvider>
  );
}
