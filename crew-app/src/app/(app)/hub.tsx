import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguageToggle } from '@/components/language-toggle';
import { SyncStatusChip } from '@/components/sync-status-chip';
import { fetchWebLink } from '@/lib/api';
import { C } from '@/lib/colors';
import { t } from '@/lib/i18n';
import { signOutCrew } from '@/lib/sign-out';

// The first screen after signing in — the native counterpart of the web crew home
// (src/app/(home)/home/page.tsx): My Schedule, Dashboards, and Field. My Schedule is this app's
// own schedule screen. Dashboards and Field are web pages, opened in an in-app browser that is
// signed in for the crew by a one-time link (POST /api/crm/crew/web-link), so they always match
// the browser version. Those two need a signal.

type CardKey = 'schedule' | 'dashboards' | 'field';

interface CardDef {
  key: CardKey;
  symbol: SFSymbol;
  fallback: string;
  title: string;
  subtitle: string;
}

export default function HubScreen() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<CardKey | null>(null);

  const cards: CardDef[] = [
    { key: 'schedule', symbol: 'calendar.badge.checkmark', fallback: '📅', title: t('My Schedule'), subtitle: t("Today's stops & job visits") },
    { key: 'dashboards', symbol: 'chart.bar.fill', fallback: '📊', title: t('Dashboards'), subtitle: t('Reports & analytics') },
    { key: 'field', symbol: 'camera.fill', fallback: '📷', title: t('Field'), subtitle: t('Job photos & field forms') },
  ];

  const open = async (key: CardKey) => {
    if (busy) return;
    if (key === 'schedule') {
      router.push('/home');
      return;
    }
    setBusy(key);
    try {
      const url = await fetchWebLink(key);
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        toolbarColor: C.card,
        controlsColor: C.blueText,
      });
    } catch (err) {
      Alert.alert(
        t("Couldn't open that page"),
        err instanceof Error && err.message ? err.message : t('Check your connection and try again.')
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}
    >
      <View style={styles.brand}>
        {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
        <Image source={require('../../../assets/images/icon.png')} style={styles.logo} />
        <Text style={styles.brandName}>Landscapt</Text>
        <Text style={styles.prompt}>{t('What would you like to do?')}</Text>
        <SyncStatusChip />
      </View>

      <View style={styles.cards}>
        {cards.map((c) => (
          <Pressable
            key={c.key}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => void open(c.key)}
            accessibilityRole="button"
          >
            <View style={styles.iconBox}>
              {busy === c.key ? (
                <ActivityIndicator color={C.green} />
              ) : (
                <SymbolView
                  name={c.symbol}
                  size={28}
                  tintColor={C.green}
                  fallback={<Text style={styles.fallbackIcon}>{c.fallback}</Text>}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{c.title}</Text>
              <Text style={styles.cardSubtitle}>{c.subtitle}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable onPress={() => router.push('/reference')} hitSlop={12}>
          <Text style={styles.link}>{t('Reference')}</Text>
        </Pressable>
        <LanguageToggle />
        <Pressable onPress={signOutCrew} hitSlop={12}>
          <Text style={styles.link}>{t('Sign out')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, gap: 24 },
  brand: { alignItems: 'center', gap: 6, marginTop: 8 },
  logo: { width: 64, height: 64, borderRadius: 16 },
  brandName: { fontSize: 28, fontWeight: '800', color: C.text, marginTop: 6 },
  prompt: { fontSize: 14, color: C.textMuted },
  cards: { gap: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 18,
  },
  cardPressed: { backgroundColor: C.headerBorder },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: C.greenBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: { fontSize: 26 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  cardSubtitle: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28, marginTop: 4 },
  link: { color: C.blueText, fontWeight: '600', fontSize: 14 },
});
