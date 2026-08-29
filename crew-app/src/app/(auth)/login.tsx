import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Redirect } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

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
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          Crew App
        </ThemedText>
        <ThemedText type="subtitle" style={styles.subtitle}>
          Sign in
        </ThemedText>

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
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.buttonText}>Sign in</ThemedText>
          )}
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
    lineHeight: 38,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 16,
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
    marginTop: 8,
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
