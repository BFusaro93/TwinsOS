import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { SyncStatusChip } from '@/components/sync-status-chip';
import { useAuth } from '@/lib/auth-context';
import { C } from '@/lib/colors';
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

  const completedCount = stops.filter((s) => stopProgress(s) === 'completed').length;

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
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Today</Text>
            <Text style={styles.title}>{crewName ? crewName : session?.user.email ?? 'Crew'}</Text>
          </View>
          <Pressable onPress={handleSignOut} hitSlop={12}>
            <Text style={styles.signOutLink}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.chipRow}>
          <SyncStatusChip />
        </View>

        {stops.length > 0 ? (
          <View style={styles.progressBlock}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>
                {completedCount} of {stops.length} complete
              </Text>
              <Text style={styles.progressLabel}>
                {Math.round((completedCount / stops.length) * 100)}%
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(completedCount / stops.length) * 100}%` },
                ]}
              />
            </View>
          </View>
        ) : null}
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
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : stops.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No jobs today</Text>
          <Text style={styles.emptyBody}>
            You&apos;re not scheduled for anything today. Pull down to refresh.
          </Text>
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
    </View>
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
      <Pressable
        style={({ pressed }) => [styles.driveBanner, pressed && styles.driveBannerPressed]}
        onPress={onEndDrive}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.driveBannerTitle}>Driving</Text>
          <Text style={styles.driveBannerSubtitle}>
            Since {elapsedSince(drive.openSegment.startedAt)}
          </Text>
        </View>
        <View style={styles.driveArrivedButton}>
          <Text style={styles.driveArrivedButtonText}>Arrived</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.driveBannerRow}>
      <Pressable
        style={({ pressed }) => [
          styles.driveStartButton,
          pressed && !disabled && styles.driveStartButtonPressed,
          disabled && styles.driveStartButtonDisabled,
        ]}
        onPress={onStartDrive}
        disabled={disabled}
      >
        <Text style={styles.driveStartButtonText}>Start Drive</Text>
      </Pressable>
      {drive.totalMinutes > 0 ? (
        <Text style={styles.driveTodayText}>Drive today: {drive.totalMinutes}m</Text>
      ) : null}
    </View>
  );
}

function StopCard({ stop, onPress }: { stop: ReturnType<typeof applyStopQueueOverlay>; onPress: () => void }) {
  const progress = stopProgress(stop);
  const services = stopServiceNames(stop);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardTopRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardClientName} numberOfLines={1}>
              {stop.clientName ?? 'Unknown client'}
            </Text>
            {stop.visits.length > 1 ? (
              <View style={styles.serviceCountPill}>
                <Text style={styles.serviceCountPillText}>{stop.visits.length} services</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardMeta}>{formatStopTimeWindow(stop)}</Text>
          {formatStopAddress(stop) ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {formatStopAddress(stop)}
            </Text>
          ) : null}
          {services ? (
            <Text style={styles.cardMeta} numberOfLines={1}>
              {services}
            </Text>
          ) : null}
        </View>
        <View style={styles.cardStatusColumn}>
          <View style={[styles.statusPill, { backgroundColor: STOP_PROGRESS_COLOR[progress] }]}>
            <Text style={styles.statusPillText}>{STOP_PROGRESS_LABEL[progress]}</Text>
          </View>
          {progress === 'on_break' ? <Text style={styles.onBreakText}>On Break</Text> : null}
        </View>
      </View>

      {stop.notesToCrew ? (
        <View style={styles.cardNote}>
          <Text style={styles.cardNoteText} numberOfLines={2}>
            {stop.notesToCrew}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: C.textFaint,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: C.text,
    marginTop: 2,
  },
  signOutLink: {
    color: C.blueText,
    fontWeight: '600',
    fontSize: 15,
  },
  chipRow: {
    marginTop: 10,
    flexDirection: 'row',
  },
  progressBlock: {
    marginTop: 14,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: C.textMuted,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: C.headerBorder,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: C.green,
  },

  driveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.blueBorder,
    backgroundColor: C.blueBg,
    padding: 14,
    gap: 10,
  },
  driveBannerPressed: {
    backgroundColor: C.blueBorder,
  },
  driveBannerTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: C.blueText,
  },
  driveBannerSubtitle: {
    fontSize: 12,
    color: C.blue,
    marginTop: 2,
  },
  driveArrivedButton: {
    backgroundColor: C.blue,
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
    marginTop: 16,
    gap: 10,
  },
  driveStartButton: {
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: C.blue,
    backgroundColor: C.blueBg,
  },
  driveStartButtonPressed: {
    backgroundColor: C.blueBorder,
  },
  driveStartButtonDisabled: {
    opacity: 0.4,
  },
  driveStartButtonText: {
    color: C.blueText,
    fontWeight: '700',
    fontSize: 14,
  },
  driveTodayText: {
    fontSize: 12,
    color: C.textMuted,
  },

  list: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  cardPressed: {
    backgroundColor: C.headerBorder,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardClientName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  cardMeta: {
    fontSize: 13,
    color: C.textMuted,
    marginTop: 4,
  },
  serviceCountPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: C.headerBorder,
  },
  serviceCountPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textMuted,
  },
  cardStatusColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  onBreakText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.blueText,
  },
  cardNote: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.headerBorder,
  },
  cardNoteText: {
    fontSize: 12,
    color: C.amberText,
    backgroundColor: C.amberBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
    color: C.textMuted,
  },
  errorText: {
    color: C.redText,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: C.blue,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
