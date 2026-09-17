import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { SyncStatusChip } from '@/components/sync-status-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';
import { useCrewStops } from '@/lib/hooks/use-crew-stops';
import { supabase } from '@/lib/supabase';
import { todayLocalDate } from '@/lib/api';
import {
  elapsedSince,
  formatStopAddress,
  formatStopTimeWindow,
  stopProgress,
  stopServiceNames,
  STOP_PROGRESS_COLOR,
  STOP_PROGRESS_LABEL,
} from '@/lib/format';
import { applyDriveOverlay, applyStopQueueOverlay } from '@/lib/offline/overlay';
import { useOfflineQueue } from '@/lib/offline/queue-context';
import { unregisterPushToken } from '@/lib/notifications';
import { useTheme } from '@/hooks/use-theme';

const TODAY = todayLocalDate();

export default function HomeScreen() {
  const { session } = useAuth();
  const { stops: serverStops, crewName, drive: serverDrive, isLoading, isRefetching, error, refetch } =
    useCrewStops(TODAY);
  const { items, itemsForVisit, enqueueStartDrive, enqueueEndDrive } = useOfflineQueue();

  // Overlay each stop with its own pending queue actions (clock/pause) so a
  // stop clocked in or paused offline reads that way here immediately too,
  // not just on the detail screen — see src/lib/offline/overlay.ts.
  const stops = serverStops.map((s) => applyStopQueueOverlay(s, itemsForVisit(s.anchorVisitId)));

  // Drive segments are day-level, not tied to any one stop's anchor id, so
  // they're pulled straight from the full queue rather than itemsForVisit().
  const driveQueueItems = items.filter((i) => i.type === 'drive_start' || i.type === 'drive_end');
  const drive = applyDriveOverlay(serverDrive, driveQueueItems);

  // A drive_start/drive_end item renders correctly the moment it's queued
  // (via applyDriveOverlay's optimistic state) — but once the sync engine
  // confirms it with the server and clears it from the queue, that optimism
  // disappears and the banner has nothing left to show except `serverDrive`,
  // which is stale until the next refetch. Without this, "Start Drive" can
  // flash back on screen right after a successful sync, even though the
  // drive segment is genuinely open server-side, until the crew member
  // happens to leave and refocus this screen. Refetch the moment the drive
  // queue drains so the confirmed server state takes over seamlessly.
  const prevDriveQueueCount = useRef(driveQueueItems.length);
  useEffect(() => {
    if (prevDriveQueueCount.current > 0 && driveQueueItems.length === 0) {
      void refetch();
    }
    prevDriveQueueCount.current = driveQueueItems.length;
  }, [driveQueueItems.length, refetch]);

  const anyStopActive = stops.some((s) => {
    const p = stopProgress(s);
    return p === 'clocked_in' || p === 'on_break';
  });

  // Refresh whenever the tab regains focus — e.g. coming back from a stop
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

      <DriveBanner
        drive={drive}
        disabled={anyStopActive}
        onStartDrive={() => void enqueueStartDrive()}
        onEndDrive={() => void enqueueEndDrive()}
      />

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
      ) : stops.length === 0 ? (
        <View style={styles.centered}>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No jobs today
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptyBody}>
            You&apos;re not scheduled for anything today. Pull down to refresh.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={stops}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          renderItem={({ item }) => (
            <StopCard
              stop={item}
              onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.anchorVisitId } })}
            />
          )}
        />
      )}
    </ThemedView>
  );
}

function DriveBanner({
  drive,
  disabled,
  onStartDrive,
  onEndDrive,
}: {
  drive: ReturnType<typeof applyDriveOverlay>;
  disabled: boolean;
  onStartDrive: () => void;
  onEndDrive: () => void;
}) {
  if (drive.openSegment) {
    return (
      <Pressable style={[styles.driveBanner, styles.driveBannerActive]} onPress={onEndDrive}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.driveBannerTitle}>Driving</ThemedText>
          <ThemedText style={styles.driveBannerSubtitle}>
            Since {elapsedSince(drive.openSegment.startedAt)}
          </ThemedText>
        </View>
        <View style={styles.driveArrivedButton}>
          <ThemedText style={styles.driveArrivedButtonText}>Arrived</ThemedText>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.driveBannerRow}>
      <Pressable
        style={[styles.driveStartButton, disabled && styles.driveStartButtonDisabled]}
        onPress={onStartDrive}
        disabled={disabled}
      >
        <ThemedText style={styles.driveStartButtonText}>Start Drive</ThemedText>
      </Pressable>
      {drive.totalMinutes > 0 ? (
        <ThemedText themeColor="textSecondary" type="small">
          Drive today: {drive.totalMinutes}m
        </ThemedText>
      ) : null}
    </View>
  );
}

function StopCard({ stop, onPress }: { stop: ReturnType<typeof applyStopQueueOverlay>; onPress: () => void }) {
  const theme = useTheme();
  const progress = stopProgress(stop);
  const services = stopServiceNames(stop);

  return (
    <Pressable
      style={[styles.card, { backgroundColor: theme.backgroundElement }]}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.cardNameRow}>
            <ThemedText type="smallBold" style={styles.cardClientName}>
              {stop.clientName ?? 'Unknown client'}
            </ThemedText>
            {stop.visits.length > 1 ? (
              <View style={styles.serviceCountPill}>
                <ThemedText style={styles.serviceCountPillText}>{stop.visits.length} services</ThemedText>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: STOP_PROGRESS_COLOR[progress] }]}>
          <ThemedText style={styles.statusPillText}>{STOP_PROGRESS_LABEL[progress]}</ThemedText>
        </View>
      </View>
      <ThemedText themeColor="textSecondary" type="small">
        {formatStopTimeWindow(stop)}
      </ThemedText>
      {formatStopAddress(stop) ? (
        <ThemedText themeColor="textSecondary" type="small" numberOfLines={1}>
          {formatStopAddress(stop)}
        </ThemedText>
      ) : null}
      {services ? (
        <ThemedText themeColor="textSecondary" type="small" numberOfLines={1}>
          {services}
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
  driveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  driveBannerActive: {
    backgroundColor: '#208AEF18',
  },
  driveBannerTitle: {
    fontWeight: '700',
    color: '#208AEF',
  },
  driveBannerSubtitle: {
    fontSize: 12,
    color: '#208AEF',
  },
  driveArrivedButton: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  driveArrivedButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  driveBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  driveStartButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#208AEF',
  },
  driveStartButtonDisabled: {
    opacity: 0.4,
  },
  driveStartButtonText: {
    color: '#208AEF',
    fontWeight: '700',
    fontSize: 13,
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
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardClientName: {
    flexShrink: 1,
  },
  serviceCountPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#8a8a8a22',
  },
  serviceCountPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8a8a8a',
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
