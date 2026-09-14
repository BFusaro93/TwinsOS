import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';

import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  /** The current Supabase auth session, or null when signed out. */
  session: Session | null;
  /** True until the initial session lookup (from AsyncStorage) resolves. */
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Wraps the app and exposes the current Supabase session via `useAuth()`.
 * Future screens (e.g. Phase 2's schedule/clock-in views) should read the
 * session from this context rather than calling supabase.auth.getSession()
 * directly, so there is a single source of truth that reacts to sign-in/out.
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
      if (data.session) void registerForPushNotificationsAsync();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setIsLoading(false);
      if (newSession) void registerForPushNotificationsAsync();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ session, isLoading }), [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
