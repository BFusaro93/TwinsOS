import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/lib/colors';
import { useLocale } from '@/lib/i18n';

const INK = '#111111';

// A compact "Back" bubble. The system back button takes its label from the previous
// screen's route name ("home"), which read oddly, and iOS draws it at a fixed, tall height;
// this is the same bubble look at a slimmer height, in black.
export function BackButton() {
  // Its own wording rather than t('Back'): that key is already the "Back" (returned to work)
  // button in Edit crew, which Spanish translates differently.
  const label = useLocale().locale === 'es' ? 'Atrás' : 'Back';
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.bubble, pressed && styles.pressed]}
    >
      <SymbolView
        name="chevron.left"
        size={13}
        weight="semibold"
        tintColor={INK}
        fallback={<Text style={styles.fallbackChevron}>‹</Text>}
      />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

/**
 * The header for screens pushed from the schedule: the Back bubble on the left and the
 * title in the middle. Drawn here rather than by the system header so the bubble's height
 * and text colour are ours.
 */
export function ScreenHeader({ title }: { title?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.side}>
        <BackButton />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  side: { width: 84, alignItems: 'flex-start' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: INK },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 32,
    paddingLeft: 9,
    paddingRight: 13,
    borderRadius: 16,
    backgroundColor: '#f4f4f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d4d4d8',
  },
  pressed: { opacity: 0.6 },
  label: { color: INK, fontSize: 15, fontWeight: '500' },
  fallbackChevron: { color: INK, fontSize: 22, lineHeight: 22 },
});
