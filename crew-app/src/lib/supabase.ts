import 'react-native-url-polyfill/auto';

import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { LargeSecureStore } from './secure-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Check crew-app/.env.'
  );
}

// React Native has no cookies, so this mirrors the web app's auth *behavior*
// (src/lib/supabase/*) but not its mechanism: the web app uses @supabase/ssr
// with cookie-based sessions via createServerClient/createBrowserClient. This
// client instead persists the session via LargeSecureStore (see
// ./secure-storage — AES-encrypted in AsyncStorage, key in the OS
// keychain/keystore, not a plain AsyncStorage JSON blob) and refreshes it
// automatically. Always import `supabase` from this module — never
// instantiate a second client, or the two would maintain separate (and
// eventually conflicting) sessions.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: new LargeSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// supabase-js's refresh timer doesn't run while the app is suspended, so a
// phone that sat in a pocket past the access token's expiry came back with a
// dead token and every API call 401'd ("Unauthorized") until a restart. The
// documented fix for React Native: stop the ticker in the background and, on
// returning to the foreground, restart it (which refreshes an expired session
// immediately).
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
