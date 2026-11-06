import { Pressable, StyleSheet, Text } from 'react-native';

import { C } from '@/lib/colors';
import { useLocale } from '@/lib/i18n';

/** Español / English switch. Shows the language you would switch TO, in that language. */
export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <Pressable onPress={() => setLocale(locale === 'es' ? 'en' : 'es')} hitSlop={12} accessibilityRole="button">
      <Text style={styles.link}>{locale === 'es' ? 'English' : 'Español'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { color: C.blue, fontSize: 14, fontWeight: '600' },
});
