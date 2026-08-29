import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { SyncStatusChip } from '@/components/sync-status-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useCrewVisits } from '@/lib/hooks/use-crew-visits';
import { supabase } from '@/lib/supabase';
import { todayLocalDate } from '@/lib/api';
import { formatAddress, formatTimeWindow, PROGRESS_COLOR, PROGRESS_LABEL, visitProgress } from '@/lib/format';
import { applyQueueOverlay } from '@/lib/offline/overlay';
import { useOfflineQueue } from '@/lib/offline/queue-context';
import { unregisterPushToken } from '@/lib/notifications';
import type { CrewVisit } from '@/lib/types';
import { useTheme } from '@/hooks/use-theme';

const TODAY = todayLocalDate();

export default function HomeScreen() {
  const { session } = useAuth();
  const { visits: serverVisits, crewName, isLoading, isRefetching, error, refetch } = useCrewVisits(TODAY);
  const { itemsForVisit } = useOfflineQueue();
  // Overlay each visit with its own pending queue actions so a card clocked
  // in offline reads "Clocked in" here immediately too, not just on the
  // detail screen — see src/lib/offline/overlay.ts.
  const visits = serverVisits.map((v) => applyQueueOverlay(v, itemsForVisit(v.id)));

  // Refresh whenever the tab regains focus — e.g. coming back from a visit
  // detail screen after clocking in/out.
  useFocusEffect(
    useCallback(() => {
      void refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const handleSignOut = () => {
    // Must run before signOut() — DELETE /api/crm/crew/push-token needs the
    // still-valid session to identify whose token row to remove. See
    // unregisterPushToken()'s own comment for why this matters on a shared
    // device.
    void unregisterPushToken().finally(() => {
      void supabase.auth.signOut();
    });
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText type="title" style={styles.title}>
            Today
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            {crewName ? crewName : session?.user.email ?? 'Crew'} · {TODAY}
          </ThemedText>
          <View style={styles.chipRow}>
            <SyncStatusChip />
          </View>
        </View>
        <Pressable onPress={handleSignOut} hitSlop={12}>
          <ThemedText type="linkPrimary">Sign out</ThemedText>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <ThemedText style={styles.retryButtonText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : visits.length === 0 ? (
        <View style={styles.centered}>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No visits today
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptyBody}>
            You&apos;re not scheduled for anything today. Pull down to refresh.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          renderItem={({ item }) => (
            <VisitCard visit={item} onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })} />
          )}
        />
      )}
    </ThemedView>
  );
}

function VisitCard({ visit, onPress }: { visit: CrewVisit; onPress: () => void }) {
  const theme = useTheme();
  const progress = visitProgress(visit);

  return (
    <Pressable
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        <ThemedText type="smallBold" style={styles.cardClientName}>
          {visit.clientName ?? 'Unknown client'}
        </ThemedText>
        <View style={[styles.statusPill, { backgroundColor: PROGRESS_COLOR[progress] }]}>
          <ThemedText style={styles.statusPillText}>{PROGRESS_LABEL[progress]}</ThemedText>
        </View>
      </View>
      <ThemedText themeColor="textSecondary" type="small">
        {formatTimeWindow(visit)}
      </ThemedText>
      {formatAddress(visit) ? (
        <ThemedText themeColor="textSecondary" type="small" numberOfLines={1}>
          {formatAddress(visit)}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: 2,
  },
  chipRow: {
    marginTop: 8,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardClientName: {
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
  },
  errorText: {
    color: '#d9342b',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
