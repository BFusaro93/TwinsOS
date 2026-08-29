import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { SyncStatusChip } from '@/components/sync-status-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { fetchVisitPhotos, fetchVisitRequisitions, todayLocalDate } from '@/lib/api';
import { useCrewVisits } from '@/lib/hooks/use-crew-visits';
import {
  elapsedSince,
  formatAddress,
  formatTimeWindow,
  PROGRESS_COLOR,
  PROGRESS_LABEL,
  STATUS_LABEL,
  visitProgress,
} from '@/lib/format';
import { applyQueueOverlay } from '@/lib/offline/overlay';
import { captureVisitPhoto } from '@/lib/offline/photos';
import { useOfflineQueue } from '@/lib/offline/queue-context';
import type { AddPhotoPayload, RequestMaterialsPayload } from '@/lib/offline/types';
import type { VisitPhoto, VisitRequisition } from '@/lib/types';

const REQUISITION_STATUS_LABEL: Record<VisitRequisition['status'], string> = {
  draft: 'Submitted',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  ordered: 'Ordered',
  closed: 'Closed',
};

const REQUISITION_STATUS_COLOR: Record<VisitRequisition['status'], string> = {
  draft: '#c98a1f',
  pending_approval: '#c98a1f',
  approved: '#2fa84f',
  rejected: '#d9342b',
  ordered: '#2fa84f',
  closed: '#8a8a8a',
};

const TODAY = todayLocalDate();

/** HH:mm in the device's local time, captured at the moment of the tap. */
function localTimeNow(): string {
  return new Date().toTimeString().slice(0, 5);
}

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  // Today's schedule is the only data source this phase has — there's no
  // single-visit GET route yet, so this screen shares useCrewVisits() with
  // home.tsx and looks its visit up by id.
  const { visits, isLoading, error, refetch } = useCrewVisits(TODAY);
  const { itemsForVisit, enqueueClockIn, enqueueClockOut, enqueueAddPhoto, retry, discard } =
    useOfflineQueue();
  const [notes, setNotes] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [confirmedPhotos, setConfirmedPhotos] = useState<VisitPhoto[]>([]);
  const [requisitions, setRequisitions] = useState<VisitRequisition[]>([]);
  const [, forceTick] = useState(0);

  const serverVisit = useMemo(() => visits.find((v) => v.id === id), [visits, id]);
  const queueItems = useMemo(() => (id ? itemsForVisit(id) : []), [id, itemsForVisit]);
  const visit = useMemo(
    () => (serverVisit ? applyQueueOverlay(serverVisit, queueItems) : undefined),
    [serverVisit, queueItems]
  );
  const progress = visit ? visitProgress(visit) : null;

  const clockQueueItems = queueItems.filter((i) => i.type === 'clock_in' || i.type === 'clock_out');
  const failedClockItem = clockQueueItems.find((i) => i.status === 'failed');
  const isClockActionPending = clockQueueItems.some((i) => i.status === 'pending' || i.status === 'syncing');

  const photoQueueItems = queueItems.filter((i) => i.type === 'add_photo');
  const materialsQueueItems = queueItems.filter((i) => i.type === 'request_materials');

  // Once every queue item for this visit clears (synced), pull fresh server
  // truth — e.g. server-computed actual_hours after a clock-out, or a newly
  // created requisition's real status.
  const prevActiveCountRef = useRef(0);
  useEffect(() => {
    const activeCount = queueItems.filter((i) => i.status !== 'failed').length;
    if (prevActiveCountRef.current > 0 && activeCount === 0) {
      void refetch();
      void loadPhotos();
      void loadRequisitions();
    }
    prevActiveCountRef.current = activeCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueItems]);

  async function loadPhotos() {
    if (!id) return;
    try {
      const photos = await fetchVisitPhotos(id);
      setConfirmedPhotos(photos);
    } catch {
      // Offline or transient failure — the queued/local photos still render below,
      // so this silently keeping the last-known confirmed list is acceptable.
    }
  }

  async function loadRequisitions() {
    if (!id) return;
    try {
      const data = await fetchVisitRequisitions(id);
      setRequisitions(data);
    } catch {
      // Same tolerance as loadPhotos() above — a stale "My Requests" list
      // while offline is acceptable; queued/unsynced requests still render.
    }
  }

  useEffect(() => {
    void loadPhotos();
    void loadRequisitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Re-render every 30s so the "clocked in for Xh Ym" readout stays live.
  useEffect(() => {
    if (progress !== 'clocked_in') return;
    const interval = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, [progress]);

  const handleClockIn = () => {
    if (!visit) return;
    // Written to the local queue immediately — this resolves synchronously
    // from the UI's perspective (no network wait), which is what makes the
    // "Clocked In" state below reflect the tap right away.
    void enqueueClockIn(visit.id, localTimeNow());
  };

  const handleClockOut = () => {
    if (!visit) return;
    void enqueueClockOut(visit.id, localTimeNow(), notes.trim() || undefined);
  };

  const handleAddPhoto = async (source: 'camera' | 'library') => {
    if (!visit) return;
    setPhotoError(null);
    setIsCapturing(true);
    try {
      const captured = await captureVisitPhoto(visit.id, source);
      if (!captured) return; // user canceled
      await enqueueAddPhoto(visit.id, captured.localUri, captured.mimeType, captured.fileName);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to add photo');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRequestMaterials = () => {
    if (!visit) return;
    router.push({ pathname: '/visit/request-materials', params: { visitId: visit.id } });
  };

  const confirmDiscard = (queueItemId: string, description: string) => {
    Alert.alert('Discard this?', description, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discard(queueItemId) },
    ]);
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <Pressable style={styles.retryButton} onPress={() => void refetch()}>
          <ThemedText style={styles.retryButtonText}>Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  if (!visit) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText type="subtitle" style={styles.emptyTitle}>
          Visit not found
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.emptyBody}>
          This visit isn&apos;t in today&apos;s schedule anymore.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: visit.clientName ?? 'Visit' }} />

      <SyncStatusChip />

      <View style={styles.headerRow}>
        <ThemedText type="subtitle" style={styles.clientName}>
          {visit.clientName ?? 'Unknown client'}
        </ThemedText>
        <View style={[styles.statusPill, { backgroundColor: PROGRESS_COLOR[progress!] }]}>
          <ThemedText style={styles.statusPillText}>{PROGRESS_LABEL[progress!]}</ThemedText>
        </View>
      </View>

      <InfoRow label="Time window" value={formatTimeWindow(visit)} />
      {formatAddress(visit) ? <InfoRow label="Address" value={formatAddress(visit)!} /> : null}
      {visit.clientPhone ? <InfoRow label="Phone" value={visit.clientPhone} /> : null}
      <InfoRow label="Status" value={STATUS_LABEL[visit.status]} />

      {visit.notesToCrew ? (
        <View style={[styles.notesBox, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Notes from the office</ThemedText>
          <ThemedText style={styles.notesText}>{visit.notesToCrew}</ThemedText>
        </View>
      ) : null}

      {progress === 'clocked_in' && visit.clockedInAt ? (
        <ThemedText themeColor="textSecondary" style={styles.elapsed}>
          Clocked in for {elapsedSince(visit.clockedInAt)}
          {isClockActionPending ? ' · not yet synced' : ''}
        </ThemedText>
      ) : null}

      {progress === 'completed' ? (
        <View style={styles.completedSummary}>
          {visit.actualHours != null ? (
            <InfoRow label="Actual hours" value={visit.actualHours.toFixed(2)} />
          ) : null}
          {visit.completionNotes ? (
            <InfoRow label="Completion notes" value={visit.completionNotes} />
          ) : null}
          {isClockActionPending ? (
            <ThemedText themeColor="textSecondary" type="small">
              Not yet synced — will confirm once back online.
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {failedClockItem ? (
        <View style={styles.conflictBox}>
          <ThemedText style={styles.conflictText}>{failedClockItem.lastError}</ThemedText>
          <View style={styles.conflictActions}>
            <Pressable style={styles.conflictButton} onPress={() => void retry(failedClockItem.id)}>
              <ThemedText style={styles.conflictButtonText}>Retry</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.conflictButton, styles.conflictButtonSecondary]}
              onPress={() =>
                confirmDiscard(
                  failedClockItem.id,
                  'This will drop the unsynced action. Pull to refresh afterwards to see the current state.'
                )
              }
            >
              <ThemedText style={styles.conflictButtonText}>Discard</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {progress === 'clocked_in' ? (
        <TextInput
          style={[styles.notesInput, { color: theme.text, borderColor: theme.backgroundSelected }]}
          placeholder="Completion notes (optional)"
          placeholderTextColor="#8a8a8a"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      ) : null}

      {progress === 'not_started' ? (
        <ActionButton label="Clock In" color="#208AEF" onPress={handleClockIn} />
      ) : null}

      {progress === 'clocked_in' ? (
        <ActionButton label="Clock Out" color="#d9342b" onPress={handleClockOut} />
      ) : null}

      {progress === 'completed' ? (
        <ThemedText themeColor="textSecondary" style={styles.doneText}>
          This visit is complete.
        </ThemedText>
      ) : null}

      {progress === 'skipped' ? (
        <ThemedText themeColor="textSecondary" style={styles.doneText}>
          This visit was skipped or cancelled.
        </ThemedText>
      ) : null}

      <PhotosSection
        confirmedPhotos={confirmedPhotos}
        photoQueueItems={photoQueueItems}
        isCapturing={isCapturing}
        photoError={photoError}
        onAdd={handleAddPhoto}
        onRetry={(itemId) => void retry(itemId)}
        onDiscard={(itemId) =>
          confirmDiscard(itemId, 'This photo will not be uploaded. It stays saved on this device.')
        }
        theme={theme}
      />

      <MaterialsSection
        requisitions={requisitions}
        materialsQueueItems={materialsQueueItems}
        onRequest={handleRequestMaterials}
        onRetry={(itemId) => void retry(itemId)}
        onDiscard={(itemId) =>
          confirmDiscard(itemId, 'This materials request will not be submitted.')
        }
        theme={theme}
      />
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText themeColor="textSecondary" type="small" style={styles.infoLabel}>
        {label}
      </ThemedText>
      <ThemedText style={styles.infoValue}>{value}</ThemedText>
    </View>
  );
}

function ActionButton({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.actionButton, { backgroundColor: color }]} onPress={onPress}>
      <ThemedText style={styles.actionButtonText}>{label}</ThemedText>
    </Pressable>
  );
}

function PhotosSection({
  confirmedPhotos,
  photoQueueItems,
  isCapturing,
  photoError,
  onAdd,
  onRetry,
  onDiscard,
  theme,
}: {
  confirmedPhotos: VisitPhoto[];
  photoQueueItems: ReturnType<typeof useOfflineQueue>['items'];
  isCapturing: boolean;
  photoError: string | null;
  onAdd: (source: 'camera' | 'library') => void;
  onRetry: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.photosSection}>
      <ThemedText type="smallBold">Job photos</ThemedText>

      <View style={styles.photoButtonRow}>
        <Pressable
          style={[styles.photoButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => onAdd('camera')}
          disabled={isCapturing}
        >
          <ThemedText type="small">Take Photo</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.photoButton, { backgroundColor: theme.backgroundElement }]}
          onPress={() => onAdd('library')}
          disabled={isCapturing}
        >
          <ThemedText type="small">Choose from Library</ThemedText>
        </Pressable>
        {isCapturing ? <ActivityIndicator size="small" /> : null}
      </View>

      {photoError ? <ThemedText style={styles.errorText}>{photoError}</ThemedText> : null}

      {confirmedPhotos.length === 0 && photoQueueItems.length === 0 ? (
        <ThemedText themeColor="textSecondary" type="small">
          No photos yet.
        </ThemedText>
      ) : (
        <View style={styles.photoGrid}>
          {confirmedPhotos.map((photo) => (
            <View key={photo.id} style={styles.photoTile}>
              {photo.signedUrl ? (
                <Image source={{ uri: photo.signedUrl }} style={styles.photoImage} />
              ) : (
                <View style={[styles.photoImage, styles.photoPlaceholder]} />
              )}
            </View>
          ))}

          {photoQueueItems.map((item) => {
            const payload = item.payload as AddPhotoPayload;
            return (
              <View key={item.id} style={styles.photoTile}>
                <Image source={{ uri: payload.localUri }} style={[styles.photoImage, styles.photoDimmed]} />
                <View
                  style={[
                    styles.photoBadge,
                    { backgroundColor: item.status === 'failed' ? '#d9342b' : '#c98a1f' },
                  ]}
                >
                  <ThemedText style={styles.photoBadgeText}>
                    {item.status === 'failed' ? 'Failed' : item.status === 'syncing' ? 'Uploading…' : 'Queued'}
                  </ThemedText>
                </View>
                {item.status === 'failed' ? (
                  <View style={styles.photoFailedActions}>
                    <Pressable onPress={() => onRetry(item.id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Retry
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => onDiscard(item.id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Discard
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * "Request Materials" action + "My Requests" status list — Equipt's
 * Requisition system surfaced for the field. A queued-but-not-yet-synced
 * request (materialsQueueItems, status 'pending'/'syncing'/'failed') renders
 * alongside server-confirmed ones (requisitions, from GET
 * /api/crm/crew/visits/:id/requisitions) rather than merging into a single
 * list — unlike clock state (see src/lib/offline/overlay.ts) a materials
 * request has no server "current value" to optimistically overwrite; it's
 * purely additive, so there's nothing to merge, only two lists to show
 * together.
 */
function MaterialsSection({
  requisitions,
  materialsQueueItems,
  onRequest,
  onRetry,
  onDiscard,
  theme,
}: {
  requisitions: VisitRequisition[];
  materialsQueueItems: ReturnType<typeof useOfflineQueue>['items'];
  onRequest: () => void;
  onRetry: (itemId: string) => void;
  onDiscard: (itemId: string) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.materialsSection}>
      <View style={styles.materialsHeaderRow}>
        <ThemedText type="smallBold">Materials requests</ThemedText>
        <Pressable
          style={[styles.materialsRequestButton, { backgroundColor: theme.backgroundElement }]}
          onPress={onRequest}
        >
          <ThemedText type="small">Request Materials</ThemedText>
        </Pressable>
      </View>

      {requisitions.length === 0 && materialsQueueItems.length === 0 ? (
        <ThemedText themeColor="textSecondary" type="small">
          No materials requested for this visit.
        </ThemedText>
      ) : (
        <View style={styles.materialsList}>
          {materialsQueueItems.map((item) => {
            const payload = item.payload as RequestMaterialsPayload;
            return (
              <View
                key={item.id}
                style={[styles.materialsRow, { backgroundColor: theme.backgroundElement }]}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.materialsItemName}>
                    {payload.quantity} × {payload.productItemName}
                  </ThemedText>
                  {item.status === 'failed' ? (
                    <ThemedText type="small" style={styles.errorText}>
                      {item.lastError}
                    </ThemedText>
                  ) : null}
                </View>
                {item.status === 'failed' ? (
                  <View style={styles.materialsFailedActions}>
                    <Pressable onPress={() => onRetry(item.id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Retry
                      </ThemedText>
                    </Pressable>
                    <Pressable onPress={() => onDiscard(item.id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Discard
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <View style={[styles.materialsStatusPill, { backgroundColor: '#c98a1f' }]}>
                    <ThemedText style={styles.materialsStatusPillText}>
                      {item.status === 'syncing' ? 'Sending…' : 'Queued'}
                    </ThemedText>
                  </View>
                )}
              </View>
            );
          })}

          {requisitions.map((req) => (
            <View key={req.id} style={[styles.materialsRow, { backgroundColor: theme.backgroundElement }]}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.materialsItemName}>{req.title}</ThemedText>
                <ThemedText themeColor="textSecondary" type="small">
                  {req.requisitionNumber}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.materialsStatusPill,
                  { backgroundColor: REQUISITION_STATUS_COLOR[req.status] },
                ]}
              >
                <ThemedText style={styles.materialsStatusPillText}>
                  {REQUISITION_STATUS_LABEL[req.status]}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 60,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  clientName: {
    fontSize: 22,
    lineHeight: 28,
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
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
  },
  notesBox: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  notesText: {
    fontSize: 14,
  },
  elapsed: {
    fontSize: 14,
  },
  completedSummary: {
    gap: 12,
  },
  conflictBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d9342b',
    backgroundColor: '#d9342b18',
    padding: 12,
    gap: 10,
  },
  conflictText: {
    color: '#d9342b',
    fontSize: 14,
  },
  conflictActions: {
    flexDirection: 'row',
    gap: 12,
  },
  conflictButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#d9342b',
  },
  conflictButtonSecondary: {
    backgroundColor: '#8a8a8a',
  },
  conflictButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionButton: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  doneText: {
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
  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
  },
  photosSection: {
    gap: 10,
  },
  photoButtonRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  photoButton: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoTile: {
    width: 96,
    gap: 4,
  },
  photoImage: {
    width: 96,
    height: 96,
    borderRadius: 8,
  },
  photoPlaceholder: {
    backgroundColor: '#8a8a8a44',
  },
  photoDimmed: {
    opacity: 0.55,
  },
  photoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    borderRadius: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  photoBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  photoFailedActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  materialsSection: {
    gap: 10,
  },
  materialsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  materialsRequestButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  materialsList: {
    gap: 8,
  },
  materialsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  materialsItemName: {
    fontSize: 15,
  },
  materialsFailedActions: {
    flexDirection: 'row',
    gap: 14,
  },
  materialsStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  materialsStatusPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
