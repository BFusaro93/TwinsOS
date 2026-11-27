import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text } from 'react-native';

import { C } from '@/lib/colors';
import { useLocale } from '@/lib/i18n';

// A compact header back button: a chevron and "Back". The system back button
// takes its label from the previous screen's route name ("home"), which read
// oddly, and iOS draws it as a large pill; this is smaller and says what it does.
export function BackButton() {
  // Its own wording rather than t('Back'): that key is already the "Back" (returned to work)
  // button in Edit crew, which Spanish translates differently.
  const label = useLocale().locale === 'es' ? 'Atrás' : 'Back';
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 16 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <SymbolView
        name="chevron.left"
        size={16}
        tintColor={C.blueText}
        fallback={<Text style={styles.fallbackChevron}>‹</Text>}
      />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.6 },
  label: { color: C.blueText, fontSize: 16, fontWeight: '500' },
  fallbackChevron: { color: C.blueText, fontSize: 24, lineHeight: 24 },
});
