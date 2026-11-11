import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { translateNote, type TranslatedNote } from '@/lib/api';
import { C } from '@/lib/colors';
import { currentLocale, t } from '@/lib/i18n';

// "Translate" under a note: shows it in Spanish and/or English beneath the
// original, which is never replaced (both directions are offered). Needs a connection the first time; each
// result is cached on the phone so a note is only translated once per language.

function cacheKey(target: string, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `crew.tr:${target}:${text.length}:${h}`;
}

type Target = 'en' | 'es';

export function TranslateNote({ text }: { text: string }) {
  const own = currentLocale() as Target;
  const other: Target = own === 'es' ? 'en' : 'es';
  const [results, setResults] = useState<Partial<Record<Target, TranslatedNote>>>({});
  const [busyTarget, setBusyTarget] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!text.trim()) return null;

  const run = async (target: Target) => {
    setBusyTarget(target);
    setError(null);
    try {
      const key = cacheKey(target, text);
      const cached = await AsyncStorage.getItem(key).catch(() => null);
      if (cached) {
        setResults((prev) => ({ ...prev, [target]: JSON.parse(cached) as TranslatedNote }));
        return;
      }
      const res = await translateNote(text, target);
      setResults((prev) => ({ ...prev, [target]: res }));
      AsyncStorage.setItem(key, JSON.stringify(res)).catch(() => {
        /* only costs a repeat request next time */
      });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("Couldn't translate this right now."));
    } finally {
      setBusyTarget(null);
    }
  };

  // Both directions are offered; the app's own language just decides which link comes first.
  const order: Target[] = [own, other];

  return (
    <View style={styles.wrap}>
      {order.map((target) => {
        const result = results[target];
        if (!result) return null;
        return result.sameLanguage ? (
          <Text key={target} style={styles.muted}>{target === 'es' ? t('Already in Spanish') : t('Already in English')}</Text>
        ) : (
          <View key={target} style={styles.box}>
            <Text style={styles.body}>{result.translated}</Text>
            <Text style={styles.caption}>{t('Translated automatically')}</Text>
          </View>
        );
      })}
      {order
        .filter((target) => !results[target])
        .map((target) => (
          <Pressable key={target} onPress={() => void run(target)} disabled={busyTarget !== null} hitSlop={8} style={styles.button}>
            {busyTarget === target ? <ActivityIndicator size="small" /> : null}
            <Text style={styles.link}>{target === 'es' ? t('Translate to Spanish') : t('Translate to English')}</Text>
          </Pressable>
        ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  link: { color: C.blue, fontSize: 13, fontWeight: '600' },
  box: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: 10, gap: 4 },
  body: { fontSize: 14, color: C.text },
  caption: { fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  muted: { fontSize: 12, color: C.textMuted },
  error: { fontSize: 12, color: C.redText, marginTop: 4 },
});
