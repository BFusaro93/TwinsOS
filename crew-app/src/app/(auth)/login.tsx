import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// Landscapt brand palette (src/components/shared/BrandMark.tsx, tailwind.config
// brand.500/600, and (auth)/login/page.tsx on the web) — kept in sync by hand
// since this app doesn't share the web app's Tailwind config.
const BRAND_DARK_GREEN = '#005642';
const BRAND_GREEN = '#60ab45';
const BRAND_GREEN_PRESSED = '#4a8a33';
const BRAND_BLUE = '#2aa9e0';
const BRAND_LIME = '#b7d433';

// Exact copy of src/components/shared/BrandMark.tsx's SVG (variant="color")
// — kept in sync by hand since this app doesn't share that component.
function BrandMark() {
  return (
    <Svg width={56} height={56} viewBox="0 0 48 48" role="img" aria-label="Brand mark">
      <Rect x={1} y={1} width={46} height={46} rx={11} fill={BRAND_DARK_GREEN} />
      <Path d="M15,13 L15,32" stroke={BRAND_BLUE} strokeWidth={5.5} fill="none" strokeLinecap="round" />
      <Path
        d="M15,32 L33,32"
        stroke={BRAND_GREEN}
        strokeWidth={5.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M22,32 L33,20" stroke={BRAND_LIME} strokeWidth={5.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export default function LoginScreen() {
  const { session, isLoading: isSessionLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Already signed in (e.g. a warm session was restored from AsyncStorage) —
  // bounce straight to the app rather than showing the login form.
  if (!isSessionLoading && session) {
    return <Redirect href="/home" />;
  }

  const handleSignIn = async () => {
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Enter your email and password.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // On success, the auth-state-change listener in AuthProvider updates
    // `session`, and the guard above (plus the (app) group guard) handles
    // navigating to /home — no manual router.push needed here.
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.brandBlock}>
          <BrandMark />
          <Text style={styles.wordmark}>landscapt</Text>
          <Text style={styles.tagline}>Sign in to your account</Text>
        </View>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#8a8a8a"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            editable={!isSubmitting}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#8a8a8a"
            secureTextEntry
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            editable={!isSubmitting}
            onSubmitEditing={handleSignIn}
          />

          {errorMessage ? (
            <ThemedText style={styles.error}>{errorMessage}</ThemedText>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={handleSignIn}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  wordmark: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: BRAND_DARK_GREEN,
  },
  tagline: {
    fontSize: 14,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#c7c7c7',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    color: '#d9342b',
    textAlign: 'center',
  },
  button: {
    marginTop: 4,
    backgroundColor: BRAND_GREEN,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: BRAND_GREEN_PRESSED,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
});
