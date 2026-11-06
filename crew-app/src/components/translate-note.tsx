import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { translateNote, type TranslatedNote } from '@/lib/api';
import { C } from '@/lib/colors';
import { currentLocale, t } from '@/lib/i18n';

// "Translate" under a note: shows it in the active app language beneath the
// original, which is never replaced. Needs a connection the first time; each
// result is cached on the phone so a note is only translated once per language.

function cacheKey(target: string, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `crew.tr:${target}:${text.length}:${h}`;
}

export function TranslateNote({ text }: { text: string }) {
  const target = currentLocale();
  const [result, setResult] = useState<TranslatedNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!text.trim()) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = cacheKey(target, text);
      const cached = await AsyncStorage.getItem(key).catch(() => null);
      if (cached) {
        setResult(JSON.parse(cached) as TranslatedNote);
        return;
      }
      const res = await translateNote(text, target);
      setResult(res);
      AsyncStorage.setItem(key, JSON.stringify(res)).catch(() => {
        /* only costs a repeat request next time */
      });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("Couldn't translate this right now."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {result ? (
        result.sameLanguage ? (
          <Text style={styles.muted}>{target === 'es' ? t('Already in Spanish') : t('Already in English')}</Text>
        ) : (
          <View style={styles.box}>
            <Text style={styles.body}>{result.translated}</Text>
            <Text style={styles.caption}>{t('Translated automatically')}</Text>
          </View>
        )
      ) : (
        <Pressable onPress={() => void run()} disabled={busy} hitSlop={8} style={styles.button}>
          {busy ? <ActivityIndicator size="small" /> : null}
          <Text style={styles.link}>{target === 'es' ? t('Translate to Spanish') : t('Translate to English')}</Text>
        </Pressable>
      )}
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
