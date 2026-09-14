import { ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';

/**
 * Root entry point. Waits for the initial Supabase session lookup, then
 * hands off to the appropriate route group. This is the only screen that
 * "guesses" where to go — (auth) and (app) each also guard themselves
 * (see their _layout.tsx files) so deep links land somewhere sane too.
 */
export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return <Redirect href={session ? '/home' : '/login'} />;
}
