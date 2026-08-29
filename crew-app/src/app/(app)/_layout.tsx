import { ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';

/**
 * Guards every screen under the (app) group: unauthenticated users are
 * bounced to /login before any child screen renders. Screens (schedule,
 * clock in/out, etc.) live under this group so they inherit the guard for
 * free. Uses a Stack (rather than Slot) so home.tsx can push visit/[id].tsx.
 */
export default function AppLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="visit/[id]" options={{ headerShown: true, title: 'Visit' }} />
      <Stack.Screen
        name="visit/request-materials"
        options={{ headerShown: true, title: 'Request Materials', presentation: 'modal' }}
      />
    </Stack>
  );
}
